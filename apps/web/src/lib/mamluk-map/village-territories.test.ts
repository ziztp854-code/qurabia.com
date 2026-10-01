import { describe, expect, it } from 'vitest';
import { pointInArea, validateArea } from '@mamluk/world-map-core/server';
import { buildVillageTerritories } from './village-territories';
import { storeMapRecord } from './storage';

const city = (id: string, longitude: number, latitude = 30) =>
  storeMapRecord({
    id,
    longitude,
    latitude,
    worldId: 'world',
    name: id,
    regionId: 'egypt',
    ownerPlayerId: 'ruler',
    ownerSultanateId: null,
    fortificationLevel: 0,
    strategicValue: 0,
  });
const villages = (ids: string[]) =>
  Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        name: id,
        ownerId: 'ruler',
        buildings: { wall: 0 },
      },
    ]),
  );

describe('authoritative geographic village plots', () => {
  it('gives close persisted centres valid disjoint plots without moving either village', () => {
    const cities = [city('v1', 31), city('v2', 31.000001)];
    const before = structuredClone(cities);
    const plots = buildVillageTerritories('world', cities, villages(['v1', 'v2']));
    expect(plots).toHaveLength(2);
    plots.forEach(({ value }, index) => {
      expect(() => validateArea(value.geometry)).not.toThrow();
      expect(pointInArea(cities[index]!.value, value.geometry)).toBe(true);
    });
    expect(plots[0]!.east).toBeLessThanOrEqual(plots[1]!.west);
    expect(cities).toEqual(before);
  });
  it('rejects ambiguous identity, duplicate centres and foreign-world records', () => {
    const actual = villages(['v1', 'v2']);
    expect(() =>
      buildVillageTerritories('world', [city('v1', 31), city('v1', 32)], actual),
    ).toThrow('identity');
    expect(() =>
      buildVillageTerritories('world', [city('v1', 31), city('v2', 31)], actual),
    ).toThrow('centre');
    expect(() => buildVillageTerritories('other', [city('v1', 31)], actual)).toThrow('world');
    expect(() =>
      buildVillageTerritories('world', Array(100_001).fill(city('v1', 31)), actual),
    ).toThrow('budget');
  });
  it('excludes deleted village records and has deterministic layout independent of input order', () => {
    expect(buildVillageTerritories('world', [city('deleted', 31)], {})).toEqual([]);
    const cities = [city('v1', 31), city('v2', 31.000001), city('v3', 31.000002)];
    const actual = villages(['v1', 'v2', 'v3']);
    const ordered = (values: ReturnType<typeof buildVillageTerritories>) =>
      [...values].sort((a, b) => a.value.id.localeCompare(b.value.id));
    expect(ordered(buildVillageTerritories('world', cities, actual))).toEqual(
      ordered(buildVillageTerritories('world', [...cities].reverse(), actual)),
    );
  });
});

import { describe, expect, it } from 'vitest';
import type { Army, City } from '@mamluk/world-map-core';
import { storeMapRecord } from './storage';
import { boundsGeometry } from '@mamluk/world-map-core/server';

const city: City = {
  id: 'cairo',
  worldId: 'world',
  name: 'القاهرة',
  regionId: 'egypt',
  longitude: 31.2357,
  latitude: 30.0444,
  ownerPlayerId: 'viewer',
  ownerSultanateId: null,
  fortificationLevel: 3,
  strategicValue: 100,
};

describe('persisted geographic map records', () => {
  it('indexes real WGS84 city coordinates without converting legacy tile coordinates', () => {
    expect(storeMapRecord(city)).toMatchObject({
      west: 31.2357,
      east: 31.2357,
      south: 30.0444,
      north: 30.0444,
      value: city,
    });
  });

  it('indexes an army current server position rather than its route destination', () => {
    const army: Army = {
      id: 'army',
      worldId: 'world',
      ownerPlayerId: 'viewer',
      ownerSultanateId: null,
      route: null,
      position: {
        armyId: 'army',
        longitude: 35,
        latitude: 32,
        status: 'stationed',
        origin: null,
        destination: null,
        departureTime: null,
        arrivalTime: null,
      },
    };
    expect(storeMapRecord(army)).toMatchObject({ west: 35, east: 35, south: 32, north: 32 });
  });

  it('copies and freezes the stored value so caller changes cannot alter query metadata', () => {
    const input = { ...city };
    const result = storeMapRecord(input);
    input.longitude = 0;
    expect(result.value.longitude).toBe(31.2357);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it('rejects invalid coordinates and an explicit extent that excludes its feature', () => {
    expect(() => storeMapRecord({ ...city, longitude: 181 })).toThrow();
    expect(() => storeMapRecord(city, { west: 0, east: 1, south: 0, north: 1 })).toThrow();
  });

  it('indexes seam-split areas using crossing bounds without shrinking full-world areas', () => {
    const territory = {
      id: 'territory',
      worldId: 'world',
      regionId: 'earth',
      ownerPlayerId: null,
      ownerSultanateId: null,
      geometry: boundsGeometry({ west: 170, south: -10, east: -170, north: 10 }),
    };
    expect(storeMapRecord(territory)).toMatchObject({
      west: 170,
      south: -10,
      east: -170,
      north: 10,
    });
    expect(
      storeMapRecord({
        ...territory,
        geometry: boundsGeometry({ west: -180, south: -90, east: 180, north: 90 }),
      }),
    ).toMatchObject({ west: -180, south: -90, east: 180, north: 90 });
  });

  it('indexes the area and clones all explicit recipient grant identifiers', () => {
    const grant = {
      region: {
        id: 'watchtower',
        worldId: 'world',
        recipientPlayerId: 'viewer',
        kind: 'watchtower' as const,
        startsAt: 0,
        expiresAt: 1000,
        geometry: boundsGeometry({ west: 30, south: 29, east: 32, north: 31 }),
      },
      visibleTerritoryIds: ['egypt'],
      visibleSultanateTerritoryIds: [],
    };
    const stored = storeMapRecord(grant);
    grant.visibleTerritoryIds.push('secret');
    expect(stored).toMatchObject({ west: 30, south: 29, east: 32, north: 31 });
    expect(stored.value.visibleTerritoryIds).toEqual(['egypt']);
    expect(Object.isFrozen(stored.value.region.geometry.coordinates)).toBe(true);
  });

  it('rejects optional crossing metadata that omits the interior of a broad polygon', () => {
    const territory = {
      id: 'territory',
      worldId: 'world',
      regionId: 'earth',
      ownerPlayerId: null,
      ownerSultanateId: null,
      geometry: boundsGeometry({ west: -170, south: -10, east: 170, north: 10 }),
    };
    expect(() =>
      storeMapRecord(territory, { west: 170, south: -10, east: -170, north: 10 }),
    ).toThrow();
  });
});

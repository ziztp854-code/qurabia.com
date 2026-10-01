import { describe, expect, it } from 'vitest';
import { provisionVillageGeography } from './village-geography';
import { storeMapRecord } from './storage';

const village = (id: string, name = 'عاصمة الحاكم', ownerId = 'ruler') => ({
  id,
  name,
  ownerId,
  x: 900,
  y: -900,
  buildings: { wall: 3 },
});

describe('persisted geographic village allocation', () => {
  it('places an existing village in Cairo using its real identity and preserves game state', () => {
    const state = { villages: { v1: village('v1') }, privateState: { balance: 17 } };
    const result = provisionVillageGeography('world', state);
    expect(result.geography?.cities[0]?.value).toMatchObject({
      id: 'v1',
      name: 'عاصمة الحاكم',
      longitude: 31.24967,
      latitude: 30.06263,
      worldId: 'world',
      ownerPlayerId: 'ruler',
      fortificationLevel: 3,
    });
    expect(result.privateState).toEqual({ balance: 17 });
    expect(state).not.toHaveProperty('geography');
    expect(result.geography?.territories[0]?.value).toMatchObject({
      id: 'v1',
      worldId: 'world',
      ownerPlayerId: 'ruler',
      regionId: 'egypt',
      geometry: { type: 'Polygon' },
    });
  });

  it('upgrades managed points without plots once while preserving every existing coordinate', () => {
    const initial = provisionVillageGeography('world', {
      villages: { v1: village('v1') },
      unrelated: 19,
    });
    const old = {
      ...initial,
      geography: { ...initial.geography!, territories: [], villagePlotsVersion: undefined },
    };
    const upgraded = provisionVillageGeography('world', old);
    expect(upgraded.geography?.territories).toHaveLength(1);
    expect(upgraded.geography?.cities).toEqual(old.geography.cities);
    expect(upgraded.unrelated).toBe(19);
    expect(provisionVillageGeography('world', upgraded)).toBe(upgraded);
    expect(old.geography.territories).toEqual([]);
  });

  it('rejects corrupt village identities before assigning duplicate geographic features', () => {
    expect(() =>
      provisionVillageGeography('world', {
        villages: { v1: village('v1'), another: village('v1') },
      }),
    ).toThrow('identity');
  });
  it('records dense unrepresentable plot omissions so repeated reads stay idempotent', () => {
    const actual = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => {
        const id = `v${index}`;
        return [id, village(id)];
      }),
    );
    const initial = provisionVillageGeography('world', {
      villages: actual,
      unrelated: { revision: 17 },
    });
    const cities = initial.geography!.cities.map((record, index) =>
      storeMapRecord({
        ...record.value,
        longitude: 31 + (index % 3) * 0.000001,
        latitude: 30 + Math.floor(index / 3) * 0.000001,
      }),
    );
    const old = {
      ...initial,
      geography: { ...initial.geography!, cities, territories: [], villagePlotsVersion: undefined },
    };
    const upgraded = provisionVillageGeography('world', old);
    expect(upgraded.geography!.cities).toEqual(cities);
    expect(upgraded.geography!.cities).toHaveLength(9);
    expect(upgraded.geography!.territories).toHaveLength(8);
    expect(upgraded.geography!.omittedVillagePlotIds).toHaveLength(1);
    expect(provisionVillageGeography('world', upgraded)).toBe(upgraded);
    expect(upgraded.unrelated).toEqual({ revision: 17 });
  });
});

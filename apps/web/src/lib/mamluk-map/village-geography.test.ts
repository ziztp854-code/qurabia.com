import { describe, expect, it } from 'vitest';
import { provisionVillageGeography } from './village-geography';

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
  });

  it('rejects corrupt village identities before assigning duplicate geographic features', () => {
    expect(() =>
      provisionVillageGeography('world', {
        villages: { v1: village('v1'), another: village('v1') },
      }),
    ).toThrow('identity');
  });
});

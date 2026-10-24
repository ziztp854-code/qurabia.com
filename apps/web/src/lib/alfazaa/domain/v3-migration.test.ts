import { describe, expect, it } from 'vitest';
import { validateState } from './index';

describe('v3 account save compatibility', () => {
  it('adds the independent systems while preserving a v2 city and received rewards', () => {
    const legacy = {
      version: 2, revision: 7, castleLevel: 3,
      balances: { '400001': 19990, '110001': 220 },
      cells: Array.from({ length: 36 }, (_, index) =>
        index === 1 ? { id: '2', kind: 'troop', cfgId: 10002 }
          : index === 2 ? { id: '4', kind: 'troop', cfgId: 20001 }
            : index === 35 ? { id: '3', kind: 'building', cfgId: 40001 } : null),
      nextId: 5, lastCollectedAt: 1792800000000, updatedAt: 1792800000000,
      completedTowerLevels: [1], battle: null,
      quests: { claimed: ['road-104'], lastDailyClaimDay: 0 },
    };
    const restored = validateState(legacy);
    expect(restored).toMatchObject({
      version: 3, revision: 7, castleLevel: 3,
      balances: { '400001': 19990, '110001': 220 },
      completedTowerLevels: [1], nextId: 5,
      quests: { claimed: ['road-104'], lastDailyClaimDay: 0 },
    });
    expect(restored?.cells[1]).toEqual({ id: '2', kind: 'troop', cfgId: 10002 });
    expect(restored?.cells[35]).toEqual({ id: '3', kind: 'building', cfgId: 40001 });
    expect(restored).toHaveProperty('realm');
    expect(validateState(restored)).toEqual(restored);
  });
});

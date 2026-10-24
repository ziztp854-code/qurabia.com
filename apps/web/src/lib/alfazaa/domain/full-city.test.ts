import { expect, it } from 'vitest';
import { getBuilding, listRecruitableArms } from './catalog';
import { createInitialState, validateState } from './index';

it('supports the source castle progression through level 80 without granting NPCs or rare starter currencies', () => {
  expect(getBuilding(110080)).toMatchObject({ type: 11, level: 80 });
  expect(listRecruitableArms().map(row => row.id)).toEqual([10001, 20001, 30001]);
  const state = createInitialState(1792800000000);
  expect(state.balances).toEqual({ '400001': 20000, '110001': 200 });
  expect(validateState({ ...state, castleLevel: 80 })).not.toBeNull();
});

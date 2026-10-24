import { describe, it, expect } from 'vitest';
import {
  applySystemsCommand,
  createSystemsState,
  getSystemsSnapshot,
  validateSystemsState,
} from './systems-core';
import type { GameplayContext } from './common';
const now = 1800000000000;
describe('research affects real gameplay', () => {
  it('separates sourcehospitalcapacity fromhealth and combines independent sourcebranch effects', () => {
    const state = {
      ...createSystemsState(now),
      research: {
        'college:14': 140001,
        'college:16': 160001,
        'college:17': 170001,
        'college:126': 1280001,
        'science:1200001': 1200002,
        'science:1201001': 1201002,
        'science:1202001': 1202002,
        'science:1203001': 1203002,
        'science:4004001': 4004002,
      },
      wounded: { '10001': 40 },
    };
    expect(validateSystemsState(state)).not.toBeNull();
    const snapshot = getSystemsSnapshot(state, {}, now);
    expect(snapshot.bonuses.attack).toBeCloseTo(0.035);
    expect(snapshot.bonuses.health).toBe(0.18);
    expect(snapshot.bonuses.defense).toBe(0.004);
    expect(snapshot.bonuses.production).toBe(0.03);
    expect(snapshot.bonuses.training).toBe(0.01);
    expect(snapshot.research['1200001']).toBe(0);
    expect(snapshot.research['1200002']).toBe(1);
    const ctx: GameplayContext = {
      now,
      balances: {},
      view: {
        castleLevel: 20,
        playerLevel: 1,
        cells: [{ kind: 'building', cfgId: 50001 }, ...Array(35).fill(null)],
        heroes: [],
        campaignCompleted: [],
        research: snapshot.research,
        lifetime: {},
        daily: {},
      },
      bonuses: snapshot.bonuses,
    };
    const result = applySystemsCommand(
      state,
      { type: 'systems-heal', cfgId: 10001, count: 40 },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.state.jobs[0].finishAt - now).toBe(39000);
    expect(result.state.wounded['10001']).toBe(0);
  });
});

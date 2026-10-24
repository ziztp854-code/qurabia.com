import { describe, it, expect } from 'vitest';
import {
  advanceSystems,
  applySystemsCommand,
  createSystemsState,
  validateSystemsState,
  recordGameEvents,
} from './systems-core';
import type { GameplayContext } from './common';
const now = 1800000000000;
const ctx: GameplayContext = {
  now,
  balances: {},
  view: {
    castleLevel: 5,
    playerLevel: 1,
    cells: Array(36).fill(null),
    heroes: [],
    campaignCompleted: [],
    research: {},
    lifetime: {},
    daily: {},
  },
  bonuses: { attack: 0, defense: 0, health: 0, production: 0, training: 0 },
};
describe('system state and queue boundaries', () => {
  it('retains completed output under full reserve and permits deployment to free space', () => {
    const state = {
      ...createSystemsState(now),
      reserve: { '10001': 100000 },
      jobs: [
        {
          id: 1,
          kind: 'training' as const,
          target: 10001,
          count: 1,
          startedAt: now - 1000,
          finishAt: now,
        },
      ],
      nextJobId: 2,
    };
    const advanced = advanceSystems(state, ctx);
    expect(advanced.ok).toBe(true);
    expect(advanced.state.jobs).toHaveLength(1);
    expect(advanced.balances['1200001'] ?? 0).toBe(0);
    const deployed = applySystemsCommand(
      advanced.state,
      { type: 'systems-deploy', cfgId: 10001 },
      ctx,
    );
    expect(deployed.ok).toBe(true);
    expect(deployed.state.reserve['10001']).toBe(99999);
    const completed = advanceSystems(deployed.state, { ...ctx, balances: deployed.balances });
    expect(completed.state.jobs).toHaveLength(0);
    expect(completed.state.reserve['10001']).toBe(100000);
    expect(completed.balances['1200001']).toBe(3);
  });
  it('validates factory snapshots and rejects invented resources, IDs, wrong slots and malformed claims', () => {
    const state = createSystemsState(now);
    expect(validateSystemsState(state)).toEqual(state);
    for (const patch of [
      { reserve: { '99999999': 1 } },
      { beasts: { '1': 101 } },
      { claims: ['road:104:extra'] },
      { research: { 'college:14': 9999 } },
      { equippedRelics: [3601001], relics: {} },
      { day: 1 },
      { boxes: [4] },
    ])
      expect(validateSystemsState({ ...state, ...patch })).toBeNull();
  });
  it('does not allow malformed commands or backward clocks to partially mutate queued state', () => {
    const state = createSystemsState(now);
    for (const command of [
      { type: 'systems-train', cfgId: 10001, count: -1 },
      { type: 'systems-tick', grant: 1000 },
    ]) {
      const result = applySystemsCommand(state, command as never, ctx);
      expect(result.ok).toBe(false);
      expect(result.state).toEqual(state);
    }
    expect(advanceSystems(state, { ...ctx, now: now - 1 }).ok).toBe(false);
    expect(() => recordGameEvents(state, [{ type: 'merge', amount: NaN }], now)).toThrow();
  });
});

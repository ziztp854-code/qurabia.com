import { describe, it, expect } from 'vitest';
import { getResearchOffers } from './systems-research';
import { applySystemsCommand, advanceSystems, createSystemsState } from './systems-core';
import type { GameplayContext } from './common';
const now = 1800000000000;
const ctx: GameplayContext = {
  now,
  balances: { '430001': 10000000, '450001': 10000000, '1200001': 100000000000 },
  view: {
    castleLevel: 100,
    playerLevel: 80,
    cells: Array(36).fill(null),
    heroes: [],
    campaignCompleted: [],
    research: {},
    lifetime: {},
    daily: {},
  },
  bonuses: { attack: 0, defense: 0, health: 0, production: 0, training: 0 },
};
describe('source science branch identity', () => {
  it('keeps99NextId chains independent even when their buff Type is the same', () => {
    const state = createSystemsState(now);
    expect(getResearchOffers(state, ctx).filter((r) => r.tree === 'science')).toHaveLength(99);
    const a = applySystemsCommand(
      state,
      { type: 'systems-research', tree: 'science', id: 1200002 },
      ctx,
    );
    expect(a.ok).toBe(true);
    const done = advanceSystems(a.state, { ...ctx, balances: a.balances, now: now + 60000 });
    expect(done.ok).toBe(true);
    const b = applySystemsCommand(
      done.state,
      { type: 'systems-research', tree: 'science', id: 1207002 },
      { ...ctx, balances: done.balances, now: now + 60000 },
    );
    expect(b.ok).toBe(true);
    expect(b.state.jobs[0].target).toBe(1207002);
    expect(b.state.research['science:1200001']).toBe(1200002);
  });
});

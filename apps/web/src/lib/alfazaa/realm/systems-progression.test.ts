import { describe, it, expect } from 'vitest';
import { applySystemsCommand, createSystemsState, advanceSystems } from './systems-core';
import type { GameplayContext } from './common';
const now = 1_800_000_000_000;
const context: GameplayContext = {
  now,
  balances: { '110056': 10, '110055': 3 },
  view: {
    castleLevel: 20,
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
describe('progression public commands', () => {
  it('hatches source companion2 after8hours, charges eggs once, then feeds one spirit', () => {
    const state = createSystemsState(now),
      started = applySystemsCommand(state, { type: 'systems-beast-hatch', beastId: 2 }, context);
    expect(started.ok).toBe(true);
    expect(started.balances['110056']).toBe(0);
    expect(started.state.beasts[2] ?? 0).toBe(0);
    const done = advanceSystems(started.state, {
      ...context,
      balances: started.balances,
      now: now + 28800000,
    });
    expect(done.state.beasts[2]).toBe(1);
    const fed = applySystemsCommand(
      done.state,
      { type: 'systems-beast-feed', beastId: 2 },
      { ...context, balances: done.balances, now: now + 28800000 },
    );
    expect(fed.ok).toBe(true);
    expect(fed.state.beasts[2]).toBe(2);
    expect(fed.balances['110055']).toBe(2);
  });
  it('equips source relic, replaces same slot without duplicating, and dismantles once', () => {
    const ctx = { ...context, balances: { '3601001': 1, '3601002': 1 } },
      state = createSystemsState(now);
    const a = applySystemsCommand(state, { type: 'systems-relic-equip', relicId: 3601001 }, ctx);
    expect(a.ok).toBe(true);
    const b = applySystemsCommand(
      a.state,
      { type: 'systems-relic-equip', relicId: 3601002 },
      { ...ctx, balances: a.balances },
    );
    expect(b.ok).toBe(true);
    expect(b.state.equippedRelics).toEqual([3601002]);
    expect(b.state.relics[3601001]).toBe(1);
    const c = applySystemsCommand(
      b.state,
      { type: 'systems-relic-dismantle', relicId: 3601001 },
      { ...ctx, balances: b.balances },
    );
    expect(c.ok).toBe(true);
    expect(c.balances['112001']).toBe(1);
    expect(
      applySystemsCommand(
        c.state,
        { type: 'systems-relic-dismantle', relicId: 3601001 },
        { ...ctx, balances: c.balances },
      ).ok,
    ).toBe(false);
  });
});

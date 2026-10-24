import { describe, it, expect } from 'vitest';
import { getExchangeOffers } from './systems-shop';
import { applySystemsCommand, createSystemsState } from './systems-core';
import heroes from './data/hero-gameplay.json';
import type { GameplayContext } from './common';
describe('progression supply reachability', () => {
  it('supplies all57hero fragments and essential equipment/relic materials but excludes gold packs', () => {
    const offers = new Set(getExchangeOffers().map((x) => x.itemId));
    for (const hero of heroes.heroes) expect(offers.has(hero.fragment)).toBe(true);
    for (const id of [800081, 110021, 110026, 110119, 110100, 110101, 3601001])
      expect(offers.has(id)).toBe(true);
    for (const id of [400001, 410001, 1200001, 100024]) expect(offers.has(id)).toBe(false);
  });
  it('buys hero fragment with virtual gold and cannot buy free gold via resource pack', () => {
    const now = 1800000000000,
      state = createSystemsState(now),
      ctx: GameplayContext = {
        now,
        balances: { '400001': 10000 },
        view: {
          castleLevel: 3,
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
    const result = applySystemsCommand(
      state,
      { type: 'systems-exchange', itemId: 720001, count: 1 },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.balances['720001']).toBe(1);
    expect(result.balances['400001']).toBeLessThan(10000);
    expect(
      applySystemsCommand(state, { type: 'systems-exchange', itemId: 100024, count: 1 }, ctx).ok,
    ).toBe(false);
  });
});

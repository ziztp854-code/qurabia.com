import { describe, it, expect } from 'vitest';
import { applySystemsCommand, createSystemsState, recordGameEvents } from './systems-core';
import type { GameplayContext } from './common';
const now = 1_800_000_000_000;
const context: GameplayContext = {
  now,
  balances: {},
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
describe('scheduled independent PvE events', () => {
  it('awards daily campaign tier only for real battle wins, once per Riyadh day', () => {
    const empty = createSystemsState(now);
    expect(
      applySystemsCommand(
        empty,
        { type: 'systems-event-claim', eventId: 'daily-campaign', tier: 0 },
        context,
      ).ok,
    ).toBe(false);
    const earned = recordGameEvents(empty, [{ type: 'battle-win', amount: 1 }], now);
    const a = applySystemsCommand(
      earned,
      { type: 'systems-event-claim', eventId: 'daily-campaign', tier: 0 },
      context,
    );
    expect(a.ok).toBe(true);
    expect(a.balances['110021']).toBe(2);
    expect(
      applySystemsCommand(
        a.state,
        { type: 'systems-event-claim', eventId: 'daily-campaign', tier: 0 },
        { ...context, balances: a.balances },
      ).ok,
    ).toBe(false);
    expect(
      applySystemsCommand(
        a.state,
        { type: 'systems-event-claim', eventId: 'daily-campaign', tier: 0 },
        { ...context, balances: a.balances, now: now + 86400000 },
      ).ok,
    ).toBe(false);
  });
});

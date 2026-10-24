import { describe, expect, it } from 'vitest';
import { applySystemsCommand, createSystemsState, recordGameEvents } from './systems-core';
import type { GameplayContext } from './common';
const now = 1_800_000_000_000;
const context: GameplayContext = {
  now,
  balances: { '400001': 1000 },
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
describe('quest claims through public commands', () => {
  it('separates road and plot IDs, gates chapters and refuses repeat rewards', () => {
    const state = createSystemsState(now);
    const claimed = applySystemsCommand(
      state,
      { type: 'systems-claim', family: 'road', id: 104 },
      context,
    );
    expect(claimed.ok).toBe(true);
    expect(claimed.state.claims).toEqual(['road:104']);
    expect(claimed.balances['110001']).toBe(50);
    const repeated = applySystemsCommand(
      claimed.state,
      { type: 'systems-claim', family: 'road', id: 104 },
      { ...context, balances: claimed.balances },
    );
    expect(repeated.ok).toBe(false);
    expect(repeated.balances).toEqual(claimed.balances);
    const gated = applySystemsCommand(
      claimed.state,
      { type: 'systems-claim', family: 'road', id: 301 },
      { ...context, balances: claimed.balances },
    );
    expect(gated.ok).toBe(false);
  });
  it('rejects daily boxes before enough completed daily claims without consuming anything', () => {
    const state = recordGameEvents(
      createSystemsState(now),
      [{ type: 'recruit', target: 10001, amount: 1000 }],
      now,
    );
    const result = applySystemsCommand(state, { type: 'systems-daily-box', index: 0 }, context);
    expect(result.ok).toBe(false);
    expect(result.state).toEqual(state);
    expect(result.balances).toEqual(context.balances);
  });
});

import { describe, it, expect } from 'vitest';
import { applySystemsCommand, createSystemsState } from './systems-core';
import type { GameplayContext } from './common';
const now = 1800000000000;
const ctx = (balances: Record<string, number>): GameplayContext => ({
  now,
  balances,
  view: {
    castleLevel: 2,
    playerLevel: 1,
    cells: Array(36).fill(null),
    heroes: [],
    campaignCompleted: [],
    research: {},
    lifetime: {},
    daily: {},
  },
  bonuses: { attack: 0, defense: 0, health: 0, production: 0, training: 0 },
});
describe('source nested and selected loot', () => {
  it('opens parent200039 into all4rewards including2selectableboxes, never treats description as a choice flag', () => {
    const result = applySystemsCommand(
      createSystemsState(now),
      { type: 'systems-use', itemId: 200039, count: 1 },
      ctx({ '200039': 1 }),
    );
    expect(result.ok).toBe(true);
    expect(result.balances).toEqual({
      '200039': 0,
      '110020': 2,
      '400020': 2,
      '202003': 2,
      '100003': 1,
    });
  });
  it('uses real sourcechoicebox117 to select1of2items and consumes exactlyone202003', () => {
    const state = createSystemsState(now),
      context = ctx({ '202003': 2 });
    expect(
      applySystemsCommand(state, { type: 'systems-use', itemId: 202003, count: 1 }, context).ok,
    ).toBe(false);
    const result = applySystemsCommand(
      state,
      { type: 'systems-use', itemId: 202003, count: 1, choice: 1 },
      context,
    );
    expect(result.ok).toBe(true);
    expect(result.balances).toEqual({ '202003': 1, '203003': 1 });
  });
  it('recursively resolves nested sourceDropList integer IDs', () => {
    const result = applySystemsCommand(
      createSystemsState(now),
      { type: 'systems-use', itemId: 200076, count: 1 },
      ctx({ '200076': 1 }),
    );
    expect(result.ok).toBe(true);
    expect(result.balances).toEqual({ '200076': 0, '200127': 100, '420001': 500 });
  });
  it('resolves weightedloot reproducibly from trusted context, not client selected outcomes', () => {
    const state = createSystemsState(now),
      context = ctx({ '400069': 1 });
    const a = applySystemsCommand(
        state,
        { type: 'systems-use', itemId: 400069, count: 1 },
        context,
      ),
      b = applySystemsCommand(state, { type: 'systems-use', itemId: 400069, count: 1 }, context);
    expect(a.ok).toBe(true);
    expect(a.balances).toEqual(b.balances);
    expect(a.balances['400069']).toBe(0);
    expect(
      applySystemsCommand(
        state,
        { type: 'systems-use', itemId: 400069, count: 1, choice: 0 },
        context,
      ).ok,
    ).toBe(false);
  });
});

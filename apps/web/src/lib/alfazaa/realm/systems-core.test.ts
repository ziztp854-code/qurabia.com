import { describe, expect, it } from 'vitest';
import { applySystemsCommand, createSystemsState, advanceSystems } from './systems-core';
import type { GameplayContext } from './common';
const now = 1_800_000_000_000;
const context = (castleLevel = 2): GameplayContext => ({
  now,
  balances: { '400001': 1000, '110001': 10 },
  view: {
    castleLevel,
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
describe('independent systems public commands', () => {
  it('refuses source research before castle2 without a partial charge', () => {
    const state = createSystemsState(now);
    const ctx = context(1);
    const result = applySystemsCommand(
      state,
      { type: 'systems-research', tree: 'college', id: 140001 },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.state).toEqual(state);
    expect(result.balances).toEqual({ '400001': 1000, '110001': 10 });
  });
  it('researches preparation1 for the source2blueprints +12gold +2LvGold and awards10playerXP once', () => {
    const state = createSystemsState(now),
      ctx = context();
    const result = applySystemsCommand(
      state,
      { type: 'systems-research', tree: 'college', id: 140001 },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.balances).toEqual({ '400001': 986, '110001': 8, '1200001': 10 });
    expect(result.state.research['college:14']).toBe(140001);
    const repeat = applySystemsCommand(
      result.state,
      { type: 'systems-research', tree: 'college', id: 140001 },
      { ...ctx, balances: result.balances },
    );
    expect(repeat.ok).toBe(false);
    expect(repeat.balances).toEqual(result.balances);
    expect(state.research).toEqual({});
  });
  it('charges queued infantry once and delivers2 reserve units only after2source seconds', () => {
    const state = createSystemsState(now),
      ctx = context();
    ctx.view.cells = [{ kind: 'building', cfgId: 10001 }, ...Array(35).fill(null)];
    const started = applySystemsCommand(
      state,
      { type: 'systems-train', cfgId: 10001, count: 2 },
      ctx,
    );
    expect(started.ok).toBe(true);
    expect(started.balances['400001']).toBe(980);
    expect(started.state.reserve['10001'] ?? 0).toBe(0);
    const early = advanceSystems(started.state, {
      ...ctx,
      balances: started.balances,
      now: now + 1999,
    });
    expect(early.state.reserve['10001'] ?? 0).toBe(0);
    const done = advanceSystems(early.state, { ...ctx, balances: early.balances, now: now + 2000 });
    expect(done.state.reserve['10001']).toBe(2);
    expect(done.balances['1200001']).toBe(6);
    const repeated = advanceSystems(done.state, {
      ...ctx,
      balances: done.balances,
      now: now + 9000,
    });
    expect(repeated.state.reserve['10001']).toBe(2);
    expect(repeated.balances['1200001']).toBe(6);
  });
  it('crafts source recipe1 from3 of510001 into1 of510002 and refuses underpayment atomically', () => {
    const state = createSystemsState(now),
      ctx = context();
    const short = applySystemsCommand(
      state,
      { type: 'systems-craft', recipeId: 1, count: 1 },
      { ...ctx, balances: { '510001': 2 } },
    );
    expect(short.ok).toBe(false);
    expect(short.balances).toEqual({ '510001': 2 });
    const result = applySystemsCommand(
      state,
      { type: 'systems-craft', recipeId: 1, count: 1 },
      { ...ctx, balances: { '510001': 3 } },
    );
    expect(result.ok).toBe(true);
    expect(result.balances).toEqual({ '510001': 0, '510002': 1 });
    expect(result.state.lifetime.craft).toBe(1);
  });
  it('opens source100024 chest into all70wealthchests10speedups1summon withno rewardreplay', () => {
    const state = createSystemsState(now),
      ctx = { ...context(), balances: { '100024': 1 } };
    const opened = applySystemsCommand(
      state,
      { type: 'systems-use', itemId: 100024, count: 1 },
      ctx,
    );
    expect(opened.ok).toBe(true);
    expect(opened.balances).toEqual({ '100024': 0, '800015': 70, '100001': 10, '110019': 1 });
    const repeat = applySystemsCommand(
      opened.state,
      { type: 'systems-use', itemId: 100024, count: 1 },
      { ...ctx, balances: opened.balances },
    );
    expect(repeat.ok).toBe(false);
    expect(repeat.balances).toEqual(opened.balances);
  });
  it('purchases sourceoffer38 for12gems and enforcesdaily limit until the nextRiyadhday', () => {
    const ctx = { ...context(), balances: { '420001': 24 } },
      state = createSystemsState(now);
    const bought = applySystemsCommand(state, { type: 'systems-buy', offerId: 38, count: 1 }, ctx);
    expect(bought.ok).toBe(true);
    expect(bought.balances).toEqual({ '420001': 12, '110001': 2 });
    const repeat = applySystemsCommand(
      bought.state,
      { type: 'systems-buy', offerId: 38, count: 1 },
      { ...ctx, balances: bought.balances },
    );
    expect(repeat.ok).toBe(false);
    const tomorrow = applySystemsCommand(
      bought.state,
      { type: 'systems-buy', offerId: 38, count: 1 },
      { ...ctx, balances: bought.balances, now: now + 86400000 },
    );
    expect(tomorrow.ok).toBe(true);
    expect(tomorrow.balances).toEqual({ '420001': 0, '110001': 4 });
  });
});

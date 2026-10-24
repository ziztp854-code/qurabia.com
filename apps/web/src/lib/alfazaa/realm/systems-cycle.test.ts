import { describe, it, expect } from 'vitest';
import {
  applySystemsCommand,
  advanceSystems,
  createSystemsState,
  recordGameEvents,
  validateSystemsState,
  getSystemsSnapshot,
} from './systems-core';
import { getQuestViews } from './systems-quests';
import type { GameplayContext } from './common';
const now = 1800000000000;
const context = (balances: Record<string, number> = {}): GameplayContext => ({
  now,
  balances,
  view: {
    castleLevel: 20,
    playerLevel: 10,
    cells: Array(36).fill(null),
    heroes: [],
    campaignCompleted: [],
    research: {},
    lifetime: {},
    daily: {},
  },
  bonuses: { attack: 0, defense: 0, health: 0, production: 0, training: 0 },
});
describe('connected queues and player daily cycle', () => {
  it('selects10role-eligible daily tasks, pays all10 once and allboxes at1/3/6/10 thresholds', () => {
    let ctx = context({ '1200001': 307170 }),
      state = createSystemsState(now);
    const selected = applySystemsCommand(state, { type: 'systems-tick' }, ctx);
    state = selected.state;
    expect(state.dailyChoices).toHaveLength(10);
    const views = getQuestViews(state, ctx, 'daily').filter((q) =>
      state.dailyChoices.includes(q.id),
    );
    for (const quest of views) {
      const [type, target] = quest.binding.split(':');
      state = recordGameEvents(
        state,
        [{ type, amount: quest.goal, ...(target ? { target: +target } : {}) }],
        now,
      );
    }
    for (const id of state.dailyChoices) {
      const result = applySystemsCommand(
        state,
        { type: 'systems-claim', family: 'daily', id },
        ctx,
      );
      expect(result.ok).toBe(true);
      state = result.state;
      ctx = { ...ctx, balances: result.balances };
      const repeat = applySystemsCommand(
        state,
        { type: 'systems-claim', family: 'daily', id },
        ctx,
      );
      expect(repeat.ok).toBe(false);
      expect(repeat.balances).toEqual(ctx.balances);
    }
    expect(state.dailyClaims).toHaveLength(10);
    for (let index = 0; index < 4; index++) {
      const result = applySystemsCommand(state, { type: 'systems-daily-box', index }, ctx);
      expect(result.ok).toBe(true);
      state = result.state;
      ctx = { ...ctx, balances: result.balances };
    }
    expect(ctx.balances['420001']).toBe(50);
    expect(state.boxes).toEqual([0, 1, 2, 3]);
    expect(validateSystemsState(state)).not.toBeNull();
    const tomorrow = applySystemsCommand(
      state,
      { type: 'systems-tick' },
      { ...ctx, now: now + 86400000 },
    );
    expect(tomorrow.state.dailyClaims).toEqual([]);
    expect(tomorrow.state.boxes).toEqual([]);
    expect(tomorrow.balances).toEqual(ctx.balances);
  });
  it('heals the real wounded ledger into reserve, then refuses deployment into a full city', () => {
    let state = recordGameEvents(
      createSystemsState(now),
      [{ type: 'troop-wounded', amount: 2, target: 10001 }],
      now,
    );
    const ctx = context();
    ctx.view.cells = [{ kind: 'building', cfgId: 50001 }, ...Array(35).fill(null)];
    const start = applySystemsCommand(state, { type: 'systems-heal', cfgId: 10001, count: 2 }, ctx);
    expect(start.ok).toBe(true);
    expect(start.state.wounded['10001']).toBe(0);
    const done = advanceSystems(start.state, { ...ctx, balances: start.balances, now: now + 2000 });
    state = done.state;
    expect(state.reserve['10001']).toBe(2);
    const full = {
      ...ctx,
      now: now + 2000,
      balances: done.balances,
      view: { ...ctx.view, cells: Array(36).fill({ kind: 'troop', cfgId: 10001 }) },
    };
    expect(applySystemsCommand(state, { type: 'systems-deploy', cfgId: 10001 }, full).ok).toBe(
      false,
    );
    expect(state.reserve['10001']).toBe(2);
  });
  it('spends speedups only on active jobs and delivers the correct100units once', () => {
    const ctx = context({ '400001': 10000, '100001': 1 });
    ctx.view.cells = [{ kind: 'building', cfgId: 10001 }, ...Array(35).fill(null)];
    const trained = applySystemsCommand(
      createSystemsState(now),
      { type: 'systems-train', cfgId: 10001, count: 100 },
      ctx,
    );
    expect(trained.ok).toBe(true);
    const sped = applySystemsCommand(
      trained.state,
      { type: 'systems-speedup', jobId: 1, itemId: 100001, count: 1 },
      { ...ctx, balances: trained.balances },
    );
    expect(sped.ok).toBe(true);
    expect(sped.balances['100001']).toBe(0);
    const done = advanceSystems(sped.state, { ...ctx, balances: sped.balances });
    expect(done.state.reserve['10001']).toBe(100);
    expect(done.balances['1200001']).toBe(300);
    expect(
      applySystemsCommand(
        done.state,
        { type: 'systems-speedup', jobId: 1, itemId: 100001, count: 1 },
        { ...ctx, balances: done.balances },
      ).ok,
    ).toBe(false);
  });
  it('charges independent destroyer training and source relic upgrade costs, applying real bonuses', () => {
    const ctx = context({ '110001': 10, '3601001': 1, '112002': 10 });
    const a = applySystemsCommand(
      createSystemsState(now),
      { type: 'systems-destroyer-upgrade' },
      ctx,
    );
    expect(a.ok).toBe(true);
    expect(a.balances['110001']).toBe(5);
    const b = applySystemsCommand(
      a.state,
      { type: 'systems-relic-equip', relicId: 3601001 },
      { ...ctx, balances: a.balances },
    );
    const c = applySystemsCommand(
      b.state,
      { type: 'systems-relic-upgrade', relicId: 3601001 },
      { ...ctx, balances: b.balances },
    );
    expect(c.ok).toBe(true);
    expect(c.balances['112002']).toBe(0);
    expect(c.state.relics['3601001']).toBe(2);
    const snapshot = getSystemsSnapshot(c.state, c.balances, now);
    expect(snapshot.bonuses.attack).toBe(0.005);
    expect(snapshot.bonuses.health).toBe(0.01);
  });
});

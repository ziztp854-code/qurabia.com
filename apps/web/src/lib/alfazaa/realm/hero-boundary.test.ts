import { describe, it, expect } from 'vitest';
import {
  applyHeroCommand,
  createHeroState,
  getHeroCatalog,
  validateHeroState,
  advanceHeroState,
  getHeroSnapshot,
} from './hero-core';
import type { HeroCommand } from './hero-types';
import type { GameplayContext } from './common';
const ctx = (balances: Record<string, number> = {}, now = 1000): GameplayContext => ({
  now,
  balances,
  view: {
    castleLevel: 1,
    playerLevel: 1,
    cells: [{ kind: 'troop', cfgId: 10001 }],
    heroes: [],
    campaignCompleted: [],
    research: {},
    lifetime: {},
    daily: {},
  },
  bonuses: { attack: 0, defense: 0, health: 0, production: 0, training: 0 },
});
describe('hero command rejection and recovery', () => {
  it('awards the source expedition chapter1 reward420001x10 only at its fifth first clear', () => {
    const state = createHeroState(1000);
    state.completed.expedition = [2, 4, 6, 8];
    const context = ctx();
    context.view = { ...context.view, cells: [{ kind: 'troop', cfgId: 10082 }] };
    const result = applyHeroCommand(
      state,
      { type: 'hero-battle', mode: 'expedition', stageId: 10 },
      context,
    );
    expect(result.ok).toBe(true);
    expect(result.state.lastBattle?.won).toBe(true);
    expect(result.balances['420001']).toBe(10);
    expect(result.events).toContainEqual({type:'expedition-win',amount:1,target:5,level:5});
    expect(result.events).toContainEqual({type:'expedition-attempt',amount:1,target:10});
    const repeat = applyHeroCommand(
      result.state,
      { type: 'hero-battle', mode: 'expedition', stageId: 10 },
      { ...context, balances: result.balances },
    );
    expect(repeat.balances['420001']).toBe(10);
  });
  it('rejects forged born skills, duplicates and learned levels above the star cap', () => {
    const state = createHeroState(1000);
    const altered = structuredClone(state);
    altered.roster['62003'].skills[0] = { id: 1000001, level: 1, xp: 0 };
    expect(validateHeroState(altered)).toBeNull();
    const duplicate = structuredClone(state);
    duplicate.roster['62003'].level = 40;
    duplicate.roster['62003'].skills[1] = duplicate.roster['62003'].skills[0];
    expect(validateHeroState(duplicate)).toBeNull();
  });
  it.each<HeroCommand>([
    { type: 'hero-recruit', heroId: 62003 },
    { type: 'hero-recruit', heroId: 1 },
    { type: 'hero-train', heroId: 65001, itemId: 110021, count: 1 },
    { type: 'hero-train', heroId: 62003, itemId: 1, count: 1 },
    { type: 'hero-star', heroId: 65001 },
    { type: 'hero-star', heroId: 62003 },
    { type: 'hero-skill', heroId: 62003, slot: 0 },
    { type: 'hero-skill', heroId: 62003, slot: 1 },
    { type: 'hero-equip', heroId: 62003, itemId: 1 },
    { type: 'hero-equip-upgrade', heroId: 62003 },
    { type: 'hero-craft-gear', itemId: 1 },
    { type: 'hero-formation', heroIds: [65001], troopCells: [0] },
    { type: 'hero-formation', heroIds: [62003], troopCells: [1] },
    { type: 'hero-battle', mode: 'campaign', stageId: 165 },
    { type: 'hero-battle', mode: 'campaign', stageId: 999999 },
    { type: 'hero-rest' },
  ])('rejects unavailable command atomically: %j', (command) => {
    const state = createHeroState(1000),
      context = ctx();
    const result = applyHeroCommand(state, command, context);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.balances).toBe(context.balances);
    expect(result.events).toEqual([]);
  });
  it('preserves the last surviving troop in the wounded ledger after defeat', () => {
    const state = createHeroState(1000);
    const result = applyHeroCommand(
      state,
      { type: 'hero-battle', mode: 'expedition', stageId: 2 },
      ctx(),
    );
    expect(result.ok).toBe(true);
    expect(result.state.lastBattle?.won).toBe(false);
    expect(result.state.lastBattle?.injuries).toEqual([{ cell: 0, cfgId: 10001 }]);
    expect(result.events).toContainEqual({
      type: 'troop-wounded',
      amount: 1,
      target: 10001,
      cell: 0,
    });
    expect(result.state.completed.expedition).toEqual([]);
    expect(result.events).toContainEqual({type:'expedition-attempt',amount:1,target:2});
    expect(validateHeroState(result.state)).not.toBeNull();
  });
  it('does not spend stamina without troops and regenerates fractional time consistently', () => {
    const state = { ...createHeroState(1000), stamina: 0 };
    expect(
      applyHeroCommand(state, { type: 'hero-battle', mode: 'campaign', stageId: 1 }, ctx()).code,
    ).toBe('LOW_STAMINA');
    const ready = advanceHeroState(state, 901001);
    expect(ready.stamina).toBe(3);
    expect(ready.staminaAt).toBe(901000);
    const context = ctx({}, 901001);
    context.view = { ...context.view, cells: [] };
    expect(
      applyHeroCommand(ready, { type: 'hero-battle', mode: 'campaign', stageId: 1 }, context).code,
    ).toBe('NO_ARMY');
    expect(() => advanceHeroState(ready, 1)).toThrow('INVALID_TIME');
    const nextDay = advanceHeroState({ ...ready, restPurchases: 3 }, 86401000);
    expect(nextDay.restPurchases).toBe(0);
    expect(nextDay.stamina).toBe(100);
  });
  it('refunds source60percent skill XP and the actual book without granting skill progress', () => {
    const initial = createHeroState(1000);
    const recruited = applyHeroCommand(
      initial,
      { type: 'hero-recruit', heroId: 65001 },
      ctx({ '750001': 10, '110024': 9, '1000001': 1, '110026': 67 }),
    );
    const trained = applyHeroCommand(
      recruited.state,
      { type: 'hero-train', heroId: 65001, itemId: 110024, count: 9 },
      ctx(recruited.balances),
    );
    const learned = applyHeroCommand(
      trained.state,
      { type: 'hero-skill', heroId: 65001, slot: 1, skillId: 1000001 },
      ctx(trained.balances),
    );
    const upgraded = applyHeroCommand(
      learned.state,
      { type: 'hero-skill', heroId: 65001, slot: 1 },
      ctx(learned.balances),
    );
    const forgotten = applyHeroCommand(
      upgraded.state,
      { type: 'hero-skill-forget', heroId: 65001, slot: 1 },
      ctx(upgraded.balances),
    );
    expect(forgotten.ok).toBe(true);
    expect(forgotten.balances['1000001']).toBe(1);
    expect(forgotten.balances['110026']).toBe(40);
    expect(forgotten.state.roster['65001'].skills[1]).toBeNull();
    expect(forgotten.events.some((x) => x.type === 'hero-skill')).toBe(false);
  });
  it('keeps equipment levels when swapping between owned heroes', () => {
    const equipped = applyHeroCommand(
      createHeroState(1000),
      { type: 'hero-equip', heroId: 62003, itemId: 1710101 },
      ctx({ '1710101': 1, '1710102': 1, '110100': 4, '110101': 2, '750001': 10 }),
    );
    const upgraded = applyHeroCommand(
      equipped.state,
      { type: 'hero-equip-upgrade', heroId: 62003 },
      ctx(equipped.balances),
    );
    const swapped = applyHeroCommand(
      upgraded.state,
      { type: 'hero-equip', heroId: 62003, itemId: 1710102 },
      ctx(upgraded.balances),
    );
    const recruited = applyHeroCommand(
      swapped.state,
      { type: 'hero-recruit', heroId: 65001 },
      ctx(swapped.balances),
    );
    const reused = applyHeroCommand(
      recruited.state,
      { type: 'hero-equip', heroId: 65001, itemId: 1710101 },
      ctx(recruited.balances),
    );
    expect(reused.ok).toBe(true);
    expect(reused.state.spareEquipment).toEqual([]);
    expect(getHeroSnapshot(reused.state).find((x) => x.id === 65001)?.equipment).toEqual({
      itemId: 1710101,
      level: 1,
      quality: 2,
    });
    expect(validateHeroState(reused.state)).not.toBeNull();
  });
  it('rejects malformed wallets and unknown command fields without changing state', () => {
    const state = createHeroState(1000);
    expect(applyHeroCommand(state, { type: 'hero-rest' }, ctx({ '400001': NaN })).ok).toBe(false);
    expect(
      applyHeroCommand(
        state,
        { type: 'hero-battle', mode: 'campaign', stageId: 1, seed: 1 } as never,
        ctx(),
      ).ok,
    ).toBe(false);
    expect(getHeroCatalog().meta.rulesVersion).toBe(1);
  });
});

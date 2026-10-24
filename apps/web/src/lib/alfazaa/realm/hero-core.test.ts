import { describe, expect, it } from 'vitest';
import {
  applyHeroCommand,
  createHeroState,
  getHeroStats,
  validateHeroState,
  getHeroCatalog,
  getHeroSnapshot,
} from './hero-core';
import type { GameplayContext } from './common';
const context = (balances: Record<string, number>, now = 1000): GameplayContext => ({
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
describe('owned hero public commands', () => {
  it('exposes source monster100001 and bounded NPC modes with separate clear ledgers', () => {
    const catalog = getHeroCatalog();
    expect(catalog.modes.map((x) => x.id)).toContain('monster');
    expect(catalog.modes.find((x) => x.id === 'monster')?.stages[0].id).toBe(100001);
    const result = applyHeroCommand(
      createHeroState(1000),
      { type: 'hero-battle', mode: 'monster', stageId: 100001 },
      context({}),
    );
    expect(result.ok).toBe(true);
    expect(result.state.lastBattle?.mode).toBe('monster');
    expect(validateHeroState(result.state)).not.toBeNull();
    expect(getHeroSnapshot(result.state)[0].rarity).toBe(2);
  });
  it('buys rest with source gold400001 and enforces a Riyadh daily limit', () => {
    let state = { ...createHeroState(1000), stamina: 50 };
    let balances = { '400001': 2000 };
    for (let i = 0; i < 3; i++) {
      const result = applyHeroCommand(state, { type: 'hero-rest' }, context(balances));
      expect(result.ok).toBe(true);
      state = result.state;
      balances = result.balances as typeof balances;
    }
    expect(state.stamina).toBe(80);
    expect(balances['400001']).toBe(500);
    expect(applyHeroCommand(state, { type: 'hero-rest' }, context(balances)).code).toBe(
      'REST_LIMIT',
    );
  });
  it('round-trips a real2026 epoch without applying resource caps to time', () => {
    expect(validateHeroState(createHeroState(1_792_800_000_000))).not.toBeNull();
  });
  it('starts with William once and preserves the other 56 as recruitable heroes', () => {
    const state = createHeroState(1_000);
    expect(Object.keys(state.roster)).toEqual(['62003']);
    expect(state.roster['62003']).toMatchObject({ id: 62003, level: 1, xp: 0, star: 0 });
    expect(state.party).toEqual([62003]);
    expect(state.stamina).toBe(100);
  });
  it('recruits Alexander for ten fragments and applies current-level source XP thresholds', () => {
    const initial = createHeroState(1000);
    const recruited = applyHeroCommand(
      initial,
      { type: 'hero-recruit', heroId: 65001 },
      context({ '750001': 10, '110021': 2 }),
    );
    expect(recruited.ok).toBe(true);
    expect(recruited.balances['750001']).toBe(0);
    const trained = applyHeroCommand(
      recruited.state,
      { type: 'hero-train', heroId: 65001, itemId: 110021, count: 1 },
      context(recruited.balances),
    );
    expect(trained.state.roster['65001']).toMatchObject({ level: 1, xp: 300 });
    const next = applyHeroCommand(
      trained.state,
      { type: 'hero-train', heroId: 65001, itemId: 110021, count: 1 },
      context(trained.balances),
    );
    expect(next.state.roster['65001']).toMatchObject({ level: 2, xp: 250 });
    expect(next.balances['110021']).toBe(0);
    expect(initial.roster['65001']).toBeUndefined();
  });
  it('spends the literal five-fragment first star cost and adds the source star attributes', () => {
    const initial = createHeroState(1000);
    const recruited = applyHeroCommand(
      initial,
      { type: 'hero-recruit', heroId: 65001 },
      context({ '750001': 15 }),
    );
    const starred = applyHeroCommand(
      recruited.state,
      { type: 'hero-star', heroId: 65001 },
      context(recruited.balances),
    );
    expect(starred.ok).toBe(true);
    expect(starred.state.roster['65001'].star).toBe(1);
    expect(starred.balances['750001']).toBe(0);
    expect(getHeroStats(starred.state, 65001)).toMatchObject({
      attack: 537,
      defense: 543,
      command: 400,
    });
  });
  it('unlocks a recommended skill at hero level20 and spends its item then source XP books', () => {
    // Source quality4 levels1..19 require82250XP; nine10000XP books reach20.
    const recruited = applyHeroCommand(
      createHeroState(1000),
      { type: 'hero-recruit', heroId: 65001 },
      context({ '750001': 10, '110024': 9, '1000001': 1, '110026': 67 }),
    );
    const trained = applyHeroCommand(
      recruited.state,
      { type: 'hero-train', heroId: 65001, itemId: 110024, count: 9 },
      context(recruited.balances),
    );
    expect(trained.state.roster['65001'].level).toBe(20);
    const learned = applyHeroCommand(
      trained.state,
      { type: 'hero-skill', heroId: 65001, slot: 1, skillId: 1000001 },
      context(trained.balances),
    );
    expect(learned.ok).toBe(true);
    expect(learned.balances['1000001']).toBe(0);
    const upgraded = applyHeroCommand(
      learned.state,
      { type: 'hero-skill', heroId: 65001, slot: 1 },
      context(learned.balances),
    );
    expect(upgraded.state.roster['65001'].skills[1]).toMatchObject({
      id: 1000001,
      level: 2,
      xp: 10,
    });
    expect(upgraded.balances['110026']).toBe(0);
  });
  it('crafts, equips and enhances a unique equipment instance with full duplicate-material costs', () => {
    const initial = createHeroState(1000);
    const denied = applyHeroCommand(
      initial,
      { type: 'hero-craft-gear', itemId: 1710101 },
      context({ '800081': 19 }),
    );
    expect(denied.ok).toBe(false);
    expect(denied.balances).toEqual({ '800081': 19 });
    const crafted = applyHeroCommand(
      initial,
      { type: 'hero-craft-gear', itemId: 1710101 },
      context({ '800081': 20, '110100': 4, '110101': 2 }),
    );
    expect(crafted.ok).toBe(true);
    expect(crafted.balances['800081']).toBe(0);
    expect(crafted.balances['1710101']).toBe(1);
    const equipped = applyHeroCommand(
      crafted.state,
      { type: 'hero-equip', heroId: 62003, itemId: 1710101 },
      context(crafted.balances),
    );
    expect(equipped.state.roster['62003'].equipment).toEqual({ id: 1, itemId: 1710101, level: 0 });
    expect(equipped.balances['1710101']).toBe(0);
    const upgraded = applyHeroCommand(
      equipped.state,
      { type: 'hero-equip-upgrade', heroId: 62003 },
      context(equipped.balances),
    );
    expect(upgraded.state.roster['62003'].equipment?.level).toBe(1);
    expect(upgraded.balances['110100']).toBe(0);
    expect(upgraded.balances['110101']).toBe(0);
    expect(validateHeroState(upgraded.state)).not.toBeNull();
  });
  it('upgrades the formation and fortifies only its unlocked source positions', () => {
    const initial = createHeroState(1000);
    const upgraded = applyHeroCommand(
      initial,
      { type: 'hero-formation-upgrade' },
      context({ '110119': 6 }),
    );
    expect(upgraded.ok).toBe(true);
    expect(upgraded.state.formationLevels['1']).toBe(1);
    expect(upgraded.balances['110119']).toBe(5);
    const denied = applyHeroCommand(
      upgraded.state,
      { type: 'hero-fortify', position: 0 },
      context(upgraded.balances),
    );
    expect(denied.ok).toBe(false);
    const fortified = applyHeroCommand(
      upgraded.state,
      { type: 'hero-fortify', position: 6 },
      context(upgraded.balances),
    );
    expect(fortified.ok).toBe(true);
    expect(fortified.state.fortifications['1:6']).toBe(1);
    expect(fortified.balances['110119']).toBe(0);
    const duplicated = applyHeroCommand(
      fortified.state,
      { type: 'hero-formation', heroIds: [62003, 62003], troopCells: [0] },
      context(fortified.balances),
    );
    expect(duplicated.ok).toBe(false);
    expect(validateHeroState(fortified.state)).not.toBeNull();
  });
  it('resolves source campaign1 on the server command and pays its20XP first clear only once', () => {
    const initial = createHeroState(1_792_800_000_000);
    const ctx = context({ '1200001': 0 }, 1_792_800_000_000);
    const result = applyHeroCommand(
      initial,
      { type: 'hero-battle', mode: 'campaign', stageId: 1 },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.state.lastBattle).toMatchObject({
      rulesVersion: 1,
      won: true,
      firstClear: true,
      stageId: 1,
      staminaCost: 3,
    });
    expect(result.state.completed.campaign).toEqual([1]);
    expect(result.state.stamina).toBe(97);
    expect(result.balances['1200001']).toBe(20);
    expect(validateHeroState(result.state)).not.toBeNull();
    const repeat = applyHeroCommand(
      result.state,
      { type: 'hero-battle', mode: 'campaign', stageId: 1 },
      { ...ctx, balances: result.balances },
    );
    expect(repeat.ok).toBe(true);
    expect(repeat.state.lastBattle?.firstClear).toBe(false);
    expect(repeat.balances['1200001']).toBe(20);
    expect(repeat.state.lastBattle!.events.length).toBeLessThanOrEqual(120);
    const forged = applyHeroCommand(
      initial,
      { type: 'hero-battle', mode: 'campaign', stageId: 1, won: true } as never,
      ctx,
    );
    expect(forged.ok).toBe(false);
    expect(initial.completed.campaign).toEqual([]);
  });
});

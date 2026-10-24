import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  applyCommand,
  advanceState,
  validateState,
  catalog,
  getArm,
  getCastle,
  getBuilding,
  createTowerBattle,
  connectTowerRoute,
  disconnectTowerRoute,
  advanceTowerBattle,
} from './index';

describe('الفزعة city commands', () => {
  it('starts a valid independent city and rejects malformed saves', () => {
    const state = createInitialState(1000);
    expect(state.cells).toHaveLength(36);
    expect(state.castleLevel).toBe(1);
    expect(validateState(state)).toEqual(state);
    expect(validateState({ ...state, castleLevel: Infinity })).toBeNull();
  });
  it('captures the first training tower through a player route without economic rewards', () => {
    const battle = createTowerBattle(1, 1000);
    const blue = battle.buildings.find((b) => b.camp === catalog.meta.blueCamp)!;
    const enemy = battle.buildings.find((b) => b.camp !== catalog.meta.blueCamp)!;
    const connected = connectTowerRoute(battle, blue.id, enemy.id, 1000);
    expect(advanceTowerBattle(connected, 31000).status).toBe('won');
    expect(battle.routes).toEqual([]);
    expect(() => connectTowerRoute(battle, enemy.id, blue.id, 1000)).toThrow('NOT_OWNED');
  });
  it('recruits for configuration costs, merges two equal troops, and never mutates input', () => {
    const original = createInitialState(1000),
      copy = structuredClone(original);
    const arm = getArm(original.cells[0]!.cfgId)!;
    const recruited = applyCommand(original, { type: 'recruit', cfgId: arm.id }, 1000);
    expect(recruited.ok).toBe(true);
    expect(recruited.state.cells.filter(Boolean)).toHaveLength(4);
    for (const [id, cost] of arm.cost)
      expect(recruited.state.balances[id]).toBe(original.balances[id] - cost);
    const merged = applyCommand(recruited.state, { type: 'merge', from: 0, to: 1 }, 1000);
    expect(merged.ok).toBe(true);
    expect(merged.state.cells[0]).toBeNull();
    expect(merged.state.cells[1]!.cfgId).toBe(arm.nextId);
    expect(merged.state.revision).toBe(2);
    expect(original).toEqual(copy);
  });
  it('fails invalid and unaffordable commands atomically', () => {
    const state = createInitialState(1000);
    const broke = { ...state, balances: {} };
    const commands = [
      { type: 'recruit', cfgId: -1 },
      { type: 'move', from: -1, to: 2 },
      { type: 'move', from: 0, to: 1 },
      { type: 'merge', from: 0, to: 0 },
      { type: 'merge', from: 0, to: 2 },
      { type: 'upgrade-building', cell: 0 },
      { type: 'build', cfgId: 999999, cell: 3 },
      { type: 'tower-tick' },
      { type: 'tower-route', from: '0', to: '1' },
      { type: 'collect' },
    ] as const;
    for (const command of commands) {
      const result = applyCommand(state, command, 1000);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
    }
    expect(applyCommand(broke, { type: 'recruit', cfgId: state.cells[0]!.cfgId }, 1000).code).toBe(
      'INSUFFICIENT_RESOURCES',
    );
    expect(applyCommand(state, { type: 'tower-start', levelId: 999 }, 1000).ok).toBe(false);
    expect(applyCommand(state, { type: 'tower-quit' }, NaN).ok).toBe(false);
    expect(() => createInitialState(-1)).toThrow('INVALID_TIME');
    expect(() => advanceState(state, 999)).toThrow('INVALID_TIME');
  });
  it('moves a unit and upgrades a unique direct-upgrade building against current row requirements', () => {
    let state = createInitialState(1000);
    state = applyCommand(state, { type: 'move', from: 0, to: 4 }, 1000).state;
    expect(state.cells[0]).toBeNull();
    expect(state.cells[4]).not.toBeNull();
    const build = catalog.buildings.find((b) => b.type === 5 && b.level === 1)!;
    state = { ...state, balances: Object.fromEntries(catalog.items.map((i) => [i.id, 1e9])) };
    const built = applyCommand(state, { type: 'build', cfgId: build.id, cell: 5 }, 1000);
    expect(built.ok).toBe(true);
    expect(applyCommand(built.state, { type: 'build', cfgId: build.id, cell: 6 }, 1000).code).toBe(
      'ALREADY_BUILT',
    );
    expect(applyCommand(built.state, { type: 'upgrade-building', cell: 5 }, 1000).code).toBe(
      'CASTLE_REQUIRED',
    );
    const upgrade = applyCommand(
      { ...built.state, castleLevel: 10 },
      { type: 'upgrade-building', cell: 5 },
      1000,
    );
    expect(upgrade.ok).toBe(true);
    expect(upgrade.state.cells[5]!.cfgId).toBe(build.nextId);
    const castle = getCastle(state)!;
    const upgraded = applyCommand(state, { type: 'upgrade-castle' }, 1000);
    expect(upgraded.ok).toBe(true);
    expect(upgraded.state.castleLevel).toBe(getBuilding(castle.nextId!)!.level);
    expect(state.castleLevel).toBe(1);
  });
  it('bounds collection and rejects a full city without charging', () => {
    const state = createInitialState(0),
      gold = catalog.meta.goldItemId;
    const result = applyCommand(state, { type: 'collect' }, 60000);
    expect(result.state.balances[gold]).toBe(state.balances[gold] + 126);
    expect(applyCommand(result.state, { type: 'collect' }, 60000).ok).toBe(false);
    expect(applyCommand(state, { type: 'collect' }, 1e9).state.balances[gold]).toBe(
      state.balances[gold] + 90720,
    );
    const full = {
      ...state,
      cells: state.cells.map((_, i) => ({ ...state.cells[0]!, id: String(i + 1) })),
    };
    expect(applyCommand(full, { type: 'recruit', cfgId: state.cells[0]!.cfgId }, 0).code).toBe(
      'CITY_FULL',
    );
  });
  it('loads every real training map and bounds hostile simulation time', () => {
    expect(catalog.levels).toHaveLength(65);
    for (const level of catalog.levels) {
      const battle = createTowerBattle(level.id, 0),
        snapshot = structuredClone(battle);
      const next = advanceTowerBattle(battle, 100000000);
      expect(next.elapsedMs).toBeLessThanOrEqual(60000);
      expect(next.buildings.every((b) => Number.isFinite(b.hp) && b.hp >= 0 && b.hp <= 65)).toBe(
        true,
      );
      expect(battle).toEqual(snapshot);
      expect(
        validateState({ ...createInitialState(0), battle: next, updatedAt: 100000000 }),
      ).not.toBeNull();
    }
  });
  it('route commands are idempotent, removable, and reject invalid control', () => {
    const battle = createTowerBattle(1, 0),
      [enemy, blue] = battle.buildings;
    const route = connectTowerRoute(battle, blue.id, enemy.id, 0);
    expect(connectTowerRoute(route, blue.id, enemy.id, 0).routes).toHaveLength(1);
    expect(disconnectTowerRoute(route, blue.id, enemy.id, 0).routes).toHaveLength(0);
    expect(() => connectTowerRoute(battle, blue.id, blue.id, 0)).toThrow('INVALID_ROUTE');
    expect(() => disconnectTowerRoute(battle, enemy.id, blue.id, 0)).toThrow('NOT_OWNED');
    expect(() => advanceTowerBattle(battle, -1)).toThrow('INVALID_TIME');
    const won = advanceTowerBattle(route, 30000);
    expect(() => connectTowerRoute(won, blue.id, enemy.id, 30000)).toThrow('BATTLE_FINISHED');
  });
  it('records a verified training win only once without awarding gold', () => {
    const initial = createInitialState(0),
      gold = catalog.meta.goldItemId;
    const started = applyCommand(initial, { type: 'tower-start', levelId: 1 }, 0).state;
    const [enemy, blue] = started.battle!.buildings;
    const routed = applyCommand(
      started,
      { type: 'tower-route', from: blue.id, to: enemy.id },
      0,
    ).state;
    const won = applyCommand(routed, { type: 'tower-tick' }, 30000).state;
    expect(won.completedTowerLevels).toEqual([1]);
    expect(won.balances[gold]).toBe(initial.balances[gold]);
    expect(advanceState(won, 31000).completedTowerLevels).toEqual([1]);
    expect(applyCommand(won, { type: 'tower-quit' }, 31000).state.battle).toBeNull();
  });
  it('rejects corrupted ids, routes, duplicate cells and out of range state', () => {
    const state = createInitialState(0),
      battle = createTowerBattle(1, 0);
    expect(
      validateState({ ...state, cells: [state.cells[0], state.cells[0], ...state.cells.slice(2)] }),
    ).toBeNull();
    expect(
      validateState({
        ...state,
        cells: [{ ...state.cells[0], cfgId: 999999 }, ...state.cells.slice(1)],
      }),
    ).toBeNull();
    expect(validateState({ ...state, completedTowerLevels: [1, 1] })).toBeNull();
    expect(
      validateState({
        ...state,
        battle: { ...battle, routes: [{ from: 'missing', to: 'missing2' }] },
      }),
    ).toBeNull();
    expect(
      validateState({ ...state, battle: { ...battle, buildings: battle.buildings.slice(1) } }),
    ).toBeNull();
    expect(validateState({ ...state, battle: { ...battle, startedAt: 100 } })).toBeNull();
  });
});

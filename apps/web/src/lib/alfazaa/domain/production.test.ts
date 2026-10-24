import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createInitialState,
  getGoldPerMinute,
  getBuilding,
  getCastle,
  validateState,
  type Command,
} from './index';

describe('source-derived housing production', () => {
  it('starts with one housing building and collects its source 126 gold per minute', () => {
    const initial = createInitialState(0),
      snapshot = structuredClone(initial);
    expect(initial.cells[35]).toMatchObject({ kind: 'building', cfgId: 40001 });
    expect(initial.nextId).toBe(4);
    expect(getGoldPerMinute(initial)).toBe(126);
    const result = applyCommand(initial, { type: 'collect' }, 60_000);
    expect(result.ok).toBe(true);
    expect(result.state.balances['400001']).toBe(20126);
    expect(initial).toEqual(snapshot);
  });
  it('upgrades a group building only by merging a matching pair under the documented castle cap', () => {
    let state = createInitialState(0);
    const built = applyCommand(state, { type: 'build', cfgId: 40001, cell: 2 }, 0);
    expect(built.ok).toBe(true);
    state = built.state;
    expect(applyCommand(state, { type: 'upgrade-building', cell: 35 }, 0).code).toBe(
      'BUILDING_MERGE_REQUIRED',
    );
    expect(applyCommand(state, { type: 'merge', from: 35, to: 2 }, 0).code).toBe('CASTLE_REQUIRED');
    state = applyCommand(state, { type: 'upgrade-castle' }, 0).state;
    const merged = applyCommand(state, { type: 'merge', from: 35, to: 2 }, 0);
    expect(merged.ok).toBe(true);
    expect(merged.state.cells[35]).toBeNull();
    expect(merged.state.cells[2]).toMatchObject({ kind: 'building', cfgId: 40002 });
    expect(state.cells[35]).toMatchObject({ cfgId: 40001 });
  });
  it('settles old production before a rate change and never pays the new rate retroactively', () => {
    let state = createInitialState(0);
    state = applyCommand(state, { type: 'upgrade-castle' }, 0).state;
    state = applyCommand(state, { type: 'build', cfgId: 40001, cell: 2 }, 0).state;
    const merged = applyCommand(state, { type: 'merge', from: 35, to: 2 }, 600_000);
    expect(merged.ok).toBe(true);
    // 20,000 - 480 for construction + ten minutes from TWO level-one houses.
    expect(merged.state.balances['400001']).toBe(22040);
    expect(getGoldPerMinute(merged.state)).toBe(378);
    expect(applyCommand(merged.state, { type: 'collect' }, 600_000).code).toBe('NOT_READY');
    expect(applyCommand(merged.state, { type: 'collect' }, 660_000).state.balances['400001']).toBe(
      22418,
    );
    expect(applyCommand(merged.state, { type: 'collect' }, 599_999).code).toBe('INVALID_TIME');
  });
  it('caps offline collection at the source twelve hours and drops only elapsed whole-minute fractions', () => {
    const state = createInitialState(0);
    expect(applyCommand(state, { type: 'collect' }, 60_001).state.balances['400001']).toBe(20126);
    expect(applyCommand(state, { type: 'collect' }, 86_400_000).state.balances['400001']).toBe(
      110720,
    );
    expect(applyCommand(state, { type: 'collect' }, 59_999).ok).toBe(false);
  });
  it('does not convert wrong-kind or non-group pairs into higher buildings', () => {
    const initial = createInitialState(0);
    expect(applyCommand(initial, { type: 'merge', from: 0, to: 35 }, 0).code).toBe(
      'MERGE_MISMATCH',
    );
    expect(applyCommand(initial, { type: 'merge', from: 35, to: 0 }, 0).code).toBe(
      'MERGE_MISMATCH',
    );
    const hospital = applyCommand(initial, { type: 'build', cfgId: 50001, cell: 2 }, 0).state;
    expect(applyCommand(hospital, { type: 'build', cfgId: 50001, cell: 3 }, 0).code).toBe(
      'ALREADY_BUILT',
    );
    const grounds = applyCommand(initial, { type: 'build', cfgId: 60001, cell: 2 }, 0).state;
    expect(applyCommand(grounds, { type: 'upgrade-building', cell: 2 }, 0).code).toBe(
      'CASTLE_REQUIRED',
    );
  });
  it('can reach every castle level through 20 with real commands, housing income and once-daily quests', () => {
    let state = createInitialState(0),
      now = 0,
      days = 0;
    const execute = (command: Command) => {
      for (let attempt = 0; attempt < 500; attempt++) {
        const result = applyCommand(state, command, now);
        if (result.ok) {
          state = result.state;
          return;
        }
        if (result.code !== 'INSUFFICIENT_RESOURCES')
          throw new Error(`${command.type}: ${result.code}`);
        now += 86_400_000;
        days++;
        const collected = applyCommand(state, { type: 'collect' }, now);
        expect(collected.ok).toBe(true);
        state = collected.state;
        const attendance = applyCommand(
          state,
          { type: 'claim-quest', questId: 'daily-attendance' },
          now,
        );
        expect(attendance.ok).toBe(true);
        state = attendance.state;
      }
      throw new Error('Progression did not become affordable');
    };
    const growHousing = (level: number) => {
      for (let attempt = 0; attempt < 1500; attempt++) {
        const houses = state.cells.flatMap((cell, index) =>
          cell?.kind === 'building' && getBuilding(cell.cfgId)?.type === 4 ? [{ cell, index }] : [],
        );
        if (houses.some(({ cell }) => getBuilding(cell.cfgId)!.level >= level)) return;
        const pair = houses.flatMap((a, i) =>
          houses
            .slice(i + 1)
            .filter((b) => b.cell.cfgId === a.cell.cfgId)
            .map((b) => [a.index, b.index] as const),
        )[0];
        if (pair) execute({ type: 'merge', from: pair[0], to: pair[1] });
        else execute({ type: 'build', cfgId: 40001, cell: state.cells.indexOf(null) });
      }
      throw new Error('Housing progression stalled');
    };
    const reached = [1];
    while (state.castleLevel < 20) {
      const required = getCastle(state)!.requireBuilding;
      if (required) {
        let index = state.cells.findIndex(
          (cell) => cell?.kind === 'building' && getBuilding(cell.cfgId)?.type === 5,
        );
        if (index < 0) {
          index = state.cells.indexOf(null);
          execute({ type: 'build', cfgId: 50001, cell: index });
        }
        while (getBuilding(state.cells[index]!.cfgId)!.level < getBuilding(required)!.level)
          execute({ type: 'upgrade-building', cell: index });
      }
      execute({ type: 'upgrade-castle' });
      reached.push(state.castleLevel);
      if (state.castleLevel === 5 || state.castleLevel === 10) growHousing(state.castleLevel);
    }
    expect(reached).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(days).toBeLessThan(150);
    expect(getGoldPerMinute(state)).toBe(78498);
    expect(state.cells.some((cell) => cell?.kind === 'building' && cell.cfgId === 50011)).toBe(
      true,
    );
    expect(
      Object.values(state.balances).every(
        (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1e12,
      ),
    ).toBe(true);
    expect(validateState(state)).toEqual(state);
  });
});

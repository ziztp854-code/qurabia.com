import { describe, it, expect } from 'vitest';
import { applyCommand } from '../domain/city';
import { createInitialState } from '../domain/state';
import { validateState } from '../domain/validation';
import { getGameplayContext } from './context';
const now = 1792800000000;
describe('independent cross-module audit regressions', () => {
  it.each([40001, 81001, 81101, 82001, 83001])(
    'cannot recruit source special/NPC %i free through the public city command',
    (cfgId) => {
      const state = createInitialState(now);
      const result = applyCommand(state, { type: 'recruit', cfgId }, now);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
    },
  );
  it('applies the completed3percent gold research to one minute of126base production', () => {
    const state = createInitialState(now);
    state.realm.systems.research['science:4004001'] = 4004002;
    expect(getGameplayContext(state, now).bonuses.production).toBe(0.03);
    const before = state.balances['400001'];
    const result = applyCommand(state, { type: 'collect' }, now + 60000);
    expect(result.ok).toBe(true);
    expect(result.state.balances['400001'] - before).toBe(129);
  });
  it('cannot bypass the NPC recruit restriction through a training queue', () => {
    const state = createInitialState(now);
    state.cells[2] = { id: '4', kind: 'building', cfgId: 20001 };
    state.nextId = 5;
    expect(validateState(state)).not.toBeNull();
    const result = applyCommand(state, { type: 'systems-train', cfgId: 81001, count: 1 }, now);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });
  it('keeps pre-completion production at its old rate when a gold research timer finishes', () => {
    const state = createInitialState(now);
    state.realm.systems.research['science:4004001'] = 4004001;
    state.realm.systems.jobs = [
      {
        id: 1,
        kind: 'research',
        tree: 'science',
        target: 4004002,
        count: 1,
        startedAt: now,
        finishAt: now + 60000,
      },
    ];
    state.realm.systems.nextJobId = 2;
    expect(validateState(state)).not.toBeNull();
    const result = applyCommand(state, { type: 'collect' }, now + 120000);
    expect(result.ok).toBe(true);
    expect(result.state.balances['400001'] - state.balances['400001']).toBe(255);
  });
  it('follows a selected troop when moved to another city cell', () => {
    const state = createInitialState(now);
    state.realm.heroes.troopCells = [0];
    const moved = applyCommand(state, { type: 'move', from: 0, to: 2 }, now);
    expect(moved.ok).toBe(true);
    expect(moved.state.realm.heroes.troopCells).toEqual([2]);
    const battle = applyCommand(
      moved.state,
      { type: 'hero-battle', mode: 'campaign', stageId: 1 },
      now,
    );
    expect(battle.ok).toBe(true);
  });
  it('removes injured selected cells so the surviving city army can fight again', () => {
    const state = createInitialState(now);
    state.realm.heroes.troopCells = [0];
    const lost = applyCommand(state, { type: 'hero-battle', mode: 'expedition', stageId: 2 }, now);
    expect(lost.ok).toBe(true);
    expect(lost.state.cells[0]).toBeNull();
    expect(lost.state.realm.systems.wounded['10001']).toBe(1);
    expect(lost.state.realm.heroes.troopCells).toEqual([]);
    const retry = applyCommand(
      lost.state,
      { type: 'hero-battle', mode: 'campaign', stageId: 1 },
      now,
    );
    expect(retry.ok).toBe(true);
  });
  it('allows deploying existing reserves when a completed training output reaches the reserve cap', () => {
    const state = createInitialState(now);
    state.realm.systems.reserve['10001'] = 100000;
    state.realm.systems.nextJobId = 2;
    state.realm.systems.jobs = [
      { id: 1, kind: 'training', target: 10001, count: 1, startedAt: now, finishAt: now + 1000 },
    ];
    expect(validateState(state)).not.toBeNull();
    const result = applyCommand(state, { type: 'systems-deploy', cfgId: 10001 }, now + 1000);
    expect(result.ok).toBe(true);
    expect(result.state.realm.systems.reserve['10001']).toBeGreaterThanOrEqual(99999);
    expect(
      result.state.realm.systems.reserve['10001'] +
        result.state.realm.systems.jobs.reduce((n, j) => n + (j.target === 10001 ? j.count : 0), 0),
    ).toBe(100000);
  });
});

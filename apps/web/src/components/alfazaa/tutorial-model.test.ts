import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  catalog,
  createInitialState,
  type AlfazaaState,
  type Command,
} from '@/lib/alfazaa/domain';
import { tutorialProgress } from './tutorial-model';

describe('Alfazaa guided game progress', () => {
  it('starts with merging the two initial matching troops', () => {
    const state = createInitialState(1000);
    const result = tutorialProgress(state);
    expect(result.steps).toHaveLength(6);
    expect(result.completedCount).toBe(0);
    expect(result.current?.id).toBe('merge');
    expect(result.current?.section).toBe('city');
    expect(result.complete).toBe(false);
  });
  it('follows real merge, recruitment and castle commands without inventing progress', () => {
    let state = createInitialState(1000);
    const command = (value: Command) => {
      const result = applyCommand(state, value, 1000);
      expect(result.ok).toBe(true);
      state = result.state;
    };
    command({ type: 'merge', from: 0, to: 1 });
    expect(tutorialProgress(state).current?.id).toBe('recruit');
    expect(tutorialProgress(state).completedCount).toBe(1);
    command({ type: 'recruit', cfgId: 10001 });
    expect(tutorialProgress(state).current?.id).toBe('castle');
    expect(tutorialProgress(state).completedCount).toBe(2);
    command({ type: 'upgrade-castle' });
    expect(tutorialProgress(state).current?.id).toBe('start');
    expect(tutorialProgress(state).completedCount).toBe(3);
  });
  it('guides through stage1 and its route, then waits for authoritative completion', () => {
    let state = createInitialState(1000);
    for (const command of [
      { type: 'merge', from: 0, to: 1 },
      { type: 'recruit', cfgId: 10001 },
      { type: 'upgrade-castle' },
      { type: 'tower-start', levelId: 1 },
    ] as Command[]) {
      const result = applyCommand(state, command, 1000);
      expect(result.ok).toBe(true);
      state = result.state;
    }
    expect(tutorialProgress(state).current?.id).toBe('route');
    const source = state.battle!.buildings.find((node) => node.camp === catalog.meta.blueCamp)!;
    const target = state.battle!.buildings.find((node) => node.camp !== catalog.meta.blueCamp)!;
    const routed = applyCommand(
      state,
      { type: 'tower-route', from: source.id, to: target.id },
      1000,
    );
    expect(routed.ok).toBe(true);
    expect(tutorialProgress(routed.state).current?.id).toBe('win');
    const declaredWin = {
      ...routed.state,
      battle: { ...routed.state.battle!, status: 'won' as const },
    };
    expect(tutorialProgress(declaredWin).complete).toBe(false);
    const won = applyCommand(routed.state, { type: 'tower-tick' }, 31000);
    expect(won.ok).toBe(true);
    expect(won.state.completedTowerLevels).toContain(1);
    const result = tutorialProgress(won.state);
    expect(result.complete).toBe(true);
    expect(result.completedCount).toBe(6);
    expect(result.current).toBeUndefined();
  });
  it('keeps earned stage1 goals when leaving training and ignores a different stage', () => {
    const state = createInitialState(1000);
    const other = applyCommand(state, { type: 'tower-start', levelId: 65 }, 1000).state;
    expect(tutorialProgress(other).steps.find((step) => step.id === 'start')?.done).toBe(false);
    const completed = { ...state, completedTowerLevels: [1] };
    const result = tutorialProgress(completed);
    expect(
      result.steps.filter((step) => step.section === 'training').every((step) => step.done),
    ).toBe(true);
    expect(result.current?.id).toBe('merge');
  });
  it('does not mistake an upgraded building for a merged troop or mutate state', () => {
    const original = createInitialState(1000);
    const state: AlfazaaState = {
      ...original,
      cells: original.cells.map((_, index) =>
        index === 0 ? { id: '1', kind: 'building', cfgId: 10002 } : null,
      ),
    };
    const before = JSON.stringify(state);
    expect(tutorialProgress(state).steps.find((step) => step.id === 'merge')?.done).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
});

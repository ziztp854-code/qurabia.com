import { describe, expect, it } from 'vitest';
import { defaultKingdomsConfig } from './config';
import { createWorld, executeCommand, projectWorld } from './engine';
import {
  buildingPercent,
  buildingStage,
  maxVillageLevels,
  stageForFraction,
  throneStageState,
  villageProgress,
  villageStages,
} from './stages';
import { buildingKeys, type Village } from './types';

const now = 1800000000000;
const maxLevels = maxVillageLevels(defaultKingdomsConfig);

function found(actor = 'alice') {
  return executeCommand(createWorld(now), actor, { type: 'found', name: 'مملكة الاختبار' }, now);
}

function maxed(village: Village, maxLevel: number): Village {
  return {
    ...village,
    buildings: Object.fromEntries(
      buildingKeys.map((key) => [key, maxLevel]),
    ) as Village['buildings'],
  };
}

describe('village stage ladder', () => {
  it('orders the four stages from founding to the supreme stage', () => {
    expect(villageStages.map((stage) => stage.name)).toEqual([
      'التأسيس',
      'النهضة',
      'الازدهار',
      'المرحلة العليا',
    ]);
    const fractions = villageStages.map((stage) => stage.fraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
    expect(villageStages[0].fraction).toBe(0);
  });

  it('maps level shares onto the ladder thresholds', () => {
    expect(stageForFraction(-1).key).toBe('founding');
    expect(stageForFraction(Number.NaN).key).toBe('founding');
    expect(stageForFraction(0.11).key).toBe('founding');
    expect(stageForFraction(0.12).key).toBe('renaissance');
    expect(stageForFraction(0.31).key).toBe('renaissance');
    expect(stageForFraction(0.32).key).toBe('prosperity');
    expect(stageForFraction(0.54).key).toBe('prosperity');
    expect(stageForFraction(0.55).key).toBe('supreme');
    expect(stageForFraction(9).key).toBe('supreme');
  });

  it('never gives an unbuilt building a stage and tops out at the world maximum', () => {
    expect(buildingStage(0, 20)).toBeNull();
    expect(buildingStage(2, 0)).toBeNull();
    expect(buildingStage(2, 20)?.key).toBe('founding');
    expect(buildingStage(11, 20)?.key).toBe('supreme');
    expect(buildingStage(20, 20)?.key).toBe('supreme');
    expect(buildingPercent(0, 20)).toBe(0);
    expect(buildingPercent(10, 20)).toBe(50);
    expect(buildingPercent(25, 20)).toBe(100);
  });

  it('derives the village stage and the next target from the saved levels', () => {
    const world = found();
    const village = Object.values(world.villages)[0];
    const fresh = villageProgress(village, world.config);
    expect(fresh.levels).toBe(1);
    expect(fresh.maxLevels).toBe(maxLevels);
    expect(fresh.stage.key).toBe('founding');
    expect(fresh.next?.key).toBe('renaissance');
    expect(fresh.nextFraction).toBe(0.12);
    expect(fresh.nextLevels).toBe(Math.ceil(0.12 * maxLevels));
    expect(fresh.percent).toBe(Math.round((1 / maxLevels) * 100));
    expect(fresh.topBuildings).toBe(0);
    expect(fresh.maxedBuildings).toBe(0);
  });

  it('marks the supreme stage and the maximum when every building is maxed', () => {
    const world = found();
    const village = maxed(Object.values(world.villages)[0], 20);
    const progress = villageProgress(village, world.config);
    expect(progress.stage.key).toBe('supreme');
    expect(progress.next).toBeNull();
    expect(progress.nextLevels).toBeNull();
    expect(progress.percent).toBe(100);
    expect(progress.topBuildings).toBe(buildingKeys.length);
    expect(progress.maxedBuildings).toBe(buildingKeys.length);
  });

  it('follows the world config so a different maximum does not break the ladder', () => {
    const world = found();
    const village = Object.values(world.villages)[0];
    const small = {
      ...world.config,
      buildings: Object.fromEntries(
        buildingKeys.map((key) => [key, { ...world.config.buildings[key], maxLevel: 4 }]),
      ) as typeof world.config.buildings,
    };
    expect(maxVillageLevels(small)).toBe(buildingKeys.length * 4);
    const progress = villageProgress(
      { ...village, buildings: { ...village.buildings, hall: 6 } },
      small,
    );
    expect(progress.maxLevels).toBe(buildingKeys.length * 4);
    expect(progress.stage.key).toBe('renaissance');
    expect(progress.next?.key).toBe('prosperity');
  });
});

describe('throne finale of the season', () => {
  it('keeps the finale locked until the configured fraction of the season', () => {
    const world = found();
    const view = projectWorld(world, 'alice', now);
    const stage = throneStageState(view);
    expect(stage.name).toBe('مرحلة العرش');
    expect(stage.unlockAt).toBe(
      view.season.startsAt +
        (view.season.endsAt - view.season.startsAt) * view.config.throneUnlockFraction,
    );
    expect(stage.unlocked).toBe(false);
    expect(stage.ended).toBe(false);
    expect(stage.remainingSeconds).toBeGreaterThan(0);
    expect(stage.contribution).toBe(0);
    expect(throneStageState({ ...view, serverNow: stage.unlockAt - 1 }).unlocked).toBe(false);
    expect(throneStageState({ ...view, serverNow: stage.unlockAt }).unlocked).toBe(true);
  });

  it('closes the finale with the season and reports the crowned kingdom', () => {
    const world = found();
    const view = projectWorld(world, 'alice', world.season.endsAt);
    const stage = throneStageState(view);
    expect(stage.ended).toBe(true);
    expect(stage.unlocked).toBe(false);
    expect(stage.remainingSeconds).toBe(0);
    expect(stage.winnerId).toBe('alice');
  });
});

import { describe, expect, it } from 'vitest';
import { defaultKingdomsConfig } from './config';
import { advanceWorld, createWorld, executeCommand, projectWorld } from './engine';
import { presentRallyCommand } from './rally-command';
import { villageProgress } from './stages';
import type { KingdomsWorld, Movement, Village } from './types';

const start = 1_800_000_000_000;
const found = () =>
  executeCommand(createWorld(start), 'alice', { type: 'found', name: 'مملكة النور' }, start);

function atLevelSix(world = found()) {
  const id = Object.keys(world.villages)[0];
  world.villages[id].buildings.barracks = 1;
  world.villages[id].progression = {
    ...world.villages[id].progression!,
    xp: 375,
    signature: '',
  };
  const ready = advanceWorld(world, start);
  return { world: ready, id };
}

describe('stable server separation', () => {
  it('loads an old world without a stable key at level 0', () => {
    const world = found();
    const id = Object.keys(world.villages)[0];
    const xp = world.villages[id].progression!.xp;
    const level = world.villages[id].progression!.level;
    const tier = world.villages[id].progression!.visualTier;
    world.villages[id].troops.rider = 7;
    delete (world.villages[id].buildings as Partial<Village['buildings']>).stable;
    delete (world.config.buildings as Partial<KingdomsWorld['config']['buildings']>).stable;
    const loaded = advanceWorld(world, start);
    expect(loaded.config.buildings.stable).toMatchObject({
      cost: defaultKingdomsConfig.buildings.stable.cost,
      seconds: 120,
      maxLevel: 20,
    });
    expect(loaded.villages[id].buildings.stable).toBe(0);
    expect(loaded.villages[id].troops.rider).toBe(7);
    expect(loaded.villages[id].progression!.xp).toBe(xp);
    expect(loaded.villages[id].progression!.level).toBe(level);
    expect(loaded.villages[id].progression!.visualTier).toBe(tier);
    expect(loaded.villages[id].progression!.power.building).toBe(50);
  });

  it('starts a new village with a level 0 stable', () => {
    const id = Object.keys(found().villages)[0];
    expect(found().villages[id].buildings.stable).toBe(0);
  });

  it('builds and upgrades the stable on the existing construction queue', () => {
    const { world, id } = atLevelSix();
    expect(world.villages[id].progression!.level).toBeGreaterThanOrEqual(6);
    const queued = executeCommand(
      world,
      'alice',
      { type: 'build', villageId: id, building: 'stable' },
      start,
    );
    const item = queued.villages[id].constructionQueue!.find((entry) => entry.status === 'BUILDING');
    expect(item).toMatchObject({ building: 'stable', fromLevel: 0, targetLevel: 1 });
    expect(queued.villages[id].buildings.stable).toBe(0);
    expect(queued.villages[id].resources.wood).toBe(700);
    const built = advanceWorld(queued, item!.endsAt);
    expect(built.villages[id].buildings.stable).toBe(1);
    expect(built.villages[id].build).toBeUndefined();
    const again = advanceWorld(built, item!.endsAt);
    expect(again.villages[id].buildings.stable).toBe(1);
    const upgraded = executeCommand(
      again,
      'alice',
      { type: 'build', villageId: id, building: 'stable' },
      again.updatedAt,
    );
    const next = upgraded.villages[id].constructionQueue!.find((entry) => entry.status === 'BUILDING');
    expect(next).toMatchObject({ building: 'stable', fromLevel: 1, targetLevel: 2 });
    expect(advanceWorld(upgraded, next!.endsAt).villages[id].buildings.stable).toBe(2);
  });

  it('refuses a stable before barracks and before village level 6', () => {
    const world = found();
    const id = Object.keys(world.villages)[0];
    expect(() =>
      executeCommand(world, 'alice', { type: 'build', villageId: id, building: 'stable' }, start),
    ).toThrow(/الثكنة/);
    world.villages[id].buildings.barracks = 1;
    expect(() =>
      executeCommand(world, 'alice', { type: 'build', villageId: id, building: 'stable' }, start),
    ).toThrow(/مستوى القرية 6/);
  });

  it('trains riders only from the stable and keeps one village training slot', () => {
    const blocked = found();
    const blockedId = Object.keys(blocked.villages)[0];
    blocked.villages[blockedId].buildings.barracks = 3;
    blocked.villages[blockedId].troops.rider = 4;
    expect(() =>
      executeCommand(
        blocked,
        'alice',
        { type: 'train', villageId: blockedId, unit: 'rider', count: 1 },
        start,
      ),
    ).toThrow(/الإسطبل/);
    expect(blocked.villages[blockedId].troops.rider).toBe(4);

    const { world, id } = atLevelSix();
    world.villages[id].buildings.stable = 1;
    const training = executeCommand(
      world,
      'alice',
      { type: 'train', villageId: id, unit: 'rider', count: 2 },
      start,
    );
    expect(training.villages[id].training).toMatchObject({ unit: 'rider', count: 2 });
    expect(training.villages[id].troops.rider).toBe(0);
    expect(training.villages[id].training!.endsAt - start).toBe(150_000);
    expect(() =>
      executeCommand(
        training,
        'alice',
        { type: 'train', villageId: id, unit: 'guard', count: 1 },
        start,
      ),
    ).toThrow(/تدريب جارٍ/);
    const done = advanceWorld(training, training.villages[id].training!.endsAt);
    expect(done.villages[id].troops.rider).toBe(2);
    expect(done.villages[id].training).toBeUndefined();
    expect(
      advanceWorld(done, done.updatedAt).villages[id].troops.rider,
    ).toBe(2);
  });

  it('times rider training from the stable and the other units from the barracks', () => {
    const { world, id } = atLevelSix();
    world.villages[id].buildings.barracks = 1;
    world.villages[id].buildings.stable = 5;
    world.villages[id].buildings.hall = 3;
    const riders = executeCommand(
      world,
      'alice',
      { type: 'train', villageId: id, unit: 'rider', count: 1 },
      start,
    );
    expect(riders.villages[id].training!.endsAt - start).toBe(62_500);
    const after = advanceWorld(riders, riders.villages[id].training!.endsAt);
    const guards = executeCommand(
      after,
      'alice',
      { type: 'train', villageId: id, unit: 'guard', count: 1 },
      after.updatedAt,
    );
    expect(guards.villages[id].training!.endsAt - after.updatedAt).toBe(30_000);
    const scoutWorld = advanceWorld(guards, guards.villages[id].training!.endsAt);
    const scouts = executeCommand(
      scoutWorld,
      'alice',
      { type: 'train', villageId: id, unit: 'scout', count: 1 },
      scoutWorld.updatedAt,
    );
    expect(scouts.villages[id].training!.endsAt - scoutWorld.updatedAt).toBe(40_000);
    const settlerWorld = advanceWorld(scouts, scouts.villages[id].training!.endsAt);
    const settlers = executeCommand(
      settlerWorld,
      'alice',
      { type: 'train', villageId: id, unit: 'settler', count: 1 },
      settlerWorld.updatedAt,
    );
    expect(settlers.villages[id].training).toMatchObject({ unit: 'settler', count: 1 });
    expect(settlers.villages[id].training!.endsAt - settlerWorld.updatedAt).toBe(300_000);
  });

  it('finishes a legacy rider job on its original clock without a stable', () => {
    const world = found();
    const id = Object.keys(world.villages)[0];
    world.villages[id].troops.rider = 1;
    world.villages[id].training = { unit: 'rider', count: 3, endsAt: start + 40_000 };
    const movement: Movement = {
      id: 'legacy-ride',
      ownerId: 'alice',
      sourceId: id,
      targetX: world.villages[id].x + 3,
      targetY: world.villages[id].y,
      mission: 'raid',
      troops: { guard: 0, rider: 4, scout: 0, settler: 0, archer: 0, mounted_archer: 0, sultan_guard: 0, siege_engineer: 0, siege_tower: 0 },
      departedAt: start,
      arrivesAt: start + 90_000,
      travelMs: 90_000,
      loot: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
    };
    world.movements = [movement];
    delete (world.villages[id].buildings as Partial<Village['buildings']>).stable;
    const soon = advanceWorld(world, start + 1_000);
    expect(soon.villages[id].training).toEqual({ unit: 'rider', count: 3, endsAt: start + 40_000 });
    expect(soon.villages[id].troops.rider).toBe(1);
    expect(soon.movements[0].troops.rider).toBe(4);
    const done = advanceWorld(soon, start + 40_000);
    expect(done.villages[id].troops.rider).toBe(4);
    expect(done.villages[id].training).toBeUndefined();
    expect(done.villages[id].buildings.stable).toBe(0);
    expect(done.movements[0].troops.rider).toBe(4);
    expect(advanceWorld(done, start + 40_000).villages[id].troops.rider).toBe(4);
  });

  it('keeps riders on the rally and leaves other building costs unchanged', () => {
    const world = found();
    const id = Object.keys(world.villages)[0];
    world.villages[id].troops.rider = 6;
    const view = projectWorld(world, 'alice', start);
    const command = presentRallyCommand(view, view.villages[0]);
    expect(command.available.find((row) => row.unit === 'rider')?.count).toBe(6);
    expect(view.config.buildings.barracks.cost).toEqual(defaultKingdomsConfig.buildings.barracks.cost);
    expect(view.villages[0].training).toBeUndefined();
    expect(Object.keys(view.villages[0]).filter((key) => key.toLowerCase().includes('training'))).toEqual(
      [],
    );
  });

  it('does not drop a pre-stable stage when the new building is still level 0', () => {
    const world = found();
    const id = Object.keys(world.villages)[0];
    world.villages[id].buildings.hall = 27;
    world.villages[id].buildings.stable = 0;
    expect(villageProgress(world.villages[id], world.config).stage.key).toBe('renaissance');
    expect(villageProgress(world.villages[id], world.config).maxLevels).toBe(220);
  });
});

import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand, nextEventAt } from './engine';
import { defaultKingdomsConfig, resources } from './config';
import type { Building } from './types';
const now = 1_800_000_000_000;
function found() {
  const world = executeCommand(
    createWorld(now, {
      ...defaultKingdomsConfig,
      storageBase: 100000,
      startingResources: resources(50000, 50000, 50000, 50000, 50000),
    }),
    'alice',
    { type: 'found', name: 'مملكة النور' },
    now,
  );
  const id = Object.keys(world.villages)[0];
  world.villages[id].buildings.barracks = 1;
  return { world, id };
}
describe('Construction queue and offline progression', () => {
  it('finishes the level-twelve palace, wall and warehouse acceptance journey offline', () => {
    const fixture = found();
    const id = fixture.id;
    let world = fixture.world;
    world.villages[id].buildings = {
      ...world.villages[id].buildings,
      hall: 7,
      wall: 5,
      warehouse: 8,
    };
    world.villages[id].progression = {
      ...world.villages[id].progression!,
      xp: 2175,
      signature: '',
    };
    world = advanceWorld(world, now);
    expect(world.villages[id].progression!.level).toBe(12);
    for (const building of ['hall', 'wall', 'warehouse'] as const)
      world = executeCommand(world, 'alice', { type: 'build', villageId: id, building }, now);
    world = executeCommand(
      world,
      'alice',
      { type: 'train', villageId: id, unit: 'guard', count: 2 },
      now,
    );
    const done = advanceWorld(JSON.parse(JSON.stringify(world)), now + 5 * 3600000);
    expect(done.villages[id].buildings).toMatchObject({ hall: 8, wall: 6, warehouse: 9 });
    expect(done.villages[id].progression).toMatchObject({ xp: 4485, level: 15, visualTier: 3 });
    expect(done.villages[id].progression!.power.total).toBeGreaterThan(
      world.villages[id].progression!.power.total,
    );
  });
  it('adopts legacy active work without spending twice or minting a guessed cancellation refund', () => {
    const { world, id } = found();
    world.villages[id].build = { building: 'farm', level: 1, endsAt: now + 60000 };
    delete world.config.construction;
    const adopted = advanceWorld(JSON.parse(JSON.stringify(world)), now);
    expect(adopted.villages[id].resources).toEqual(world.villages[id].resources);
    expect(adopted.villages[id].build).toEqual(world.villages[id].build);
    expect(advanceWorld(adopted, now)).toEqual(adopted);
    const cancelled = executeCommand(
      adopted,
      'alice',
      { type: 'cancelBuild', villageId: id, itemId: adopted.villages[id].constructionQueue![0].id },
      now,
    );
    expect(cancelled.villages[id].resources).toEqual(world.villages[id].resources);
    expect(cancelled.villages[id].progression!.xp).toBe(0);
  });
  it('enforces pending bounds, scheduled max levels and resource safety without mutating input', () => {
    const fixture = found();
    const id = fixture.id;
    let world = fixture.world;
    for (let index = 0; index < 5; index++)
      world = executeCommand(
        world,
        'alice',
        { type: 'build', villageId: id, building: 'farm' },
        now,
      );
    const before = structuredClone(world);
    expect(() =>
      executeCommand(world, 'alice', { type: 'build', villageId: id, building: 'farm' }, now),
    ).toThrow('ممتلئ');
    expect(world).toEqual(before);
    const poor = found();
    poor.world.villages[poor.id].resources = resources();
    expect(() =>
      executeCommand(
        poor.world,
        'alice',
        { type: 'build', villageId: poor.id, building: 'farm' },
        now,
      ),
    ).toThrow('غير كافية');
    expect(poor.world.villages[poor.id].constructionQueue).toBeUndefined();
    const maxed = found();
    maxed.world.villages[maxed.id].buildings.farm = 20;
    expect(() =>
      executeCommand(
        maxed.world,
        'alice',
        { type: 'build', villageId: maxed.id, building: 'farm' },
        now,
      ),
    ).toThrow('الحد الأعلى');
  });
  it('uses originally reserved costs and durations when configuration changes before cancellation', () => {
    const fixture = found();
    const id = fixture.id;
    let world = fixture.world;
    for (const building of ['lumber', 'farm'] as const)
      world = executeCommand(world, 'alice', { type: 'build', villageId: id, building }, now);
    world.config.buildings.farm = {
      ...world.config.buildings.farm,
      cost: resources(9999),
      seconds: 9999,
    };
    world.config.buildings.lumber = { ...world.config.buildings.lumber, cost: resources(9999) };
    const wood = world.villages[id].resources.wood;
    const cancelled = executeCommand(
      world,
      'alice',
      { type: 'cancelBuild', villageId: id, itemId: world.villages[id].constructionQueue![0].id },
      now,
    );
    expect(cancelled.villages[id].resources.wood).toBe(wood + 40);
    expect(cancelled.villages[id].build?.endsAt).toBe(now + 60000);
  });
  it('fails a no-longer-valid queued level safely and continues unrelated projects', () => {
    const fixture = found();
    const id = fixture.id;
    let world = fixture.world;
    for (const building of ['lumber', 'farm'] as const)
      world = executeCommand(world, 'alice', { type: 'build', villageId: id, building }, now);
    world.villages[id].buildings.lumber = 4;
    const done = advanceWorld(world, now + 3600000);
    expect(done.villages[id].buildings.lumber).toBe(4);
    expect(done.villages[id].buildings.farm).toBe(1);
    expect(done.villages[id].constructionQueue?.map((item) => item.status)).toEqual([
      'FAILED',
      'COMPLETED',
    ]);
    expect(done.villages[id].progression!.xp).toBe(100);
    expect(advanceWorld(done, done.updatedAt)).toEqual(done);
  });
  it('cancels queued work with one full refund and removes dependent building levels', () => {
    const fixture = found();
    const id = fixture.id;
    let world = fixture.world;
    for (const building of ['lumber', 'farm', 'farm', 'wall'] as const)
      world = executeCommand(world, 'alice', { type: 'build', villageId: id, building }, now);
    const queue = world.villages[id].constructionQueue!;
    expect(queue.map((item) => item.targetLevel)).toEqual([1, 1, 2, 1]);
    const before = world.villages[id].resources.wood;
    const cancel = { type: 'cancelBuild', villageId: id, itemId: queue[1].id } as const;
    const cancelled = executeCommand(world, 'alice', cancel, now);
    expect(cancelled.villages[id].resources.wood).toBe(before + 204);
    expect(cancelled.villages[id].constructionQueue!.map((item) => item.status)).toEqual([
      'BUILDING',
      'CANCELLED',
      'CANCELLED',
      'QUEUED',
    ]);
    expect(cancelled.villages[id].constructionQueue![3].startedAt).toBe(now + 60000);
    expect(() => executeCommand(cancelled, 'alice', cancel, now)).toThrow();
    const done = advanceWorld(cancelled, now + 3600000);
    expect(done.villages[id].buildings.farm).toBe(0);
    expect(done.villages[id].progression!.xp).toBe(200);
  });
  it('refunds active work partially and starts the next item at cancellation time', () => {
    const fixture = found();
    const id = fixture.id;
    let world = fixture.world;
    for (const building of ['lumber', 'wall'] as const)
      world = executeCommand(world, 'alice', { type: 'build', villageId: id, building }, now);
    const before = world.villages[id].resources.wood;
    const cancelled = executeCommand(
      world,
      'alice',
      { type: 'cancelBuild', villageId: id, itemId: world.villages[id].constructionQueue![0].id },
      now + 30000,
    );
    expect(cancelled.villages[id].resources.wood).toBeCloseTo(before + 40 + 80 / 120);
    expect(cancelled.villages[id].build).toEqual({
      building: 'wall',
      level: 1,
      startedAt: now + 30000,
      endsAt: now + 130000,
    });
    expect(advanceWorld(cancelled, now + 130000).villages[id].progression!.xp).toBe(100);
  });
  it('completes five projects and training in chronological order after five offline hours', () => {
    const fixture = found();
    const id = fixture.id;
    let world = fixture.world;
    const buildings: Building[] = ['lumber', 'farm', 'wall', 'warehouse', 'hall'];
    for (const building of buildings)
      world = executeCommand(world, 'alice', { type: 'build', villageId: id, building }, now);
    world = executeCommand(
      world,
      'alice',
      { type: 'train', villageId: id, unit: 'guard', count: 2 },
      now,
    );
    expect(world.villages[id].constructionQueue?.map((item) => item.status)).toEqual([
      'BUILDING',
      'QUEUED',
      'QUEUED',
      'QUEUED',
      'QUEUED',
    ]);
    expect(nextEventAt(world)).toBe(now + 60000);
    const before = world.villages[id].resources;
    const done = advanceWorld(JSON.parse(JSON.stringify(world)), now + 5 * 3600000);
    const village = done.villages[id];
    expect(village.constructionQueue?.map((item) => item.status)).toEqual(
      Array(5).fill('COMPLETED'),
    );
    expect(village.constructionQueue?.map((item) => item.endsAt - now)).toEqual([
      60000, 120000, 220000, 320000, 506000,
    ]);
    expect(village.build).toBeUndefined();
    expect(village.training).toBeUndefined();
    expect(village.troops.guard).toBe(2);
    expect(village.progression!.xp).toBe(610);
    expect(village.resources.wood).toBeCloseTo(before.wood + 80 / 60 + 108 * (5 - 1 / 60));
    expect(village.resources.food).toBeCloseTo(
      before.food + 100 / 60 + 98 / 60 + 133 * (5 - 2 / 60),
    );
    expect(advanceWorld(done, done.updatedAt)).toEqual(done);
  });
});

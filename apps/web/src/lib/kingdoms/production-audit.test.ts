import { describe, expect, it } from 'vitest';
import { kingdomsCommandSchema } from './commands';
import { createWorld, executeCommand, advanceWorld, projectWorld } from './engine';
import { productionRate, storageCapacity } from './simulation';
import type { KingdomsWorld, Resource, Resources, Village } from './types';

const T0 = 1_800_000_000_000;
const hour = 3_600_000;
const audited = ['food', 'iron', 'stone', 'gold'] as const satisfies readonly Resource[];

function openWorld(): KingdomsWorld {
  const world = executeCommand(createWorld(T0), 'p', { type: 'found', name: 'تدقيق' }, T0);
  const village = Object.values(world.villages)[0];
  village.resources = { wood: 1000, stone: 1000, iron: 1000, food: 1000, gold: 1000 };
  village.troops = { guard: 0, rider: 0, scout: 0, settler: 0 };
  village.updatedAt = T0;
  world.updatedAt = T0;
  world.config.storageBase = 1_000_000;
  return world;
}

function villageOf(world: KingdomsWorld): Village {
  return Object.values(world.villages)[0];
}

function expectedBalance(start: Resources, rate: Resources, elapsedMs: number, cap: number): Resources {
  const elapsedHours = elapsedMs / hour;
  return {
    wood: Math.min(cap, start.wood + rate.wood * elapsedHours),
    stone: Math.min(cap, start.stone + rate.stone * elapsedHours),
    iron: Math.min(cap, start.iron + rate.iron * elapsedHours),
    food: Math.min(cap, start.food + rate.food * elapsedHours),
    gold: Math.min(cap, start.gold + rate.gold * elapsedHours),
  };
}

describe('authoritative resource production', () => {
  it('uses one hourly formula for food, iron, stone, and gold', () => {
    const world = openWorld();
    const village = villageOf(world);
    for (const level of [0, 1, 5, 10, 20]) {
      village.buildings.farm = level;
      village.buildings.mine = level;
      village.buildings.quarry = level;
      village.buildings.treasury = level;
      const rate = productionRate(world.config, village);
      for (const key of audited) {
        const buildingLevel =
          key === 'food'
            ? village.buildings.farm
            : key === 'iron'
              ? village.buildings.mine
              : key === 'stone'
                ? village.buildings.quarry
                : village.buildings.treasury;
        expect(buildingLevel).toBe(level);
        expect(rate[key]).toBe(
          world.config.baseProduction[key] * (1 + level * world.config.productionPerLevel),
        );
      }
    }
  });

  it('matches a single advance at one second, one minute, one hour, five hours, and one day', () => {
    const start = openWorld();
    const rate = productionRate(start.config, villageOf(start));
    const initial = { ...villageOf(start).resources };
    for (const elapsed of [1000, 10_000, 60_000, hour, 5 * hour, 24 * hour]) {
      const advanced = advanceWorld(openWorld(), T0 + elapsed);
      const cap = storageCapacity(advanced.config, villageOf(advanced));
      expect(villageOf(advanced).resources).toEqual(expectedBalance(initial, rate, elapsed, cap));
    }
  });

  it('keeps hourly steps equal to one advance and bounds one-second float drift', () => {
    let stepped = openWorld();
    for (let step = 1; step <= 24; step += 1) stepped = advanceWorld(stepped, T0 + step * hour);
    const once = advanceWorld(openWorld(), T0 + 24 * hour);
    expect(villageOf(stepped).resources).toEqual(villageOf(once).resources);

    let seconds = openWorld();
    for (let step = 1; step <= 3600; step += 1) seconds = advanceWorld(seconds, T0 + step * 1000);
    const hourOnce = advanceWorld(openWorld(), T0 + hour);
    for (const key of audited) {
      expect(Math.abs(villageOf(seconds).resources[key] - villageOf(hourOnce).resources[key])).toBeLessThan(1e-6);
    }
  });

  it('stops each resource at its own warehouse cap', () => {
    const world = openWorld();
    world.config.storageBase = 2000;
    world.config.storagePerLevel = 1500;
    const village = villageOf(world);
    village.buildings.warehouse = 0;
    village.resources = { wood: 1999, stone: 1999, iron: 1999, food: 1999, gold: 1999 };
    const capped = advanceWorld(world, T0 + hour);
    const cap = storageCapacity(capped.config, villageOf(capped));
    expect(cap).toBe(2000);
    for (const key of audited) expect(villageOf(capped).resources[key]).toBe(2000);
  });

  it('does not accrue twice for the same timestamp or a repeated projection', () => {
    const once = advanceWorld(openWorld(), T0 + hour);
    const twice = advanceWorld(once, T0 + hour);
    expect(villageOf(twice).resources).toEqual(villageOf(once).resources);

    const source = openWorld();
    const before = { ...villageOf(source).resources };
    const first = projectWorld(source, 'p', T0 + hour);
    const second = projectWorld(source, 'p', T0 + hour);
    expect(first.villages[0].resources).toEqual(second.villages[0].resources);
    expect(villageOf(source).resources).toEqual(before);
  });

  it('splits production across a farm completion and ignores a queued future level', () => {
    const started = executeCommand(
      openWorld(),
      'p',
      { type: 'build', villageId: villageOf(openWorld()).id, building: 'farm' },
      T0,
    );
    const villageId = villageOf(started).id;
    const queued = executeCommand(started, 'p', { type: 'build', villageId, building: 'farm' }, T0);
    const firstEnd = villageOf(queued).build!.endsAt;
    expect(villageOf(advanceWorld(queued, firstEnd - 1000)).buildings.farm).toBe(0);

    const spent = villageOf(queued).resources.food;
    const before = ((firstEnd - T0) / hour) * 100;
    const afterFirst = 30_000;
    const completed = advanceWorld(queued, firstEnd + afterFirst);
    expect(villageOf(completed).buildings.farm).toBe(1);
    expect(villageOf(completed).build?.level).toBe(2);
    expect(villageOf(completed).resources.food).toBe(spent + before + 135 * (afterFirst / hour));
  });

  it('deducts a build once and keeps later production on the balance that remains', () => {
    const world = openWorld();
    const before = { ...villageOf(world).resources };
    const built = executeCommand(
      world,
      'p',
      { type: 'build', villageId: villageOf(world).id, building: 'wall' },
      T0,
    );
    const spent = villageOf(built).resources;
    expect(spent.stone).toBeLessThan(before.stone);
    const later = advanceWorld(built, T0 + hour);
    const rate = productionRate(later.config, villageOf(later));
    expect(villageOf(later).buildings.wall).toBe(1);
    expect(villageOf(later).resources.food).toBe(spent.food + rate.food);
    expect(villageOf(later).resources.gold).toBe(spent.gold + rate.gold);
  });

  it('applies food upkeep only after training completes', () => {
    const ready = openWorld();
    villageOf(ready).buildings.barracks = 1;
    const trained = executeCommand(
      ready,
      'p',
      { type: 'train', villageId: villageOf(ready).id, unit: 'guard', count: 1 },
      T0,
    );
    const end = villageOf(trained).training!.endsAt;
    expect(villageOf(advanceWorld(trained, end - 1)).troops.guard).toBe(0);
    const spent = villageOf(trained).resources.food;
    const finished = advanceWorld(trained, end + hour);
    expect(villageOf(finished).troops.guard).toBe(1);
    expect(productionRate(finished.config, villageOf(finished)).food).toBe(99);
    expect(villageOf(finished).resources.food).toBe(spent + 100 * ((end - T0) / hour) + 99);
  });

  it('does not drive a stored balance negative when upkeep cancels the harvest', () => {
    const world = openWorld();
    const village = villageOf(world);
    village.troops.guard = 1000;
    village.resources.food = 50;
    expect(productionRate(world.config, village).food).toBe(0);
    expect(villageOf(advanceWorld(world, T0 + 24 * hour)).resources.food).toBe(50);
  });

  it('rejects a client command that tries to set a resource balance', () => {
    expect(
      kingdomsCommandSchema.safeParse({
        type: 'grant',
        resources: { wood: 0, stone: 0, iron: 0, food: 0, gold: 1000 },
      }).success,
    ).toBe(false);
  });
});

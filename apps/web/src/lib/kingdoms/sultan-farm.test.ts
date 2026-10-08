import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand, advanceWorld, projectWorld } from './engine';
import { defaultKingdomsConfig, resources } from './config';
import { kingdomsCommandSchema } from './commands';
import {
  farmCrops,
  farmGrowth,
  farmPolicy,
  farmQuote,
  farmState,
  harvestFarm,
  plantFarm,
} from './sultan-farm';
import { hourlyYield, storageCapacity } from './simulation';

const at = 1700000000000;
function fixture(level = 5) {
  const world = executeCommand(
    createWorld(at),
    'owner',
    { type: 'found', name: 'مملكة الاختبار' },
    at,
  );
  const village = Object.values(world.villages)[0];
  village.buildings.farm = level;
  return { world, village };
}
describe('Sultan farm authority and economy', () => {
  it('rejects stale price/duration or farm-level quotes before charging any food', () => {
    const { world, village } = fixture(1);
    const command = {
      type: 'farmPlant' as const,
      villageId: village.id,
      plotId: 0,
      expectedVersion: 0,
      crop: 'wheat' as const,
      expectedQuote: farmQuote(world.config, 1, 'wheat').quoteKey,
    };
    const before = structuredClone(village.resources);
    world.config.baseProduction.food = 200;
    expect(() => executeCommand(world, 'owner', command, at)).toThrow('تغيرت');
    expect(village.resources).toEqual(before);
    world.config.baseProduction.food = 100;
    village.buildings.farm = 3;
    expect(() => executeCommand(world, 'owner', command, at)).toThrow('تغيرت');
    expect(village.sultanFarm).toBeUndefined();
  });

  it('does not initialize/migrate older village state on read or advance', () => {
    const { world, village } = fixture();
    expect(farmState(village).plots).toHaveLength(12);
    expect(village.sultanFarm).toBeUndefined();
    expect(advanceWorld(world, at + 3600000).villages[village.id].sultanFarm).toBeUndefined();
  });
  it('uses current economic settings and bounds active net income, including rotation', () => {
    for (const level of [1, 3, 5, 20])
      for (const crop of Object.keys(farmCrops) as (keyof typeof farmCrops)[]) {
        const config = { ...defaultKingdomsConfig, baseProduction: resources(80, 65, 55, 230, 5) };
        const q = farmQuote(config, level, crop, 'fruit');
        const netHourly =
          ((q.harvestFood - q.seedFood) * farmPolicy.plotCount * 3600000) / q.growMs;
        expect(netHourly).toBeLessThanOrEqual(
          (hourlyYield(config, 'food', level) * 0.3) / 0.95 + 1e-9,
        );
        expect(q.seedFood).toBeGreaterThan(0);
      }
  });
  it('debits actual village food, freezes the contract and preserves all other resources', () => {
    const { world, village } = fixture();
    const before = structuredClone(world);
    const saved = executeCommand(
      world,
      'owner',
      {
        type: 'farmPlant',
        villageId: village.id,
        plotId: 0,
        expectedVersion: 0,
        crop: 'beans',
        expectedQuote: farmQuote(world.config, 5, 'beans').quoteKey,
      },
      at,
    );
    const result = saved.villages[village.id],
      plant = result.sultanFarm!.plots[0].plant!;
    expect(result.resources.food).toBe(village.resources.food - plant.seedFood);
    for (const key of ['wood', 'stone', 'iron', 'gold'] as const)
      expect(result.resources[key]).toBe(village.resources[key]);
    expect(world).toEqual(before);
    result.buildings.farm = 20;
    expect(result.sultanFarm!.plots[0].plant!.harvestFood).toBe(plant.harvestFood);
  });
  it('rejects ownership, locked seed, occupied plot, early harvest and stale generations', () => {
    const { world, village } = fixture(1);
    const plant = {
      type: 'farmPlant' as const,
      villageId: village.id,
      plotId: 0,
      expectedVersion: 0,
      crop: 'wheat' as const,
      expectedQuote: farmQuote(world.config, 1, 'wheat').quoteKey,
    };
    const withOtherOwner = executeCommand(
      world,
      'intruder',
      { type: 'found', name: 'مملكة أخرى' },
      at,
    );
    expect(() => executeCommand(withOtherOwner, 'intruder', plant, at)).toThrow('لا تخص');
    expect(() => executeCommand(world, 'owner', { ...plant, crop: 'beans' }, at)).toThrow('مستوى');
    const saved = executeCommand(world, 'owner', plant, at);
    expect(() => executeCommand(saved, 'owner', plant, at)).toThrow('تغير');
    expect(() => executeCommand(saved, 'owner', { ...plant, expectedVersion: 1 }, at)).toThrow(
      'مزروع',
    );
    expect(() =>
      executeCommand(
        saved,
        'owner',
        { type: 'farmHarvest', villageId: village.id, plotId: 0, expectedVersion: 1 },
        at,
      ),
    ).toThrow('ينضج');
  });
  it('derives offline maturity without awarding resources from read/clock', () => {
    const { world, village } = fixture();
    plantFarm(world.config, village, 0, 0, 'wheat', at);
    const plant = village.sultanFarm!.plots[0].plant!;
    const before = structuredClone(world);
    expect(farmGrowth(plant, plant.readyAt + 86400000).stage).toBe('ripe');
    expect(projectWorld(world, 'owner', plant.readyAt).villages[0].sultanFarm).toEqual(
      village.sultanFarm,
    );
    expect(world).toEqual(before);
    expect(projectWorld(world, 'intruder', at).villages).toHaveLength(0);
  });
  it('credits once, cannot replay a harvest onto a later crop, and applies only one rotation reduction', () => {
    const { world, village } = fixture();
    plantFarm(world.config, village, 0, 0, 'wheat', at);
    const plant = village.sultanFarm!.plots[0].plant!,
      food = village.resources.food;
    harvestFarm(world.config, village, 0, 1, plant.readyAt);
    expect(village.resources.food).toBe(food + plant.harvestFood);
    expect(() => harvestFarm(world.config, village, 0, 1, plant.readyAt)).toThrow('تغير');
    plantFarm(world.config, village, 0, 2, 'beans', plant.readyAt);
    const next = village.sultanFarm!.plots[0].plant!;
    expect(next.rotated).toBe(true);
    expect(next.readyAt - next.plantedAt).toBe(farmQuote(world.config, 5, 'beans').growMs * 0.95);
    expect(() => harvestFarm(world.config, village, 0, 1, next.readyAt)).toThrow('تغير');
  });
  it('preserves crop and stock atomically when full; permits harvest after space is freed', () => {
    const { world, village } = fixture();
    plantFarm(world.config, village, 0, 0, 'pomegranate', at);
    const plant = village.sultanFarm!.plots[0].plant!;
    village.resources.food = storageCapacity(world.config, village) - plant.harvestFood / 2;
    const before = structuredClone(village);
    expect(() => harvestFarm(world.config, village, 0, 1, plant.readyAt)).toThrow('المخزن');
    expect(village).toEqual(before);
    village.resources.food -= plant.harvestFood;
    harvestFarm(world.config, village, 0, 1, plant.readyAt);
    expect(village.sultanFarm!.plots[0].plant).toBeUndefined();
  });
  it('leaves passive production untouched and does not multiply rotations/yield', () => {
    const a = fixture(),
      b = fixture();
    plantFarm(b.world.config, b.village, 0, 0, 'wheat', at);
    const seed = b.village.sultanFarm!.plots[0].plant!.seedFood;
    const nextA = advanceWorld(a.world, at + 3600000).villages[a.village.id];
    const nextB = advanceWorld(b.world, at + 3600000).villages[b.village.id];
    expect(nextA.resources.food - nextB.resources.food).toBeCloseTo(seed);
    expect(farmQuote(a.world.config, 5, 'wheat', 'grain').rotated).toBe(false);
  });
  it('rejects forged costs/rewards/timestamps, invalid plots and unknown crops', () => {
    const command = {
      type: 'farmPlant',
      villageId: 'v1',
      plotId: 0,
      expectedVersion: 0,
      crop: 'wheat',
      expectedQuote: 'test-quote',
    };
    expect(kingdomsCommandSchema.safeParse(command).success).toBe(true);
    for (const patch of [
      { harvestFood: 1000 },
      { plantedAt: at },
      { plotId: 12 },
      { plotId: -1 },
      { expectedVersion: -1 },
      { crop: 'gold' },
    ])
      expect(kingdomsCommandSchema.safeParse({ ...command, ...patch }).success).toBe(false);
  });
});

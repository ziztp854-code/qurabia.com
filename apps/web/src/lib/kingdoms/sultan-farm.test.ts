import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand, advanceWorld, projectWorld } from './engine';
import { defaultKingdomsConfig, resources } from './config';
import { kingdomsCommandSchema } from './commands';
import {
  cropKeys,
  farmCrops,
  farmGrowth,
  farmQuote,
  farmState,
  farmStateSchema,
  gardenGoals,
  gardenHarvestPreview,
  gardenProgress,
  harvestFarm,
  plantFarm,
  styleFarm,
  type FarmPlant,
} from './sultan-farm';
import { storageCapacity } from './simulation';

const at = 1700000000000;
function fixture(level = 0) {
  const world = executeCommand(
    createWorld(at),
    'owner',
    { type: 'found', name: 'Test garden' },
    at,
  );
  const village = Object.values(world.villages)[0];
  village.buildings.farm = level;
  return { world, village };
}
export function legacyFixture() {
  const f = fixture(5);
  const farm = farmState(f.village);
  farm.plots[2] = {
    version: 27,
    previousFamily: 'fruit',
    plant: {
      crop: 'beans',
      plantedAt: at,
      readyAt: at + 60000,
      seedFood: 10.125,
      harvestFood: 42.375,
      rotated: true,
      policyVersion: 1,
    },
  };
  f.village.sultanFarm = farm;
  f.world.players.owner.achievements = ['merchant'];
  return f;
}
describe('Sultan garden authority and cosmetic isolation', () => {
  it('previews local plant and frame unlocks even when the account already owns the badge', () => {
    const { village } = fixture();
    const farm = farmState(village);
    farm.garden = { version: 1, harvests: 4, collected: { wheat: 4 }, style: 'natural' };
    expect(
      gardenHarvestPreview(farm, 'wheat', ['garden:first-bloom', 'garden:caretaker']).rewards,
    ).toEqual(['فتح إطار عاجي', 'فتح الخزامى']);
    farm.garden.harvests = 11;
    expect(
      gardenHarvestPreview(farm, 'wheat', [
        'garden:first-bloom',
        'garden:caretaker',
        'garden:royal-garden',
      ]).rewards,
    ).toEqual(['فتح إطار ذهبي', 'فتح السوسن']);
  });
  it('quotes nine free plants independent of village level/config/rotation; declares deterministic unlocks', () => {
    expect(cropKeys).toHaveLength(9);
    for (const crop of cropKeys) {
      const q = farmQuote(defaultKingdomsConfig, 0, crop);
      expect(q).toMatchObject({ seedFood: 0, harvestFood: 0, policyVersion: 2, rotated: false });
      expect(q.growMs).toBe(farmCrops[crop].growMinutes * 60000);
      expect(
        farmQuote(
          { ...defaultKingdomsConfig, baseProduction: resources(1, 2, 3, 999, 8) },
          20,
          crop,
          'fruit',
        ),
      ).toEqual(q);
    }
  });
  it('does not initialize or convert old state on read or elapsed time', () => {
    const { world, village } = fixture();
    expect(farmState(village).plots).toHaveLength(12);
    expect(village.sultanFarm).toBeUndefined();
    expect(advanceWorld(world, at + 3600000).villages[village.id].sultanFarm).toBeUndefined();
    const old = legacyFixture(),
      before = structuredClone(old.village.sultanFarm);
    expect(farmState(old.village)).toEqual(before);
    expect(projectWorld(old.world, 'owner', at + 86400000).villages[0].sultanFarm).toEqual(before);
    expect(old.village.sultanFarm).toEqual(before);
  });
  it('plant and cosmetic harvest change no world/player/village fields other than farm and badge IDs', () => {
    const { world, village } = fixture();
    world.players.owner.achievements = ['merchant'];
    village.resources = resources(0, 0, 0, 0, 0);
    const before = structuredClone(world);
    const planted = executeCommand(
      world,
      'owner',
      {
        type: 'farmPlant',
        villageId: village.id,
        plotId: 0,
        expectedVersion: 0,
        crop: 'rose',
        expectedQuote: farmQuote(world.config, 0, 'rose').quoteKey,
      },
      at,
    );
    const { sultanFarm: _farm, ...afterPlant } = planted.villages[village.id];
    expect(afterPlant).toEqual(village);
    expect(planted.players).toEqual(world.players);
    const readyAt = _farm!.plots[0].plant!.readyAt;
    const control = advanceWorld(planted, readyAt);
    const collected = executeCommand(
      planted,
      'owner',
      { type: 'farmHarvest', villageId: village.id, plotId: 0, expectedVersion: 1 },
      readyAt,
    );
    const normalized = structuredClone(collected);
    normalized.villages[village.id].sultanFarm = control.villages[village.id].sultanFarm;
    normalized.players.owner.achievements = control.players.owner.achievements;
    expect(normalized).toEqual(control);
    expect(collected.players.owner.achievements).toEqual(['merchant', 'garden:first-bloom']);
    expect(gardenProgress(farmState(collected.villages[village.id]))).toMatchObject({
      harvests: 1,
      collected: { rose: 1 },
    });
    expect(world).toEqual(before);
  });
  it('rejects non-owner, locked seed, occupied plot, stale quote/generation and early collection', () => {
    const { world, village } = fixture();
    const command = {
      type: 'farmPlant' as const,
      villageId: village.id,
      plotId: 0,
      expectedVersion: 0,
      crop: 'wheat' as const,
      expectedQuote: farmQuote(world.config, 0, 'wheat').quoteKey,
    };
    const intruder = executeCommand(world, 'intruder', { type: 'found', name: 'Other garden' }, at);
    expect(() => executeCommand(intruder, 'intruder', command, at)).toThrow();
    expect(() => executeCommand(world, 'owner', { ...command, crop: 'iris' }, at)).toThrow();
    expect(() =>
      executeCommand(world, 'owner', { ...command, expectedQuote: '1:paid-quote' }, at),
    ).toThrow();
    const planted = executeCommand(world, 'owner', command, at);
    expect(() => executeCommand(planted, 'owner', command, at)).toThrow();
    expect(() =>
      executeCommand(planted, 'owner', { ...command, expectedVersion: 1 }, at),
    ).toThrow();
    expect(() =>
      executeCommand(
        planted,
        'owner',
        { type: 'farmHarvest', villageId: village.id, plotId: 0, expectedVersion: 1 },
        at,
      ),
    ).toThrow();
    expect(village.sultanFarm).toBeUndefined();
  });
  it('derives five stages with server time and keeps ripe plants without absence penalties or auto rewards', () => {
    const { world, village } = fixture();
    plantFarm(world.config, village, 0, 0, 'mint', at);
    const plant = village.sultanFarm!.plots[0].plant!;
    const before = structuredClone(village);
    expect(
      [0, 0.08, 0.35, 0.75, 1].map((p) => farmGrowth(plant, at + (plant.readyAt - at) * p).stage),
    ).toEqual(['seed', 'sprout', 'growing', 'fruiting', 'ripe']);
    expect(farmGrowth(plant, plant.readyAt + 86400000).stage).toBe('ripe');
    expect(village).toEqual(before);
    expect(projectWorld(world, 'intruder', at).villages).toHaveLength(0);
  });
  it('counts once per generation, rejects replay onto a later crop, opens plants and styles at declared thresholds', () => {
    const { world, village } = fixture();
    let now = at;
    for (let i = 0; i < 12; i++) {
      const crop = (['wheat', 'beans', 'rose'] as const)[i % 3];
      plantFarm(world.config, village, 0, i * 2, crop, now);
      now = village.sultanFarm!.plots[0].plant!.readyAt;
      const ids = harvestFarm(world.config, village, 0, i * 2 + 1, now);
      expect(() => harvestFarm(world.config, village, 0, i * 2 + 1, now)).toThrow();
      expect(gardenProgress(farmState(village)).harvests).toBe(i + 1);
      if (i === 2) expect(ids).toContain('garden:variety');
    }
    expect(gardenGoals(farmState(village)).every((goal) => goal.earned)).toBe(true);
    styleFarm(village, 'gold');
    expect(gardenProgress(farmState(village)).style).toBe('gold');
    plantFarm(world.config, village, 0, 24, 'iris', now);
    expect(() => harvestFarm(world.config, village, 0, 23, now + 86400000)).toThrow();
    const unearned = fixture();
    expect(() => styleFarm(unearned.village, 'gold')).toThrow();
    expect(unearned.village.sultanFarm).toBeUndefined();
  });
  it('preserves every frozen old paid contract, honors once without cosmetic credit, then plants freely', () => {
    const { world, village } = legacyFixture();
    const before = structuredClone(village),
      food = village.resources.food;
    world.config.baseProduction.food = 999;
    world.config.buildings.farm.seconds = 1;
    expect(farmState(village)).toEqual(before.sultanFarm);
    const oldPlant = village.sultanFarm!.plots[2].plant!;
    harvestFarm(world.config, village, 2, 27, oldPlant.readyAt);
    expect(village.resources.food).toBe(food + 42.375);
    expect(village.sultanFarm!.plots[2].version).toBe(28);
    expect(gardenProgress(farmState(village)).harvests).toBe(0);
    expect(() => harvestFarm(world.config, village, 2, 27, oldPlant.readyAt)).toThrow();
    plantFarm(world.config, village, 2, 28, 'beans', oldPlant.readyAt);
    expect(village.resources.food).toBe(food + 42.375);
    expect(village.sultanFarm!.plots[2].plant).toMatchObject({
      policyVersion: 2,
      seedFood: 0,
      harvestFood: 0,
    });
    expect(world.players.owner.achievements).toEqual(['merchant']);
  });
  it('keeps old contracts when storage is full, while cosmetic collection ignores full storage', () => {
    const old = legacyFixture(),
      oldPlant = old.village.sultanFarm!.plots[2].plant!;
    old.village.resources.food = storageCapacity(old.world.config, old.village);
    const before = structuredClone(old.village);
    expect(() => harvestFarm(old.world.config, old.village, 2, 27, oldPlant.readyAt)).toThrow();
    expect(old.village).toEqual(before);
    const cosmetic = fixture();
    plantFarm(cosmetic.world.config, cosmetic.village, 0, 0, 'wheat', at);
    cosmetic.village.resources.food = storageCapacity(cosmetic.world.config, cosmetic.village);
    const stock = structuredClone(cosmetic.village.resources);
    harvestFarm(
      cosmetic.world.config,
      cosmetic.village,
      0,
      1,
      cosmetic.village.sultanFarm!.plots[0].plant!.readyAt,
    );
    expect(cosmetic.village.resources).toEqual(stock);
  });
  it('style commands preserve economic state and require server authorization/unlock', () => {
    const { world, village } = fixture();
    const styled = executeCommand(
      world,
      'owner',
      { type: 'farmStyle', villageId: village.id, style: 'natural' },
      at,
    );
    const rest = { ...styled.villages[village.id] };
    delete rest.sultanFarm;
    expect(rest).toEqual(village);
    expect(styled.players).toEqual(world.players);
    expect(() =>
      executeCommand(
        world,
        'owner',
        { type: 'farmStyle', villageId: village.id, style: 'gold' },
        at,
      ),
    ).toThrow();
    expect(() =>
      executeCommand(world, 'owner', { type: 'claim', mission: 'garden:first-bloom' } as never, at),
    ).toThrow();
  });
  it('rejects forged rewards/times, unknown plants/styles, invalid plots and nonfinite clocks atomically', () => {
    const command = {
      type: 'farmPlant',
      villageId: 'v1',
      plotId: 0,
      expectedVersion: 0,
      crop: 'rose',
      expectedQuote: '2:rose:600000:0',
    };
    for (const patch of [
      { harvestFood: 1000 },
      { plantedAt: at },
      { plotId: 12 },
      { plotId: -1 },
      { expectedVersion: -1 },
      { crop: 'gold' },
    ])
      expect(kingdomsCommandSchema.safeParse({ ...command, ...patch }).success).toBe(false);
    const { world, village } = fixture();
    for (const now of [NaN, Infinity, -1, 8e12]) {
      expect(() => plantFarm(world.config, village, 0, 0, 'wheat', now)).toThrow();
      expect(village.sultanFarm).toBeUndefined();
    }
    for (const level of [NaN, Infinity, -1, 0.5])
      expect(() => farmQuote(world.config, level, 'wheat')).toThrow();
    const invalid = {
      crop: 'wheat',
      plantedAt: at,
      readyAt: at,
      seedFood: 0,
      harvestFood: 0,
      rotated: false,
      policyVersion: 2,
    } as FarmPlant;
    expect(() => farmGrowth(invalid, at)).toThrow();
    plantFarm(world.config, village, 0, 0, 'wheat', at);
    const plant = village.sultanFarm!.plots[0].plant!;
    for (const now of [NaN, Infinity, -1]) {
      expect(() => farmGrowth(plant, now)).toThrow();
      expect(() => harvestFarm(world.config, village, 0, 1, now)).toThrow();
    }
    expect(farmStateSchema.safeParse({ ...farmState(village), extra: 'untrusted' }).success).toBe(
      false,
    );
    expect(
      farmStateSchema.safeParse({
        version: 1,
        plots: farmState(village).plots,
        garden: { version: 1, harvests: 1, collected: { wheat: 1 }, style: 'paid' },
      }).success,
    ).toBe(false);
  });
});

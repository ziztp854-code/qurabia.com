import { z } from 'zod';
import { defaultVillageProgression, villageProgressionSchema } from './progression-config';
import { constructionConfigSchema, defaultConstructionConfig } from './construction-config';
import { commanderConfigSchema, defaultCommanderConfig } from './commander-config';
import { buildingKeys, resourceKeys, unitKeys, type KingdomsConfig, type RegionConfig, type Resources, type SiegeConfig } from './types';

const defaultSiegeConfig: SiegeConfig = {
  stages: [
    { key: 'approaching', durationMs: 30_000 },
    { key: 'besieging', durationMs: 120_000 },
    { key: 'assaulting', durationMs: 90_000 },
    { key: 'withdrawing', durationMs: 60_000 },
  ],
  supplyRate: 0.25,
  tickIntervalMs: 10_000,
  damagePerTick: 1,
  wallDamage: 2,
  supplyBuildingKeys: ['barracks', 'stable', 'farm'],
  maxSiegeTicks: 20,
};

const historicalRegions: RegionConfig[] = [
  { id: 'cairo', name: 'القاهرة', x: 0, y: 0, radius: 18, terrain: 'desert', travelCostMultiplier: 1.1, regionType: 'historical_city', bonus: 'مركز تجاري وعسكري' },
  { id: 'damascus', name: 'دمشق', x: 12, y: 8, radius: 14, terrain: 'plains', travelCostMultiplier: 1, regionType: 'historical_city', bonus: 'طريق تجاري قديم' },
  { id: 'aleppo', name: 'حلب', x: 16, y: 4, radius: 14, terrain: 'plains', travelCostMultiplier: 1.05, regionType: 'trade_hub', bonus: 'سوق شهير' },
  { id: 'hejaz', name: 'الحجاز', x: -8, y: 14, radius: 20, terrain: 'desert', travelCostMultiplier: 1.35, regionType: 'religious_site', bonus: 'طريق الحج' },
  { id: 'medina', name: 'المدينة', x: -10, y: 16, radius: 10, terrain: 'desert', travelCostMultiplier: 1.25, regionType: 'religious_site', bonus: 'حماية Monte Carlo' },
  { id: 'tripoli', name: 'طرابلس', x: 20, y: 10, radius: 10, terrain: 'coast', travelCostMultiplier: 0.95, regionType: 'trade_hub', bonus: 'ميناء بحري' },
  { id: 'safad', name: 'صفد', x: 14, y: 6, radius: 8, terrain: 'hills', travelCostMultiplier: 1.1, regionType: 'strategic_pass', bonus: 'مرتفعات استراتيجية' },
  { id: 'gaza', name: 'غزة', x: 10, y: 10, radius: 8, terrain: 'coast', travelCostMultiplier: 1, regionType: 'trade_hub', bonus: 'طريق الساحل' },
  { id: 'jerusalem', name: 'القدس', x: 12, y: 9, radius: 8, terrain: 'hills', travelCostMultiplier: 1.15, regionType: 'religious_site', bonus: 'موقع ديني' },
  { id: 'alexandria', name: 'الإسكندرية', x: -4, y: 2, radius: 10, terrain: 'coast', travelCostMultiplier: 0.9, regionType: 'trade_hub', bonus: 'ميناء رئيسي' },
  { id: 'damietta', name: 'دمياط', x: -2, y: 4, radius: 8, terrain: 'coast', travelCostMultiplier: 0.95, regionType: 'trade_hub', bonus: 'بوابة النيل' },
];

export const resources = (wood = 0, stone = 0, iron = 0, food = 0, gold = 0): Resources => ({
  wood,
  stone,
  iron,
  food,
  gold,
});
const cost = resources;
const building = (name: string, c: Resources, seconds: number) => ({
  name,
  cost: c,
  seconds,
  growth: 1.55,
  maxLevel: 20,
});
export const defaultKingdomsConfig: KingdomsConfig = {
  commanders: defaultCommanderConfig,
  progression: defaultVillageProgression,
  construction: defaultConstructionConfig,
  worldRadius: 200,
  seasonSeconds: 60 * 86400,
  protectionSeconds: 3 * 86400,
  startingResources: cost(900, 900, 900, 900, 150),
  baseProduction: cost(80, 65, 55, 100, 5),
  storageBase: 2000,
  storagePerLevel: 1500,
  productionPerLevel: 0.35,
  secondsPerTile: 90,
  expansionCost: cost(900, 900, 900, 700, 100),
  maxVillages: 8,
  throneUnlockFraction: 0.6,
  questReward: cost(100, 100, 100, 100, 25),
  questScore: 25,
  wallDefensePerLevel: 0.08,
  barracksSpeedPerLevel: 0.05,
  occupationTroops: 5,
  settlerHallLevel: 3,
  throneGoldWeight: 10,
  combatLossExponent: 1.4,
  siegeConfig: defaultSiegeConfig,
  vision: {
    visionRadiusByBuilding: { wall: 4, stable: 3 },
    towerBuildingKey: 'wall',
    sharedVisionRadius: 3,
    visionExpiryMs: 300_000,
  },
  defaultRegions: historicalRegions,
  caravans: {
    baseSpeedTilesPerSecond: 4,
    interceptWindowSeconds: 60,
    maxCaravanResources: 50000,
    escortDefenseBonus: 0.25,
  },
  buildings: {
    hall: building('دار الحكم', cost(140, 160, 80, 50, 10), 120),
    lumber: building('حطّاب المملكة', cost(80, 100, 50, 30), 60),
    quarry: building('محجر الحجر', cost(100, 70, 50, 30), 60),
    mine: building('منجم الحديد', cost(100, 100, 40, 40), 80),
    farm: building('مزارع الغذاء', cost(80, 80, 30, 20), 60),
    treasury: building('بيت الذهب', cost(250, 250, 150, 80, 20), 180),
    warehouse: building('المخزن', cost(120, 160, 60, 40), 100),
    barracks: building('الثكنة', cost(180, 140, 120, 60), 120),
    // Cavalry yard beside the barracks: a little more wood, iron and food, less stone.
    // Same 120s base, 1.55 growth and level cap. No other building cost changes.
    stable: building('الإسطبل', cost(200, 120, 140, 80), 120),
    wall: building('السور', cost(80, 220, 100, 30), 100),
    market: building('السوق', cost(200, 180, 100, 80, 10), 150),
    embassy: building('دار العهد', cost(200, 200, 80, 60, 20), 150),
  },
  units: {
    guard: {
      name: 'حارس',
      cost: cost(35, 15, 45, 25),
      seconds: 30,
      attack: 30,
      defense: 50,
      speed: 1,
      carry: 40,
      upkeep: 1,
    },
    rider: {
      name: 'خيّال',
      cost: cost(80, 35, 90, 70, 2),
      seconds: 75,
      attack: 95,
      defense: 45,
      speed: 1.8,
      carry: 100,
      upkeep: 3,
    },
    scout: {
      name: 'كشّاف',
      cost: cost(40, 15, 20, 35),
      seconds: 40,
      attack: 4,
      defense: 8,
      speed: 2.5,
      carry: 0,
      upkeep: 1,
    },
    settler: {
      name: 'مستوطن',
      cost: cost(300, 300, 250, 200, 30),
      seconds: 300,
      attack: 1,
      defense: 5,
      speed: 0.7,
      carry: 0,
      upkeep: 2,
    },
  },
};
const positive = z.number().finite().min(0.01).max(1e9);
export const resourcesSchema = z
  .object(
    Object.fromEntries(resourceKeys.map((k) => [k, z.number().finite().min(0).max(1e9)])) as Record<
      (typeof resourceKeys)[number],
      z.ZodNumber
    >,
  )
  .strict();
export const kingdomsConfigSchema = z
  .object({
    commanders: commanderConfigSchema,
    progression: villageProgressionSchema.optional(),
    construction: constructionConfigSchema.optional(),
    worldRadius: z.number().int().min(5).max(1000),
    seasonSeconds: positive.max(365 * 86400),
    protectionSeconds: positive.max(365 * 86400),
    startingResources: resourcesSchema,
    baseProduction: resourcesSchema,
    storageBase: positive,
    storagePerLevel: positive,
    productionPerLevel: z.number().min(0).max(10),
    secondsPerTile: positive,
    expansionCost: resourcesSchema,
    maxVillages: z.number().int().min(1).max(100),
    throneUnlockFraction: z.number().min(0).max(1),
    questReward: resourcesSchema,
    questScore: z.number().int().min(0).max(100000),
    wallDefensePerLevel: z.number().min(0).max(10),
    barracksSpeedPerLevel: z.number().min(0).max(10),
    occupationTroops: z.number().int().min(1).max(10000),
    settlerHallLevel: z.number().int().min(1).max(50),
    throneGoldWeight: z.number().min(1).max(1000),
    combatLossExponent: z.number().min(0.1).max(5),
    siegeConfig: z
      .object({
        stages: z.array(
          z.object({
            key: z.enum(['approaching', 'besieging', 'assaulting', 'withdrawing']),
            durationMs: positive,
          }),
        ),
        supplyRate: z.number().min(0).max(10),
        tickIntervalMs: positive,
        damagePerTick: z.number().min(0).max(100),
        wallDamage: z.number().min(0).max(100),
        supplyBuildingKeys: z.array(z.enum(buildingKeys)),
        maxSiegeTicks: z.number().int().min(1).max(1000),
      })
      .optional(),
    vision: z
      .object({
        visionRadiusByBuilding: z.record(z.enum(buildingKeys), z.number().nonnegative()),
        towerBuildingKey: z.enum(buildingKeys),
        sharedVisionRadius: z.number().nonnegative(),
        visionExpiryMs: positive,
      })
      .optional(),
    defaultRegions: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          x: z.number(),
          y: z.number(),
          radius: z.number().positive(),
          terrain: z.enum(['plains', 'hills', 'mountains', 'coast', 'desert', 'river']),
          travelCostMultiplier: z.number().positive(),
          regionType: z.enum(['historical_city', 'trade_hub', 'religious_site', 'strategic_pass']),
          bonus: z.string().min(1),
        }),
      )
      .optional(),
    caravans: z
      .object({
        baseSpeedTilesPerSecond: positive,
        interceptWindowSeconds: positive,
        maxCaravanResources: z.number().min(0).max(1e9),
        escortDefenseBonus: z.number().min(0).max(10),
      })
      .optional(),
    buildings: z.record(
      z.enum(buildingKeys),
      z
        .object({
          name: z.string().min(1).max(80),
          cost: resourcesSchema,
          seconds: positive,
          growth: z.number().min(1).max(4),
          maxLevel: z.number().int().min(1).max(50),
        })
        .strict(),
    ),
    units: z.record(
      z.enum(unitKeys),
      z
        .object({
          name: z.string().min(1).max(80),
          cost: resourcesSchema,
          seconds: positive,
          attack: positive,
          defense: positive,
          speed: positive,
          carry: z.number().min(0).max(1e6),
          upkeep: z.number().min(0).max(1e6),
        })
        .strict(),
    ),
  })
  .strict()
  .refine((c) => resourceKeys.every((k) => c.startingResources[k] <= c.storageBase), {
    message: 'Starting resources must fit initial storage',
  });

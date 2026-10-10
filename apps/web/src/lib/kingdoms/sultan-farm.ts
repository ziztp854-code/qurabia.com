import { z } from 'zod';
import { assertRule, storageCapacity } from './simulation';
import type { KingdomsConfig, Village } from './types';

export const legacyCropKeys = ['wheat', 'beans', 'pomegranate'] as const;
export const cropKeys = [
  ...legacyCropKeys,
  'rose',
  'mint',
  'jasmine',
  'lavender',
  'sunflower',
  'iris',
] as const;
export type CropKey = (typeof cropKeys)[number];
export const farmPolicy = Object.freeze({ version: 2, plotCount: 12 });
// Existing IDs and families are retained. New unlocks and time depend only on the garden.
export const farmCrops = {
  wheat: {
    name: 'القمح',
    family: 'grain',
    growMinutes: 5,
    unlockHarvests: 0,
    form: 'grain',
    color: 'gold',
  },
  beans: {
    name: 'الفاصوليا',
    family: 'legume',
    growMinutes: 8,
    unlockHarvests: 0,
    form: 'pods',
    color: 'green',
  },
  pomegranate: {
    name: 'الرمان',
    family: 'fruit',
    growMinutes: 15,
    unlockHarvests: 0,
    form: 'tree',
    color: 'red',
  },
  rose: {
    name: 'الورد الجوري',
    family: 'flower',
    growMinutes: 10,
    unlockHarvests: 0,
    form: 'rose',
    color: 'red',
  },
  mint: {
    name: 'النعناع',
    family: 'herb',
    growMinutes: 5,
    unlockHarvests: 0,
    form: 'herb',
    color: 'green',
  },
  jasmine: {
    name: 'الياسمين',
    family: 'flower',
    growMinutes: 12,
    unlockHarvests: 3,
    form: 'star',
    color: 'ivory',
  },
  lavender: {
    name: 'الخزامى',
    family: 'herb',
    growMinutes: 20,
    unlockHarvests: 5,
    form: 'spike',
    color: 'violet',
  },
  sunflower: {
    name: 'دوار الشمس',
    family: 'flower',
    growMinutes: 18,
    unlockHarvests: 8,
    form: 'sun',
    color: 'gold',
  },
  iris: {
    name: 'السوسن',
    family: 'flower',
    growMinutes: 25,
    unlockHarvests: 12,
    form: 'iris',
    color: 'violet',
  },
} as const;
const bounded = z.number().finite().min(0).max(1e9);
const timestamp = z.number().int().min(0).max(8e12);
const count = z.number().int().min(0).max(1e9);
const family = z.enum(['grain', 'legume', 'fruit', 'flower', 'herb']);
// A v1 contract is a paid promise: keep every frozen field, never reprice or convert.
const legacyPlantSchema = z
  .object({
    crop: z.enum(legacyCropKeys),
    plantedAt: timestamp,
    readyAt: timestamp,
    seedFood: bounded,
    harvestFood: bounded,
    rotated: z.boolean(),
    policyVersion: z.literal(1),
  })
  .strict();
const cosmeticPlantSchema = z
  .object({
    crop: z.enum(cropKeys),
    plantedAt: timestamp,
    readyAt: timestamp,
    seedFood: z.literal(0),
    harvestFood: z.literal(0),
    rotated: z.literal(false),
    policyVersion: z.literal(2),
  })
  .strict();
const plantSchema = z
  .discriminatedUnion('policyVersion', [legacyPlantSchema, cosmeticPlantSchema])
  .refine((plant) => plant.readyAt > plant.plantedAt);
const plotSchema = z
  .object({
    version: z.number().int().min(0).max(2147483647),
    previousFamily: family.optional(),
    plant: plantSchema.optional(),
  })
  .strict();
export const gardenStyles = {
  natural: { name: 'أحواض طبيعية', unlockHarvests: 0 },
  ivory: { name: 'إطار عاجي', unlockHarvests: 5 },
  gold: { name: 'إطار ذهبي', unlockHarvests: 12 },
} as const;
export const gardenStyleKeys = ['natural', 'ivory', 'gold'] as const;
const progressSchema = z
  .object({
    version: z.literal(1),
    harvests: count,
    collected: z.partialRecord(z.enum(cropKeys), count),
    style: z.enum(gardenStyleKeys),
  })
  .strict();
export const farmStateSchema = z
  .object({
    // Retain the envelope version and plot generations. Garden is additive.
    version: z.literal(1),
    plots: z.array(plotSchema).length(farmPolicy.plotCount),
    garden: progressSchema.optional(),
  })
  .strict();
export type FarmState = z.infer<typeof farmStateSchema>;
export type FarmPlant = z.infer<typeof plantSchema>;
export type FarmPlot = FarmState['plots'][number];
export type GardenProgress = z.infer<typeof progressSchema>;

export const gardenMilestones = [
  {
    id: 'garden:first-bloom',
    name: 'أول حصاد',
    metric: 'harvests',
    target: 1,
    reward: 'وسام أول حصاد',
  },
  {
    id: 'garden:variety',
    name: 'حديقة متنوعة',
    metric: 'variety',
    target: 3,
    reward: 'وسام حديقة متنوعة',
  },
  {
    id: 'garden:caretaker',
    name: 'راعي الحديقة',
    metric: 'harvests',
    target: 5,
    reward: 'وسام راعي الحديقة + إطار عاجي + الخزامى',
  },
  {
    id: 'garden:royal-garden',
    name: 'حديقة السلطان',
    metric: 'harvests',
    target: 12,
    reward: 'وسام حديقة السلطان + إطار ذهبي + السوسن',
  },
] as const;

export function farmState(village: Pick<Village, 'sultanFarm'>): FarmState {
  // No writes or migrations on reads, time passage, or failed commands.
  return farmStateSchema.parse(
    village.sultanFarm ?? {
      version: 1,
      plots: Array.from({ length: farmPolicy.plotCount }, () => ({ version: 0 })),
    },
  );
}
export function gardenProgress(farm: FarmState): GardenProgress {
  return farm.garden ?? { version: 1, harvests: 0, collected: {}, style: 'natural' };
}
export function gardenGoals(farm: FarmState) {
  const progress = gardenProgress(farm);
  const variety = Object.values(progress.collected).filter((value) => value && value > 0).length;
  return gardenMilestones.map((goal) => {
    const value = goal.metric === 'harvests' ? progress.harvests : variety;
    return {
      ...goal,
      value,
      remaining: Math.max(0, goal.target - value),
      earned: value >= goal.target,
    };
  });
}
export function gardenHarvestPreview(
  farm: FarmState,
  crop: CropKey,
  ownedBadges: readonly string[] = [],
) {
  const progress = gardenProgress(farm);
  const next = {
    ...farm,
    garden: {
      ...progress,
      harvests: progress.harvests + 1,
      collected: { ...progress.collected, [crop]: (progress.collected[crop] ?? 0) + 1 },
    },
  };
  const earned = new Set<string>([
    ...ownedBadges,
    ...gardenGoals(farm)
      .filter((goal) => goal.earned)
      .map((goal) => goal.id),
  ]);
  const rewards: string[] = gardenGoals(next)
    .filter((goal) => goal.earned && !earned.has(goal.id))
    .map((goal) => `وسام ${goal.name}`);
  for (const key of gardenStyleKeys)
    if (gardenStyles[key].unlockHarvests === progress.harvests + 1)
      rewards.push(`فتح ${gardenStyles[key].name}`);
  for (const key of cropKeys)
    if (farmCrops[key].unlockHarvests === progress.harvests + 1)
      rewards.push(`فتح ${farmCrops[key].name}`);
  return { harvests: progress.harvests + 1, rewards: [...new Set(rewards)] };
}
/** New seed cycles are free, deterministic, and independent of village economics. */
export function farmQuote(
  _config: KingdomsConfig,
  _level: number,
  crop: CropKey,
  _previousFamily?: FarmPlot['previousFamily'],
) {
  z.number().int().min(0).max(1e9).parse(_level);
  family.optional().parse(_previousFamily);
  z.enum(cropKeys).parse(crop);
  const growMs = farmCrops[crop].growMinutes * 60000;
  const quoteKey = [farmPolicy.version, crop, growMs, farmCrops[crop].unlockHarvests].join(':');
  return {
    crop,
    seedFood: 0 as const,
    harvestFood: 0 as const,
    growMs,
    rotated: false as const,
    quoteKey,
    policyVersion: 2 as const,
  };
}
export function plantFarm(
  config: KingdomsConfig,
  village: Village,
  plotId: number,
  expectedVersion: number,
  crop: CropKey,
  now: number,
  expectedQuote?: string,
) {
  z.enum(cropKeys).parse(crop);
  const farm = farmState(village),
    plot = farm.plots[plotId];
  assertRule(plot && plot.version === expectedVersion, 'تغير الحوض؛ حدّث المزرعة ثم أعد المحاولة');
  assertRule(plot.version < 2147483646, 'بلغ الحوض حد العمليات');
  assertRule(!plot.plant, 'الحوض مشغول بالفعل');
  assertRule(
    gardenProgress(farm).harvests >= farmCrops[crop].unlockHarvests,
    'اجمع المزيد من محاصيل الحديقة لفتح هذا النبات',
  );
  const { growMs, quoteKey, ...contract } = farmQuote(
    config,
    village.buildings.farm,
    crop,
    plot.previousFamily,
  );
  assertRule(
    expectedQuote === undefined || expectedQuote === quoteKey,
    'تغير عرض الزراعة؛ حدّث المزرعة وراجع المدة والمكافأة',
  );
  const plant = plantSchema.parse({ ...contract, plantedAt: now, readyAt: now + growMs });
  farm.plots[plotId] = { ...plot, version: plot.version + 1, plant };
  village.sultanFarm = farm;
}
/** Return badge IDs for Player.achievements, never the economic claim path. */
export function harvestFarm(
  config: KingdomsConfig,
  village: Village,
  plotId: number,
  expectedVersion: number,
  now: number,
): string[] {
  timestamp.parse(now);
  const farm = farmState(village),
    plot = farm.plots[plotId];
  assertRule(plot && plot.version === expectedVersion, 'تغير الحوض؛ حدّث المزرعة ثم أعد المحاولة');
  assertRule(plot.version < 2147483647, 'بلغ الحوض حد العمليات');
  assertRule(plot.plant, 'لا يوجد محصول في هذا الحوض');
  assertRule(now >= plot.plant.readyAt, 'المحصول لم ينضج بعد');
  if (plot.plant.policyVersion === 1) {
    // Approved transition: satisfy the frozen paid promise exactly once, then retire it.
    assertRule(
      village.resources.food + plot.plant.harvestFood <= storageCapacity(config, village),
      'المخزن لا يسع المحصول؛ وفر مساحة أولاً، ويبقى المحصول محفوظًا',
    );
    village.resources.food += plot.plant.harvestFood;
  } else {
    const progress = gardenProgress(farm);
    farm.garden = progressSchema.parse({
      ...progress,
      harvests: progress.harvests + 1,
      collected: {
        ...progress.collected,
        [plot.plant.crop]: (progress.collected[plot.plant.crop] ?? 0) + 1,
      },
    });
  }
  farm.plots[plotId] = {
    version: plot.version + 1,
    previousFamily: farmCrops[plot.plant.crop].family,
  };
  village.sultanFarm = farm;
  return gardenGoals(farm)
    .filter((goal) => goal.earned)
    .map((goal) => goal.id);
}
export function styleFarm(village: Village, style: keyof typeof gardenStyles) {
  z.enum(gardenStyleKeys).parse(style);
  const farm = farmState(village),
    progress = gardenProgress(farm);
  assertRule(
    progress.harvests >= gardenStyles[style].unlockHarvests,
    'اجمع المزيد من محاصيل الحديقة لفتح هذه الزينة',
  );
  farm.garden = { ...progress, style };
  village.sultanFarm = farm;
}
export const farmStageNames = {
  seed: 'بذرة',
  sprout: 'برعم',
  growing: 'نمو',
  fruiting: 'إزهار',
  ripe: 'ناضج',
} as const;
export function farmGrowth(plant: FarmPlant, serverNow: number) {
  assertRule(
    Number.isFinite(serverNow) &&
      serverNow >= 0 &&
      serverNow <= 8e12 &&
      Number.isSafeInteger(plant.plantedAt) &&
      plant.plantedAt >= 0 &&
      Number.isSafeInteger(plant.readyAt) &&
      plant.readyAt <= 8e12 &&
      plant.readyAt > plant.plantedAt &&
      cropKeys.includes(plant.crop),
    'وقت نمو أو نبات غير صالح',
  );
  const progress = Math.min(
    1,
    Math.max(0, (serverNow - plant.plantedAt) / (plant.readyAt - plant.plantedAt)),
  );
  const stage: keyof typeof farmStageNames =
    progress >= 1
      ? 'ripe'
      : progress >= 0.75
        ? 'fruiting'
        : progress >= 0.35
          ? 'growing'
          : progress >= 0.08
            ? 'sprout'
            : 'seed';
  return { progress, stage, remainingMs: Math.max(0, plant.readyAt - serverNow) };
}

import { z } from 'zod';
import { resources } from './config';
import { assertRule, hourlyYield, spend, storageCapacity } from './simulation';
import type { KingdomsConfig, Village } from './types';

export const cropKeys = ['wheat', 'beans', 'pomegranate'] as const;
export type CropKey = (typeof cropKeys)[number];
export const farmPolicy = Object.freeze({
  version: 1,
  plotCount: 12,
  seedShare: 0.1,
  harvestShare: 0.4,
  rotationDurationFactor: 0.95,
});
export const farmCrops = {
  wheat: { name: 'قمح', family: 'grain', minLevel: 1, durationMultiplier: 60 },
  beans: { name: 'فاصوليا', family: 'legume', minLevel: 3, durationMultiplier: 240 },
  pomegranate: { name: 'رمان', family: 'fruit', minLevel: 5, durationMultiplier: 720 },
} as const;
const bounded = z.number().finite().min(0).max(1e9);
const timestamp = z.number().int().min(0).max(8e12);
const family = z.enum(['grain', 'legume', 'fruit']);
const plantSchema = z
  .object({
    crop: z.enum(cropKeys),
    plantedAt: timestamp,
    readyAt: timestamp,
    seedFood: bounded,
    harvestFood: bounded,
    rotated: z.boolean(),
    policyVersion: z.literal(1),
  })
  .strict()
  .refine((plant) => plant.readyAt > plant.plantedAt);
const plotSchema = z
  .object({
    version: z.number().int().min(0).max(2147483647),
    previousFamily: family.optional(),
    plant: plantSchema.optional(),
  })
  .strict();
export const farmStateSchema = z
  .object({
    version: z.literal(1),
    plots: z.array(plotSchema).length(farmPolicy.plotCount),
  })
  .strict();
export type FarmState = z.infer<typeof farmStateSchema>;
export type FarmPlant = z.infer<typeof plantSchema>;
export type FarmPlot = FarmState['plots'][number];

export function farmState(village: Pick<Village, 'sultanFarm'>): FarmState {
  // Older villages remain untouched; initialize only on the first successful planting.
  return farmStateSchema.parse(
    village.sultanFarm ?? {
      version: 1,
      plots: Array.from({ length: farmPolicy.plotCount }, () => ({ version: 0 })),
    },
  );
}

/** A planting contract freezes prices, yield and duration against later upgrades/config edits. */
export function farmQuote(
  config: KingdomsConfig,
  level: number,
  crop: CropKey,
  previousFamily?: FarmPlot['previousFamily'],
) {
  const spec = farmCrops[crop];
  const durationMs = Math.round(config.buildings.farm.seconds * spec.durationMultiplier * 1000);
  const budget = (hourlyYield(config, 'food', level) * durationMs) / 3600000 / farmPolicy.plotCount;
  // Thousandths are already supported by the existing fractional village stock.
  const seedFood = Math.ceil(budget * farmPolicy.seedShare * 1000) / 1000;
  const harvestFood = Math.floor(budget * farmPolicy.harvestShare * 1000) / 1000;
  const rotated = Boolean(previousFamily && previousFamily !== spec.family);
  const growMs = Math.round(durationMs * (rotated ? farmPolicy.rotationDurationFactor : 1));
  assertRule(
    Number.isSafeInteger(growMs) &&
      growMs > 0 &&
      growMs < 8e12 &&
      seedFood <= 1e9 &&
      harvestFood <= 1e9 &&
      harvestFood > seedFood,
    'إعدادات الاقتصاد لا تسمح بهذا المحصول',
  );
  const quoteKey = [farmPolicy.version, level, crop, seedFood, harvestFood, growMs].join(':');
  return { crop, seedFood, harvestFood, growMs, rotated, quoteKey, policyVersion: 1 as const };
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
  const farm = farmState(village),
    plot = farm.plots[plotId];
  assertRule(plot && plot.version === expectedVersion, 'تغير الحوض؛ حدّث المزرعة ثم أعد المحاولة');
  assertRule(plot.version < 2147483646, 'وصل الحوض إلى حد العمليات');
  assertRule(!plot.plant, 'الحوض مزروع بالفعل');
  assertRule(
    village.buildings.farm >= farmCrops[crop].minLevel,
    'ارفع مستوى المزرعة لفتح هذه البذرة',
  );
  const quote = farmQuote(config, village.buildings.farm, crop, plot.previousFamily);
  const { growMs, quoteKey, ...contract } = quote;
  assertRule(
    expectedQuote === undefined || expectedQuote === quoteKey,
    'تغيرت تكلفة الزراعة أو مدتها؛ حدّث المزرعة وراجع العرض الجديد',
  );
  const plant = plantSchema.parse({ ...contract, plantedAt: now, readyAt: now + growMs });
  spend(village, resources(0, 0, 0, quote.seedFood));
  farm.plots[plotId] = { ...plot, version: plot.version + 1, plant };
  village.sultanFarm = farm;
}

export function harvestFarm(
  config: KingdomsConfig,
  village: Village,
  plotId: number,
  expectedVersion: number,
  now: number,
) {
  const farm = farmState(village),
    plot = farm.plots[plotId];
  assertRule(plot && plot.version === expectedVersion, 'تغير الحوض؛ حدّث المزرعة ثم أعد المحاولة');
  assertRule(plot.plant, 'لا يوجد محصول في هذا الحوض');
  assertRule(now >= plot.plant.readyAt, 'المحصول لم ينضج بعد');
  assertRule(
    village.resources.food + plot.plant.harvestFood <= storageCapacity(config, village),
    'المخزن لا يتسع للمحصول؛ يبقى محفوظًا في الحوض حتى تفرغ مساحة أو تطور المخزن',
  );
  // Reject rather than using credit(), which deliberately clips passive overflow.
  village.resources.food += plot.plant.harvestFood;
  farm.plots[plotId] = {
    version: plot.version + 1,
    previousFamily: farmCrops[plot.plant.crop].family,
  };
  village.sultanFarm = farm;
}

export const farmStageNames = {
  seed: 'بذرة',
  sprout: 'إنبات',
  growing: 'نمو',
  fruiting: 'إثمار',
  ripe: 'ناضج',
} as const;
export function farmGrowth(plant: FarmPlant, serverNow: number) {
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

import { z } from 'zod';
import { buildingKeys, unitKeys, type VillageProgressionConfig } from './types';

export const defaultVillageProgression: VillageProgressionConfig = {
  maxLevel: 50,
  xpStep: 25,
  buildingXp: 100,
  trainingXp: 5,
  achievementXp: 250,
  territoryXp: 100,
  buildingPower: 50,
  defensePower: 80,
  economicPower: 40,
  strategicPower: 100,
  unitPower: { guard: 8, rider: 14, scout: 2, settler: 1 },
  milestones: [
    { level: 10, buildings: { hall: 3, warehouse: 2 } },
    { level: 20, buildings: { hall: 6, warehouse: 5, wall: 3 } },
    { level: 30, buildings: { hall: 10, warehouse: 9, wall: 6 } },
    { level: 40, buildings: { hall: 14, warehouse: 12, wall: 10 } },
    { level: 50, buildings: { hall: 18, warehouse: 16, wall: 15 } },
  ],
  ranks: [
    { from: 1, name: 'مستوطنة' },
    { from: 6, name: 'قرية' },
    { from: 11, name: 'قرية مزدهرة' },
    { from: 21, name: 'بلدة' },
    { from: 31, name: 'مدينة' },
    { from: 41, name: 'مدينة عظيمة' },
    { from: 50, name: 'حاضرة مملوكية' },
  ],
  tiers: [
    { from: 1, tier: 1 },
    { from: 6, tier: 2 },
    { from: 11, tier: 3 },
    { from: 21, tier: 4 },
    { from: 31, tier: 5 },
    { from: 41, tier: 6 },
  ],
};
const weight = z.number().int().min(0).max(100000);
const level = z.number().int().min(1).max(50);
const ordered = (items: { from: number }[]) =>
  items[0]?.from === 1 && items.every((item, i) => i === 0 || item.from > items[i - 1].from);
export const villageProgressionSchema = z
  .object({
    maxLevel: level,
    xpStep: weight.min(1),
    buildingXp: weight,
    trainingXp: weight,
    achievementXp: weight,
    territoryXp: weight,
    buildingPower: weight,
    defensePower: weight,
    economicPower: weight,
    strategicPower: weight,
    unitPower: z.record(z.enum(unitKeys), weight),
    milestones: z
      .array(z.object({ level, buildings: z.partialRecord(z.enum(buildingKeys), level) }).strict())
      .max(50),
    ranks: z
      .array(z.object({ from: level, name: z.string().min(1).max(60) }).strict())
      .min(1)
      .max(50)
      .refine(ordered),
    tiers: z
      .array(z.object({ from: level, tier: z.number().int().min(1).max(6) }).strict())
      .min(1)
      .max(6)
      .refine(ordered),
  })
  .strict();

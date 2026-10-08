import { z } from 'zod';
import { worldIdSchema } from './api-schema';

export const gardenCategories = [
  { id: 'roses', name: 'الورود' },
  { id: 'plants', name: 'النباتات' },
  { id: 'trees', name: 'الأشجار' },
  { id: 'decorations', name: 'الزينة' },
  { id: 'fountains', name: 'النوافير' },
  { id: 'paths', name: 'الممرات' },
  { id: 'benches', name: 'المقاعد' },
] as const;
export type GardenCategory = (typeof gardenCategories)[number]['id'];
const art = '/game-art/kingdoms/city-scenes/garden/';
export const gardenCatalog = [
  { id: 'red-roses', category: 'roses', name: 'ورد أحمر', width: 0.073, height: 0.09 },
  { id: 'white-roses', category: 'roses', name: 'ورد أبيض', width: 0.073, height: 0.09 },
  { id: 'yellow-roses', category: 'roses', name: 'ورد أصفر', width: 0.073, height: 0.09 },
  { id: 'pink-roses', category: 'roses', name: 'ورد وردي', width: 0.073, height: 0.09 },
  { id: 'purple-flowers', category: 'roses', name: 'زهور بنفسجية', width: 0.073, height: 0.09 },
  { id: 'tulips', category: 'plants', name: 'توليب', width: 0.073, height: 0.09 },
  { id: 'jasmine', category: 'plants', name: 'ياسمين', width: 0.073, height: 0.09 },
  { id: 'green-shrub', category: 'plants', name: 'شجيرة خضراء', width: 0.073, height: 0.1 },
  { id: 'cypress-tree', category: 'trees', name: 'شجرة سرو', width: 0.065, height: 0.17 },
  { id: 'gold-planter', category: 'decorations', name: 'حوض مزخرف', width: 0.07, height: 0.09 },
  { id: 'fountain', category: 'fountains', name: 'نافورة حجرية', width: 0.075, height: 0.115 },
  { id: 'path-stone', category: 'paths', name: 'ممر حجري', width: 0.075, height: 0.065 },
  { id: 'bench', category: 'benches', name: 'مقعد خشبي', width: 0.075, height: 0.075 },
] as const;
export type GardenItemId = (typeof gardenCatalog)[number]['id'];
export const gardenAsset = (id: GardenItemId, options: { thumbnail?: boolean; variation?: number } = {}) => {
  const alternate = !options.thumbnail && (id === 'red-roses' || id === 'green-shrub') && (options.variation ?? 0) % 2 === 1;
  return `${art}${id}${alternate ? '-b' : ''}${options.thumbnail ? '-thumb' : ''}.webp`;
};
// Stable saved slot IDs, projected onto the user's 1670×942 empty courtyard.
export const gardenSlots = [
  [622, 427], [690, 427], [980, 427], [1048, 427],
  [595, 480], [680, 480], [992, 480], [1078, 480],
  [597, 590], [1079, 590], [562, 706], [1129, 706],
].map(([x, y], id) => ({ id, x: x / 1670, y: y / 942 }));
const itemId = z.enum(gardenCatalog.map((item) => item.id));
export const gardenColors = ['red', 'yellow', 'blue', 'green', 'orange', 'brown'] as const;
export type GardenColor = (typeof gardenColors)[number];
export const gardenColorTint: Record<GardenColor, number> = {
  red: 0xff7e78, yellow: 0xffeb90, blue: 0x9cc7ff, green: 0xb4d49a, orange: 0xffbe8a, brown: 0xd1b49a,
};
export const gardenSlotsSchema = z.array(z.object({ slotId: z.number().int().min(0).max(11), itemId, color: z.enum(gardenColors).optional() }).strict())
  .max(12).refine((slots) => new Set(slots.map((slot) => slot.slotId)).size === slots.length, 'Duplicate garden slot');
export type GardenPlacement = z.infer<typeof gardenSlotsSchema>[number];
export const gardenReadSchema = z.object({ worldId: worldIdSchema, villageId: worldIdSchema }).strict();
export const gardenSaveSchema = gardenReadSchema.extend({ slots: gardenSlotsSchema });
export const gardenViewSchema = gardenReadSchema.extend({
  playerId: z.string().min(1).max(100), revision: z.number().int().nonnegative(), slots: gardenSlotsSchema,
});
export type PalaceGardenView = z.infer<typeof gardenViewSchema>;

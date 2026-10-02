import { villageBuildingRegistry, type VillageBuildingId } from './buildingRegistry';
import { getVillagePlacement, VILLAGE_WORLD } from './coordinates';
import type { WorldPoint, WorldRect } from './types';

export type VillageAssetSlot = Readonly<{
  id: string;
  src: string | null;
  filename: string;
  placeholder: boolean;
  worldRect: WorldRect;
  anchor: WorldPoint;
  zIndex: number;
  alpha: boolean;
  animated: boolean;
  frames: readonly string[];
  // Existing source-art crops remain the fallback; missing art is never synthesized.
  fallbackCrop?: WorldRect;
  description: string;
}>;
export type VillageNPC =
  | 'worker'
  | 'farmer'
  | 'merchant'
  | 'guard'
  | 'soldier'
  | 'horse'
  | 'cart'
  | 'stableMaster'
  | 'cavalry';
const original = '/game-art/kingdoms/village-oasis.webp';

const slot = (
  id: string,
  description: string,
  worldRect: WorldRect,
  options: Partial<VillageAssetSlot> = {},
): VillageAssetSlot => ({
  id,
  src: null,
  filename: `${id}.webp`,
  placeholder: true,
  worldRect,
  anchor: { x: 0.5, y: 1 },
  zIndex: worldRect.y + worldRect.height,
  alpha: true,
  animated: false,
  frames: [],
  description,
  ...options,
});

export const villageAssetNames: Partial<Record<VillageBuildingId, string>> = {
  hall: 'palace',
  lumber: 'lumbercamp',
  mine: 'ironmine',
  wall: 'walls',
  tower: 'watchtowers',
  archery: 'archery-range',
  siege: 'siege-workshop',
  rally: 'rally-square',
  hospital: 'bimaristan',
  knowledge: 'knowledge-house',
  traders: 'merchants-khan',
  industry: 'industry-house',
};
const existingDetails: Partial<Record<VillageBuildingId, WorldRect>> = {
  hall: { x: 836, y: 345, width: 14, height: 44 },
  farm: { x: 1366, y: 392, width: 56, height: 36 },
  market: { x: 1092, y: 686, width: 43, height: 34 },
  wall: { x: 688, y: 800, width: 12, height: 43 },
};
const buildings = Object.fromEntries(
  villageBuildingRegistry.map(({ id, name }): [VillageBuildingId, readonly VillageAssetSlot[]] => {
    const { x, y, width, height, zIndex } = getVillagePlacement(id);
    return [
      id,
      [1, 2, 3, 4, 5].map((level) =>
        slot(
          `${id}-l${level}`,
          `${name}: أصل مستقل للمستوى ${level} لم يُجهز بعد`,
          { x, y, width, height },
          {
            filename: `${villageAssetNames[id] ?? id}-l${level}.webp`,
            zIndex,
            fallbackCrop: existingDetails[id],
          },
        ),
      ),
    ];
  }),
) as Readonly<Record<VillageBuildingId, readonly VillageAssetSlot[]>>;

const npcSlot = (id: VillageNPC, description: string, crop?: WorldRect) =>
  slot(
    `npc-${id}`,
    description,
    { x: 0, y: 0, width: crop?.width ?? 24, height: crop?.height ?? 24 },
    {
      filename: `${id === 'stableMaster' ? 'stable-master' : id}-atlas.webp`,
      animated: true,
      fallbackCrop: crop,
    },
  );
const environmentPlots = {
  waterfall: { x: 0, y: 0, width: 275, height: 337 },
  water: { x: 0, y: 791, width: 1536, height: 233 },
  flags: { x: 836, y: 345, width: 14, height: 44 },
  fire: { x: 647, y: 735, width: 199, height: 145 },
  smoke: { x: 431, y: 103, width: 200, height: 181 },
  trees: { x: 1013, y: 177, width: 343, height: 206 },
  palms: { x: 1013, y: 177, width: 343, height: 206 },
  birds: { x: 1075, y: 18, width: 200, height: 70 },
  dust: { x: 279, y: 411, width: 352, height: 187 },
} as const;
const environmentSlot = (
  id: keyof typeof environmentPlots,
  description: string,
  crop?: WorldRect,
) =>
  slot(`environment-${id}`, description, environmentPlots[id], {
    filename: `${id}-atlas.webp`,
    anchor: { x: 0, y: 0 },
    animated: true,
    fallbackCrop: crop,
  });

export const villageAssets = {
  base: { src: original, ...VILLAGE_WORLD },
  buildings,
  npc: {
    worker: npcSlot('worker', 'عامل من الصورة الأصلية', { x: 406, y: 506, width: 9, height: 18 }),
    farmer: npcSlot('farmer', 'عامل من الصورة الأصلية', { x: 399, y: 505, width: 9, height: 18 }),
    merchant: npcSlot('merchant', 'تاجر من الصورة الأصلية', {
      x: 1175,
      y: 710,
      width: 8,
      height: 18,
    }),
    guard: npcSlot('guard', 'حارس من الصورة الأصلية', { x: 397, y: 506, width: 9, height: 18 }),
    soldier: npcSlot('soldier', 'جندي من الصورة الأصلية', { x: 421, y: 505, width: 9, height: 18 }),
    horse: npcSlot('horse', 'الفارس وراحلته من الصورة الأصلية؛ ليس حصانًا منفصلًا', {
      x: 499,
      y: 511,
      width: 19,
      height: 17,
    }),
    cart: npcSlot('cart', 'عربة من الصورة الأصلية', { x: 1119, y: 748, width: 24, height: 17 }),
    stableMaster: npcSlot('stableMaster', 'أطلس مسؤول الإسطبل مفقود؛ لا يُعرض بديل مصطنع'),
    cavalry: npcSlot('cavalry', 'أطلس فرسان مملوكي مفقود؛ لا يُعرض بديل مصطنع'),
  } satisfies Record<VillageNPC, VillageAssetSlot>,
  environment: {
    waterfall: environmentSlot('waterfall', 'الشلال الأصلي، الحركة ضوء ورذاذ خفيف'),
    water: environmentSlot('water', 'الماء الأصلي، الحركة لمعات خفيفة'),
    flags: environmentSlot('flags', 'راية من الصورة الأصلية', {
      x: 836,
      y: 345,
      width: 14,
      height: 44,
    }),
    fire: environmentSlot('fire', 'النار الأصلية، توهج خفيف'),
    smoke: environmentSlot('smoke', 'الدخان، جزيئات ضوء خفيفة'),
    trees: environmentSlot('trees', 'أصل نخيل متحرك لم يُجهز بعد'),
    palms: environmentSlot('palms', 'أطلس حركة نخيل خفيفة مفقود'),
    birds: environmentSlot('birds', 'أطلس طيور لم يُجهز بعد'),
    dust: environmentSlot('dust', 'أطلس غبار خفيف مفقود'),
    scaffold: slot('scaffold', 'أصل سقالة شفاف لم يُجهز بعد', {
      x: 0,
      y: 0,
      width: 160,
      height: 160,
    }),
  },
  roads: slot(
    'village-roads',
    'طبقة طرق بصرية معتمدة مفقودة؛ تبقى طرق الصورة الأصلية',
    { x: 0, y: 0, ...VILLAGE_WORLD },
    { anchor: { x: 0, y: 0 }, zIndex: 0 },
  ),
} as const;

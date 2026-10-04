import { villageBuildingRegistry, type VillageBuildingId } from './buildingRegistry';
import { fromNormalized, getVillagePlacement, VILLAGE_WORLD } from './coordinates';
import type { WorldPoint, WorldRect, WorldSize } from './types';

export type VillageAssetFidelity = 'standard' | 'hidpi' | 'ultra';
export const villageBaseClassification = 'NATIVE_MASTER_1672' as const;
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
  // Opt in for standalone cutouts; legacy overlay dimensions remain unchanged.
  fit?: 'contain';
  // Only explicitly approved asset crops may opt in; the master needs no overlays.
  fallbackCrop?: WorldRect;
  description: string;
  variants?: Readonly<Partial<Record<VillageAssetFidelity, string | null>>>;
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
const masterArt = '/game-art/kingdoms/village/mamluk-capital-1672.webp';
export const villageArtRenditions = [960, 1280, 1672].map((width) => ({
  width,
  webp: `/game-art/kingdoms/village/mamluk-capital-${width}.webp`,
  avif: `/game-art/kingdoms/village/mamluk-capital-${width}.avif`,
}));

export function resolveVillageAssetSrc(
  slot: Pick<VillageAssetSlot, 'src' | 'variants'>,
  fidelity: VillageAssetFidelity = 'standard',
) {
  const preferred = slot.variants?.[fidelity];
  if (preferred) return preferred;
  if (fidelity === 'ultra') return slot.variants?.hidpi ?? slot.src ?? slot.variants?.standard ?? null;
  if (fidelity === 'hidpi') return slot.src ?? slot.variants?.standard ?? null;
  return slot.src ?? slot.variants?.standard ?? null;
}

export function villageAssetFidelity(mode: 'ultra' | 'high' | 'medium' | 'low'): VillageAssetFidelity {
  if (mode === 'ultra') return 'ultra';
  if (mode === 'high') return 'hidpi';
  return 'standard';
}

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
export const resourceBuildingIds = ['lumber', 'quarry', 'mine', 'farm', 'treasury'] as const;
const resourceBuildings = new Set<VillageBuildingId>(resourceBuildingIds);
// Native paintings exist at L1, L3 and L5; visual slots share their nearest shipped art.
const resourceSourceLevel = (level: number) => level <= 2 ? 1 : level === 3 ? 3 : 5;
const buildings = Object.fromEntries(
  villageBuildingRegistry.map(({ id, name }): [VillageBuildingId, readonly VillageAssetSlot[]] => {
    const { x, y, width, height, zIndex } = getVillagePlacement(id);
    return [id, [1, 2, 3, 4, 5].map((level) => {
      const source = resourceSourceLevel(level);
      const base = `/game-art/kingdoms/village/buildings/${id}-l${source}`;
      const independent = resourceBuildings.has(id);
      return slot(`${id}-l${level}`, independent
        ? `${name}: أصل موارد شفاف مستقل؛ الخانة البصرية ${level} تعرض اللوحة ${source}`
        : `${name}: مدمج في المشهد الرئيسي؛ المستوى المؤكد يظهر برمجيًا`,
      { x, y, width, height }, {
        filename: independent ? `${id}-l${source}.webp` : `${villageAssetNames[id] ?? id}-l${level}.webp`,
        zIndex, fit: 'contain',
        ...(independent ? {
          src: `${base}.webp`, placeholder: false,
          variants: { standard: `${base}.webp`, hidpi: `${base}-hidpi.webp`,
            ...(id === 'mine' && source === 5 ? { ultra: `${base}-ultra.webp` } : {}) },
        } : {}),
      });
    })];
  }),
) as Readonly<Record<VillageBuildingId, readonly VillageAssetSlot[]>>;

const npcSlot = (id: VillageNPC, description: string, size: WorldSize = { width: 24, height: 24 }) =>
  slot(
    `npc-${id}`,
    description,
    { x: 0, y: 0, ...size },
    {
      filename: `${id === 'stableMaster' ? 'stable-master' : id}-atlas.webp`,
      animated: true,
      // Figures are embedded in the new master. Never crop the previous artwork.
    },
  );
const environmentPlots = {
  waterfall: fromNormalized({ x: 0, y: .74, width: .17, height: .2 }),
  water: fromNormalized({ x: 0, y: .89, width: 1, height: .11 }),
  flags: fromNormalized({ x: .48, y: .09, width: .02, height: .06 }),
  fire: fromNormalized({ x: .41, y: .73, width: .19, height: .1 }),
  smoke: fromNormalized({ x: .025, y: .09, width: .12, height: .13 }),
  trees: fromNormalized({ x: .08, y: .18, width: .17, height: .1 }),
  palms: fromNormalized({ x: .62, y: .23, width: .04, height: .1 }),
  birds: fromNormalized({ x: .67, y: .015, width: .12, height: .055 }),
  dust: fromNormalized({ x: .015, y: .035, width: .16, height: .13 }),
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
  base: { src: masterArt, ...VILLAGE_WORLD, classification: villageBaseClassification,
    variants: { standard: '/game-art/kingdoms/village/mamluk-capital-960.webp',
      hidpi: '/game-art/kingdoms/village/mamluk-capital-1280.webp', ultra: masterArt } as const },
  // City tiers remain driven by server progress, without duplicating the embedded art.
  tiers: [1, 2, 3, 4, 5, 6].map((tier) => slot(
    `village-tier-${tier}`,
    'المشهد الرئيسي المملوكي؛ رتبة المدينة تُحسب من التقدم المؤكد',
    { x: 0, y: 0, ...VILLAGE_WORLD },
    {},
  )),
  buildings,
  npc: {
    worker: npcSlot('worker', 'العامل مدمج في المشهد؛ الأطلس المستقل غير متوفر', { width: 9, height: 18 }),
    farmer: npcSlot('farmer', 'المزارع مدمج في المشهد؛ الأطلس المستقل غير متوفر', { width: 9, height: 18 }),
    merchant: npcSlot('merchant', 'التاجر مدمج في المشهد؛ الأطلس المستقل غير متوفر', { width: 8, height: 18 }),
    guard: npcSlot('guard', 'الحارس مدمج في المشهد؛ الأطلس المستقل غير متوفر', { width: 9, height: 18 }),
    soldier: npcSlot('soldier', 'الجندي مدمج في المشهد؛ الأطلس المستقل غير متوفر', { width: 9, height: 18 }),
    horse: npcSlot('horse', 'الحصان مدمج في المشهد؛ الأطلس المستقل غير متوفر', { width: 19, height: 17 }),
    cart: npcSlot('cart', 'العربة مدمجة في المشهد؛ الأطلس المستقل غير متوفر', { width: 24, height: 17 }),
    stableMaster: npcSlot('stableMaster', 'أطلس مسؤول الإسطبل مفقود؛ لا يُعرض بديل مصطنع'),
    cavalry: npcSlot('cavalry', 'أطلس فرسان مملوكي مفقود؛ لا يُعرض بديل مصطنع'),
  } satisfies Record<VillageNPC, VillageAssetSlot>,
  environment: {
    waterfall: environmentSlot('waterfall', 'الماء مدمج في المشهد الرئيسي'),
    water: environmentSlot('water', 'الماء الفيروزي، الحركة لمعات خفيفة'),
    flags: environmentSlot('flags', 'الرايات مدمجة في المشهد الرئيسي'),
    fire: environmentSlot('fire', 'مواضع المشاعل في المشهد الرئيسي'),
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
    }, { src: '/game-art/kingdoms/village/buildings/construction-scaffold.webp',
      filename: 'construction-scaffold.webp', placeholder: false, fit: 'contain' }),
  },
  roads: slot(
    'village-roads',
    'الطرق الواضحة مدمجة في المشهد الرئيسي',
    { x: 0, y: 0, ...VILLAGE_WORLD },
    { anchor: { x: 0, y: 0 }, zIndex: 0 },
  ),
} as const;

import type { Building } from '../types';
import type { WorldRect } from './types';

export type VillageAssetSlot = Readonly<{
  src: string | null;
  placeholder: boolean;
  // Source-art crops preserve the current visual identity until approved sprites exist.
  fallbackCrop?: WorldRect;
  description: string;
}>;
export type VillageNPC = 'worker' | 'farmer' | 'merchant' | 'guard' | 'soldier' | 'horse' | 'cart';
const original = '/game-art/kingdoms/village-oasis.webp';
const cropSlot = (description: string, fallbackCrop?: WorldRect): VillageAssetSlot => ({
  src: null,
  placeholder: true,
  fallbackCrop,
  description,
});
const levelSlots = (name: string, crop?: WorldRect) =>
  [1, 2, 3, 4, 5].map((level) =>
    cropSlot(`${name}: أصل مستقل للمستوى ${level} لم يُجهز بعد`, crop),
  );

export const villageAssets = {
  base: { src: original, width: 1536, height: 1024 },
  buildings: {
    hall: levelSlots('دار الحكم', { x: 836, y: 345, width: 14, height: 44 }),
    farm: levelSlots('المزارع', { x: 1366, y: 392, width: 56, height: 36 }),
    barracks: levelSlots('الثكنة'),
    market: levelSlots('السوق', { x: 1092, y: 686, width: 43, height: 34 }),
    wall: levelSlots('الأسوار', { x: 688, y: 800, width: 12, height: 43 }),
    lumber: levelSlots('ورشة الأخشاب'),
    quarry: levelSlots('المحجر'),
    mine: levelSlots('المنجم'),
    treasury: levelSlots('دار الخزانة'),
    warehouse: levelSlots('المخازن'),
    embassy: levelSlots('دار العهد'),
  } satisfies Record<Building, readonly VillageAssetSlot[]>,
  npc: {
    worker: cropSlot('عامل من الصورة الأصلية', { x: 406, y: 506, width: 9, height: 18 }),
    farmer: cropSlot('عامل من الصورة الأصلية', { x: 399, y: 505, width: 9, height: 18 }),
    merchant: cropSlot('تاجر من الصورة الأصلية', { x: 1175, y: 710, width: 8, height: 18 }),
    guard: cropSlot('حارس من الصورة الأصلية', { x: 397, y: 506, width: 9, height: 18 }),
    soldier: cropSlot('جندي من الصورة الأصلية', { x: 421, y: 505, width: 9, height: 18 }),
    horse: cropSlot('فارس من الصورة الأصلية', { x: 499, y: 511, width: 19, height: 17 }),
    cart: cropSlot('عربة من الصورة الأصلية', { x: 1119, y: 748, width: 24, height: 17 }),
  } satisfies Record<VillageNPC, VillageAssetSlot>,
  environment: {
    waterfall: cropSlot('الشلال الأصلي، الحركة ضوء ورذاذ خفيف'),
    water: cropSlot('الماء الأصلي، الحركة لمعات خفيفة'),
    flags: cropSlot('راية من الصورة الأصلية', { x: 836, y: 345, width: 14, height: 44 }),
    fire: cropSlot('النار الأصلية، توهج خفيف'),
    smoke: cropSlot('الدخان، جزيئات ضوء خفيفة'),
    trees: cropSlot('أصل نخيل متحرك لم يُجهز بعد'),
    birds: cropSlot('أطلس طيور لم يُجهز بعد'),
    scaffold: cropSlot('أصل سقالة لم يُجهز بعد'),
  },
} as const;

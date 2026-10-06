import type { Building, Village } from '../types';
import type { VillageDebugOptions } from './types';

export const villageBuildingIds = [
  'hall',
  'farm',
  'lumber',
  'quarry',
  'mine',
  'warehouse',
  'granary',
  'market',
  'caravanserai',
  'residential',
  'barracks',
  'stable',
  'archery',
  'blacksmith',
  'siege',
  'rally',
  'hospital',
  'knowledge',
  'embassy',
  'treasury',
  'wall',
  'tower',
  'gate',
  'citadel',
  'mosque',
  'madrasa',
  'courthouse',
  'hammam',
  'traders',
  'industry',
] as const;

export type VillageBuildingId = (typeof villageBuildingIds)[number];
export type VillageBuildingDefinition = Readonly<{
  id: VillageBuildingId;
  name: string;
  classification: 'existing' | 'composite' | 'future';
  building?: Building;
  description: string;
  district: 'palace' | 'economy' | 'storage' | 'trade' | 'military' | 'defense' | 'civic';
  interactive: boolean;
}>;

// This registry describes presentation only. It never adds a building to the server model.
export const villageBuildingRegistry: readonly VillageBuildingDefinition[] = [
  {
    id: 'hall',
    name: 'دار الحكم',
    classification: 'existing',
    building: 'hall',
    description: 'إدارة المملكة وتوسيع القرى وفق القواعد الحالية',
    district: 'palace',
    interactive: true,
  },
  {
    id: 'farm',
    name: 'المزارع',
    classification: 'existing',
    building: 'farm',
    description: 'إنتاج الغذاء وفق حالة الخادم',
    district: 'economy',
    interactive: true,
  },
  {
    id: 'lumber',
    name: 'معسكر الأخشاب',
    classification: 'existing',
    building: 'lumber',
    description: 'إنتاج الخشب للبناء',
    district: 'economy',
    interactive: true,
  },
  {
    id: 'quarry',
    name: 'المحجر',
    classification: 'existing',
    building: 'quarry',
    description: 'إنتاج الحجر للتحصينات',
    district: 'economy',
    interactive: true,
  },
  {
    id: 'mine',
    name: 'منجم الحديد',
    classification: 'existing',
    building: 'mine',
    description: 'إنتاج الحديد للجيش',
    district: 'economy',
    interactive: true,
  },
  {
    id: 'warehouse',
    name: 'المخازن',
    classification: 'existing',
    building: 'warehouse',
    description: 'سعة حفظ الموارد المشتركة كما يحددها الخادم',
    district: 'storage',
    interactive: true,
  },
  {
    id: 'granary',
    name: 'مخزن الغلال',
    classification: 'composite',
    building: 'warehouse',
    description: 'جزء بصري من المخازن؛ لا يضيف سعة مستقلة',
    district: 'storage',
    interactive: false,
  },
  {
    id: 'market',
    name: 'السوق',
    classification: 'existing',
    building: 'market',
    description: 'تبادل الموارد عبر السوق الحالي',
    district: 'trade',
    interactive: true,
  },
  {
    id: 'caravanserai',
    name: 'خان القوافل',
    classification: 'composite',
    building: 'market',
    description: 'امتداد بصري للسوق دون تجارة أو موارد مستقلة',
    district: 'trade',
    interactive: false,
  },
  {
    id: 'residential',
    name: 'الحي السكني',
    classification: 'composite',
    building: 'hall',
    description: 'حي بصري تابع لدار الحكم؛ لا يضيف نظام سكان',
    district: 'civic',
    interactive: false,
  },
  {
    id: 'barracks',
    name: 'الثكنات',
    classification: 'existing',
    building: 'barracks',
    description: 'تدريب الوحدات التي يدعمها الخادم',
    district: 'military',
    interactive: true,
  },
  {
    id: 'stable',
    name: 'الإسطبل',
    classification: 'existing',
    building: 'stable',
    description: 'مبنى فرسان مستقل: مستواه يفتح تدريب الفرسان ويحدد سرعته',
    district: 'military',
    interactive: true,
  },
  {
    id: 'archery',
    name: 'ميدان الرماية',
    classification: 'future',
    description: 'مبنى مستقل مستقبلي؛ الرماة يتدربون حاليًا في الثكنة والرماة الخيّالة في الإسطبل',
    district: 'military',
    interactive: false,
  },
  {
    id: 'blacksmith',
    name: 'دار الحدادة',
    classification: 'future',
    description: 'مبنى مستقبلي دون أبحاث أو تحسينات للأسلحة',
    district: 'military',
    interactive: false,
  },
  {
    id: 'siege',
    name: 'ورشة الحصار',
    classification: 'future',
    description: 'مبنى مستقل مستقبلي؛ وحدات الحصار تتدرب حاليًا في الثكنة',
    district: 'military',
    interactive: false,
  },
  {
    id: 'rally',
    name: 'نقطة تجمع الجيوش',
    classification: 'composite',
    building: 'barracks',
    description: 'مركز قيادة عسكرية فوق القوات والحركات الحالية، دون مبنى خادم جديد',
    district: 'military',
    interactive: true,
  },
  {
    id: 'hospital',
    name: 'البيمارستان',
    classification: 'future',
    description: 'مبنى مستقبلي دون علاج أو إعادة جنود',
    district: 'civic',
    interactive: false,
  },
  {
    id: 'knowledge',
    name: 'دار المعرفة',
    classification: 'future',
    description: 'مبنى مستقبلي دون نظام أبحاث',
    district: 'civic',
    interactive: false,
  },
  {
    id: 'embassy',
    name: 'دار العهد',
    classification: 'existing',
    building: 'embassy',
    description: 'إدارة التحالف والعلاقات الحالية',
    district: 'civic',
    interactive: true,
  },
  {
    id: 'treasury',
    name: 'دار الخزانة',
    classification: 'existing',
    building: 'treasury',
    description: 'إنتاج الذهب وفق قواعد الخادم',
    district: 'storage',
    interactive: true,
  },
  {
    id: 'wall',
    name: 'الأسوار',
    classification: 'existing',
    building: 'wall',
    description: 'تعزيز دفاع القرية وفق المستوى المؤكد',
    district: 'defense',
    interactive: true,
  },
  {
    id: 'tower',
    name: 'أبراج المراقبة',
    classification: 'composite',
    building: 'wall',
    description: 'جزء بصري من الأسوار؛ اختيار البرج يفتح لوحة الأسوار دون دفاع إضافي',
    district: 'defense',
    interactive: true,
  },
  {
    id: 'gate',
    name: 'بوابة القرية',
    classification: 'composite',
    building: 'wall',
    description: 'بوابة الأسوار والتنقل إلى خريطة العالم',
    district: 'defense',
    interactive: true,
  },
  {
    id: 'citadel',
    name: 'القلعة',
    classification: 'composite',
    building: 'hall',
    description: 'امتداد بصري لدار الحكم دون تحصين مستقل',
    district: 'palace',
    interactive: false,
  },
  {
    id: 'mosque',
    name: 'المسجد',
    classification: 'composite',
    building: 'hall',
    description: 'معلم بصري تابع لدار الحكم دون تأثير على الموارد',
    district: 'civic',
    interactive: false,
  },
  {
    id: 'madrasa',
    name: 'المدرسة',
    classification: 'composite',
    building: 'hall',
    description: 'معلم بصري دون أبحاث أو وحدات جديدة',
    district: 'civic',
    interactive: false,
  },
  {
    id: 'courthouse',
    name: 'دار القضاء',
    classification: 'composite',
    building: 'hall',
    description: 'معلم بصري دون قواعد حكم مستقلة',
    district: 'civic',
    interactive: false,
  },
  {
    id: 'hammam',
    name: 'الحمام',
    classification: 'composite',
    building: 'hall',
    description: 'معلم بصري دون نظام صحة أو سكان',
    district: 'civic',
    interactive: false,
  },
  {
    id: 'traders',
    name: 'خان التجار',
    classification: 'composite',
    building: 'market',
    description: 'جزء بصري من السوق دون طابور تجارة مستقل',
    district: 'trade',
    interactive: false,
  },
  {
    id: 'industry',
    name: 'دار الصناعة',
    classification: 'future',
    description: 'مبنى مستقبلي دون موارد أو إنتاج جديد',
    district: 'economy',
    interactive: false,
  },
] as const;

const byId = Object.fromEntries(
  villageBuildingRegistry.map((building) => [building.id, building]),
) as Readonly<Record<VillageBuildingId, VillageBuildingDefinition>>;

export function getVillageBuilding(id: VillageBuildingId): VillageBuildingDefinition {
  return byId[id];
}

export function getVillageVisualLevel(
  id: VillageBuildingId,
  village: Village,
  debug?: VillageDebugOptions,
): number {
  const definition = getVillageBuilding(id);
  const confirmed = definition.building ? village.buildings[definition.building] : 0;
  const level =
    process.env.NODE_ENV === 'development' && debug?.building === id
      ? (debug.buildingLevel ?? confirmed)
      : confirmed;
  return Number.isFinite(level) ? Math.max(0, Math.min(5, Math.floor(level))) : 0;
}

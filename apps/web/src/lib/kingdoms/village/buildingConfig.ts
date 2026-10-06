import { trainingBuilding } from '../training';
import {
  resourceKeys,
  type Building,
  type KingdomsConfig,
  type Resources,
  type Village,
} from '../types';

export type BuildingStatus = 'upgrade' | 'construction' | 'shortage' | 'complete';
export const buildingGroups: Record<Building, 'economy' | 'military' | 'civic'> = {
  hall: 'civic',
  lumber: 'economy',
  quarry: 'economy',
  mine: 'economy',
  farm: 'economy',
  treasury: 'economy',
  warehouse: 'economy',
  barracks: 'military',
  stable: 'military',
  wall: 'military',
  market: 'civic',
  embassy: 'civic',
};
export const buildingDescriptions: Record<Building, string> = {
  hall: 'إدارة المملكة وتوسيع قراك',
  farm: 'إنتاج الغذاء للسكان والجيش',
  lumber: 'إنتاج الخشب للبناء',
  quarry: 'إنتاج الحجر للتحصينات',
  mine: 'إنتاج الحديد للجيش',
  treasury: 'إنتاج الذهب لخزانة المملكة',
  warehouse: 'زيادة سعة حفظ الموارد',
  barracks: 'تدريب الحراس والكشافة والمستوطنين',
  stable: 'تدريب الفرسان وفق مستوى الإسطبل',
  wall: 'حماية القرية وتعزيز دفاعها',
  market: 'تبادل الموارد مع الممالك',
  embassy: 'إدارة التحالف والعلاقات',
};
export const villageDistricts = [
  {
    id: 'administration',
    label: 'الإدارة',
    entries: [
      { id: 'hall', select: 'hall' },
      { id: 'embassy', select: 'embassy' },
    ],
  },
  {
    id: 'military',
    label: 'العسكر',
    entries: [
      { id: 'barracks', select: 'barracks' },
      { id: 'stable', select: 'stable' },
      { id: 'rally', select: 'rally' },
    ],
  },
  {
    id: 'economy',
    label: 'الاقتصاد',
    entries: [
      { id: 'market', select: 'market' },
      { id: 'warehouse', select: 'warehouse' },
      { id: 'treasury', select: 'treasury' },
    ],
  },
  {
    id: 'resources',
    label: 'الموارد',
    entries: [
      { id: 'farm', select: 'farm' },
      { id: 'lumber', select: 'lumber' },
      { id: 'quarry', select: 'quarry' },
      { id: 'mine', select: 'mine' },
    ],
  },
  {
    id: 'defense',
    label: 'الدفاع',
    entries: [
      { id: 'wall', select: 'wall' },
      { id: 'gate', select: 'wall', name: 'البوابة', note: 'مدخل السور، بلا مستوى مستقل' },
      { id: 'tower', select: 'wall', name: 'برج المراقبة', note: 'جزء من السور، بلا مستوى مستقل' },
    ],
  },
] as const;

export const buildingStatusLabels: Record<BuildingStatus, string> = {
  upgrade: 'قابل للتطوير',
  construction: 'قيد التطوير',
  shortage: 'يحتاج موارد',
  complete: 'بلغ الحد الأعلى',
};

/** Maps existing server build/queue/training fields for hotspot labels. */
export function villageBuildingSceneStatus(building: Building, village: Village) {
  if (village.build?.building === building) return 'قيد البناء';
  if (
    village.constructionQueue?.some((item) => item.building === building && item.status === 'QUEUED')
  )
    return 'في الطابور';
  if (
    village.training &&
    trainingBuilding(village.training.unit) === building
  )
    return 'تدريب جارٍ';
  return village.buildings[building] > 0 ? 'جاهز' : 'لم يُبنَ';
}

export function getBuildingPresentation(
  building: Building,
  village: Village,
  config: KingdomsConfig,
) {
  const level = village.buildings[building];
  const specification = config.buildings[building];
  const cost = Object.fromEntries(
    resourceKeys.map((resource) => [
      resource,
      Math.ceil(specification.cost[resource] * specification.growth ** level),
    ]),
  ) as Resources;
  const status: BuildingStatus =
    village.build?.building === building
      ? 'construction'
      : level >= specification.maxLevel
        ? 'complete'
        : resourceKeys.some((resource) => village.resources[resource] < cost[resource])
          ? 'shortage'
          : 'upgrade';
  return {
    level,
    tier: Math.max(0, Math.min(5, Math.floor(level))),
    cost,
    status,
    name: specification.name,
    description: buildingDescriptions[building],
  };
}

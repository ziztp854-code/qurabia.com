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
  barracks: 'تدريب الحراس والفرسان والكشافة',
  wall: 'حماية القرية وتعزيز دفاعها',
  market: 'تبادل الموارد مع الممالك',
  embassy: 'إدارة التحالف والعلاقات',
};
export const buildingStatusLabels: Record<BuildingStatus, string> = {
  upgrade: 'قابل للتطوير',
  construction: 'قيد التطوير',
  shortage: 'يحتاج موارد',
  complete: 'بلغ الحد الأعلى',
};

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

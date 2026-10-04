import { storageCapacity } from '@/lib/kingdoms/simulation';
import type { Building, KingdomsConfig, Resource, Resources, Village } from '@/lib/kingdoms/types';
import { labels, number, rateAmount } from './shared';

const producers: Partial<Record<Building, Resource>> = {
  lumber: 'wood',
  quarry: 'stone',
  mine: 'iron',
  farm: 'food',
  treasury: 'gold',
};

const decimal = (value: number) =>
  value.toLocaleString('ar-SA', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

export type BuildingEffect = {
  label: string;
  now: string;
  /** القيمة بعد المستوى التالي، أو null عند الحد الأعلى. */
  next: string | null;
  note?: string;
};

/**
 * أثر المبنى الآن وبعد التطوير، بمعادلات المحرك نفسها وإعدادات العالم نفسها؛
 * لا تُعرض أي فائدة لا يطبقها الخادم.
 */
export function buildingEffect(
  building: Building,
  config: KingdomsConfig,
  village: Pick<Village, 'buildings'>,
): BuildingEffect {
  const level = village.buildings[building];
  const hasNext = level < config.buildings[building].maxLevel;
  const at = (value: (lvl: number) => string) => ({
    now: value(level),
    next: hasNext ? value(level + 1) : null,
  });
  const resource = producers[building];
  if (resource) {
    return {
      label: `إنتاج ${labels[resource]} الأساسي في الساعة`,
      ...at((lvl) =>
        rateAmount(config.baseProduction[resource] * (1 + lvl * config.productionPerLevel)),
      ),
      note: resource === 'food' ? 'قبل خصم إعاشة القوات.' : undefined,
    };
  }
  switch (building) {
    case 'warehouse':
      return {
        label: 'سعة التخزين لكل مورد',
        ...at((lvl) =>
          number(storageCapacity(config, { buildings: { ...village.buildings, warehouse: lvl } })),
        ),
      };
    case 'wall':
      return {
        label: 'زيادة دفاع القرية',
        ...at((lvl) => `+${decimal(lvl * config.wallDefensePerLevel * 100)}٪`),
      };
    case 'barracks':
      return {
        label: 'سرعة تدريب الثكنة',
        ...at((lvl) =>
          lvl > 0 ? `×${decimal(1 + (lvl - 1) * config.barracksSpeedPerLevel)}` : 'مغلق',
        ),
      };
    case 'stable':
      return {
        label: 'سرعة تدريب الفرسان',
        ...at((lvl) =>
          lvl > 0 ? `×${decimal(1 + (lvl - 1) * config.barracksSpeedPerLevel)}` : 'مغلق',
        ),
      };
    case 'hall':
      return {
        label: 'تدريب المستوطنين',
        ...at((lvl) =>
          lvl >= config.settlerHallLevel
            ? 'متاح'
            : `يُفتح عند المستوى ${number(config.settlerHallLevel)}`,
        ),
      };
    case 'market':
      return { label: 'التبادل التجاري', ...at((lvl) => (lvl > 0 ? 'متاح' : 'مغلق')) };
    case 'embassy':
      return {
        label: 'إنشاء التحالفات والانضمام إليها',
        ...at((lvl) => (lvl > 0 ? 'متاح' : 'مغلق')),
      };
    default:
      return { label: 'الأثر', now: '—', next: null };
  }
}

/** تكلفة المستوى التالي كما يخصمها المحرك: التكلفة الأساسية × معامل النمو ^ المستوى. */
export function upgradeCost(config: KingdomsConfig, building: Building, level: number): Resources {
  const spec = config.buildings[building];
  const factor = spec.growth ** level;
  return Object.fromEntries(
    Object.entries(spec.cost).map(([resource, amount]) => [resource, Math.ceil(amount * factor)]),
  ) as Resources;
}

/** مدة المستوى التالي بالثواني كما يحجزها المحرك (ثانية واحدة كحد أدنى). */
export function upgradeSeconds(config: KingdomsConfig, building: Building, level: number) {
  const spec = config.buildings[building];
  return Math.max(1, Math.ceil(spec.seconds * spec.growth ** level));
}

export function duration(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return [
    hours ? `${number(hours)} س` : null,
    minutes ? `${number(minutes)} د` : null,
    rest || (!hours && !minutes) ? `${number(rest)} ث` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

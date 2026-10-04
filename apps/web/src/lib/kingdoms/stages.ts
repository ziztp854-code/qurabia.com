import { buildingKeys, type KingdomsConfig, type KingdomsView, type Village } from './types';

/**
 * سلّم مراحل القرية: ثلاث مراحل نمو ثم «المرحلة العليا»، وبعدها «مرحلة العرش» التي تختم
 * الموسم. المراحل مشتقة من حالة الخادم (مجموع مستويات المباني مقابل الحد الأعلى لكل مبنى في
 * العالم) ولا تضيف أي حقل محفوظ أو قاعدة جديدة إلى المحرك.
 */
export const villageStageKeys = ['founding', 'renaissance', 'prosperity', 'supreme'] as const;
export type VillageStageKey = (typeof villageStageKeys)[number];

export type VillageStage = {
  key: VillageStageKey;
  index: number;
  name: string;
  tagline: string;
  /** أقل نسبة من الحد الأعلى للمستويات تدخل القرية أو المبنى هذه المرحلة. */
  fraction: number;
};

export const villageStages: readonly VillageStage[] = [
  {
    key: 'founding',
    index: 1,
    name: 'التأسيس',
    tagline: 'حجر أول وقرار أول: ارفع دار الحكم وابدأ الإنتاج.',
    fraction: 0,
  },
  {
    key: 'renaissance',
    index: 2,
    name: 'النهضة',
    tagline: 'الثكنة والسوق والمخزن تعمل، والبناء يتسارع.',
    fraction: 0.12,
  },
  {
    key: 'prosperity',
    index: 3,
    name: 'الازدهار',
    tagline: 'قرى إضافية وتحالفات وأسواق واسعة في خدمتك.',
    fraction: 0.32,
  },
  {
    key: 'supreme',
    index: 4,
    name: 'المرحلة العليا',
    tagline: 'قرية شبه مكتملة تتجه إلى خاتمة الموسم.',
    fraction: 0.55,
  },
];

export const supremeStage = villageStages[villageStages.length - 1];
export const throneStageName = 'مرحلة العرش';
export const throneStageTagline = 'خاتمة الموسم: حوّل موارد قريتك إلى رصيد عهد.';
/** وصف وصول المبنى إلى maxLevel في هذا العالم. */
export const maxLevelLabel = 'الحد الأعلى';

/** أقصى مجموع مستويات ممكن في العالم، محسوب من إعدادات الخادم لا من أرقام ثابتة. */
export function maxVillageLevels(config: KingdomsConfig): number {
  return buildingKeys.reduce((sum, key) => sum + Math.max(1, config.buildings[key].maxLevel), 0);
}

/**
 * Stage ceiling for one village. An unbuilt stable is outside the ladder so a world
 * that only just received the key at level 0 does not drop a stage. From level 1
 * the stable uses its full max level, like every other building.
 */
export function villageStageCeiling(config: KingdomsConfig, village: Pick<Village, 'buildings'>) {
  return buildingKeys.reduce((sum, key) => {
    if (key === 'stable' && (village.buildings.stable ?? 0) <= 0) return sum;
    return sum + Math.max(1, config.buildings[key].maxLevel);
  }, 0);
}

/** مجموع مستويات المباني الفعلية في القرية كما وصلت من الخادم. */
export function villageLevels(village: Village): number {
  return buildingKeys.reduce((sum, key) => sum + Math.max(0, village.buildings[key]), 0);
}

export function stageForFraction(fraction: number): VillageStage {
  const share = Number.isFinite(fraction) ? Math.max(0, fraction) : 0;
  return [...villageStages].reverse().find((stage) => share >= stage.fraction) ?? villageStages[0];
}

/** مرحلة المبنى نفسه حسب نسبته من الحد الأعلى، أو null للمبنى غير المبني. */
export function buildingStage(level: number, maxLevel: number): VillageStage | null {
  if (!Number.isFinite(level) || !Number.isFinite(maxLevel) || level <= 0 || maxLevel <= 0) {
    return null;
  }
  return stageForFraction(Math.min(1, level / maxLevel));
}

/** نسبة تقدم المبنى نحو الحد الأعلى بلا أي تقريب مضلل. */
export function buildingPercent(level: number, maxLevel: number): number {
  if (!Number.isFinite(level) || !Number.isFinite(maxLevel) || maxLevel <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((level / maxLevel) * 100)));
}

export type VillageProgress = {
  stage: VillageStage;
  next: VillageStage | null;
  levels: number;
  maxLevels: number;
  percent: number;
  nextFraction: number | null;
  nextLevels: number | null;
  topBuildings: number;
  maxedBuildings: number;
};

export function villageProgress(village: Village, config: KingdomsConfig): VillageProgress {
  const maxLevels = villageStageCeiling(config, village);
  const levels = villageLevels(village);
  const share = maxLevels > 0 ? levels / maxLevels : 0;
  const stage = stageForFraction(share);
  const next = villageStages.find((candidate) => candidate.index === stage.index + 1) ?? null;
  return {
    stage,
    next,
    levels,
    maxLevels,
    percent: Math.min(100, Math.max(0, Math.round(share * 100))),
    nextFraction: next ? next.fraction : null,
    nextLevels: next ? Math.ceil(next.fraction * maxLevels) : null,
    topBuildings: buildingKeys.filter(
      (key) =>
        buildingStage(village.buildings[key], config.buildings[key].maxLevel)?.key === 'supreme',
    ).length,
    maxedBuildings: buildingKeys.filter(
      (key) => village.buildings[key] >= config.buildings[key].maxLevel,
    ).length,
  };
}

export type ThroneStageState = {
  name: string;
  unlockAt: number;
  unlocked: boolean;
  endsAt: number;
  ended: boolean;
  /** ثوانٍ حتى فتح المساهمات، أو حتى نهاية الموسم بعد فتحها. */
  remainingSeconds: number;
  contribution: number;
  winnerId?: string;
};

export function throneStageState(
  view: Pick<KingdomsView, 'config' | 'season' | 'player' | 'serverNow'>,
): ThroneStageState {
  const { config, season, player, serverNow } = view;
  const unlockAt =
    season.startsAt + (season.endsAt - season.startsAt) * config.throneUnlockFraction;
  const ended = season.status === 'ended' || serverNow >= season.endsAt;
  const target = ended || serverNow >= unlockAt ? season.endsAt : unlockAt;
  return {
    name: throneStageName,
    unlockAt,
    unlocked: !ended && serverNow >= unlockAt,
    endsAt: season.endsAt,
    ended,
    remainingSeconds: Math.max(0, Math.ceil((target - serverNow) / 1000)),
    contribution: player?.throne ?? 0,
    winnerId: season.winnerId,
  };
}

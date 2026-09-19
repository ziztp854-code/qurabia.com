export const PLAN_VERSION = 1;

export const PLAN_CODES = ['SPECTATOR', 'KNIGHT', 'PRINCE', 'SULTAN'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export type PlanLimitKey =
  | 'maxQuestionsPerMonth'
  | 'maxRoomPlayers'
  | 'maxLiveRoomsPerMonth'
  | 'aiQuestionsPerMonth'
  | 'deepReports'
  | 'customRoomBranding'
  | 'earlyAccessGames';

export type PlanLimits = Record<
  Exclude<PlanLimitKey, 'deepReports' | 'customRoomBranding' | 'earlyAccessGames'>,
  number
> & {
  deepReports: boolean;
  customRoomBranding: boolean;
  earlyAccessGames: boolean;
};

export type PlanDefinition = {
  code: PlanCode;
  name: string;
  tagline: string;
  emblem: string;
  monthlyPriceSar: number;
  durationDays: number;
  limits: PlanLimits;
};

export const PLAN_DEFINITIONS: Readonly<Record<PlanCode, PlanDefinition>> = {
  SPECTATOR: {
    code: 'SPECTATOR',
    name: 'المشاهد',
    tagline: 'يدخل البلاط وينافس في الجولات العامة',
    emblem: '🜲',
    monthlyPriceSar: 0,
    durationDays: 0,
    limits: {
      maxQuestionsPerMonth: 15,
      maxRoomPlayers: 10,
      maxLiveRoomsPerMonth: 5,
      aiQuestionsPerMonth: 3,
      deepReports: false,
      customRoomBranding: false,
      earlyAccessGames: false,
    },
  },
  KNIGHT: {
    code: 'KNIGHT',
    name: 'الفارس',
    tagline: 'غرف مباشرة بلا حدود ومنافسة دائمة',
    emblem: '⚜',
    monthlyPriceSar: 19,
    durationDays: 30,
    limits: {
      maxQuestionsPerMonth: 150,
      maxRoomPlayers: 30,
      maxLiveRoomsPerMonth: 60,
      aiQuestionsPerMonth: 40,
      deepReports: false,
      customRoomBranding: false,
      earlyAccessGames: false,
    },
  },
  PRINCE: {
    code: 'PRINCE',
    name: 'الأمير',
    tagline: 'توليد أسئلة بالذكاء وتقارير عميقة وعلامة على غرفته',
    emblem: '👑',
    monthlyPriceSar: 49,
    durationDays: 30,
    limits: {
      maxQuestionsPerMonth: 600,
      maxRoomPlayers: 80,
      maxLiveRoomsPerMonth: 200,
      aiQuestionsPerMonth: 250,
      deepReports: true,
      customRoomBranding: true,
      earlyAccessGames: false,
    },
  },
  SULTAN: {
    code: 'SULTAN',
    name: 'السلطان',
    tagline: 'كل امتيازات البلاط وأولوية الدعم والألعاب المبكرة',
    emblem: '🏆',
    monthlyPriceSar: 129,
    durationDays: 30,
    limits: {
      maxQuestionsPerMonth: 3000,
      maxRoomPlayers: 200,
      maxLiveRoomsPerMonth: 1000,
      aiQuestionsPerMonth: 1500,
      deepReports: true,
      customRoomBranding: true,
      earlyAccessGames: true,
    },
  },
};

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value);
}

/** Higher rank wins when stacking subscriptions. */
export function planRank(code: PlanCode): number {
  return PLAN_CODES.indexOf(code);
}

export function planDefinition(code: PlanCode): PlanDefinition {
  return PLAN_DEFINITIONS[code];
}

/** Numeric limits; admins and managers bypass plan limits upstream. */
export function limitFor(code: PlanCode, key: 'maxQuestionsPerMonth' | 'maxRoomPlayers' | 'maxLiveRoomsPerMonth' | 'aiQuestionsPerMonth'): number {
  return PLAN_DEFINITIONS[code].limits[key];
}

export function flagFor(
  code: PlanCode,
  key: 'deepReports' | 'customRoomBranding' | 'earlyAccessGames',
): boolean {
  return PLAN_DEFINITIONS[code].limits[key];
}

/**
 * مكافأة الوفاء: استضافة جولات مكتملة خلال النافذة تمنح ختم الفارس أسبوعي.
 */
export const LOYALTY_HOSTED_SESSIONS = 5;
export const LOYALTY_WINDOW_DAYS = 30;
export const LOYALTY_REWARD_PLAN: PlanCode = 'KNIGHT';
export const LOYALTY_REWARD_DAYS = 7;

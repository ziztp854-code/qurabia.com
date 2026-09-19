import type { MafiaRoleName } from './rules';

export type MafiaGameModeId = 'CLASSIC' | 'SPEED' | 'BLIND' | 'ASSASSIN' | 'CHAOS';

export type MafiaSideQuestId =
  | 'FIRST_TO_ACCUSE'
  | 'DEFEND_SOMEONE'
  | 'GET_INVESTIGATE_3'
  | 'CAST_LAST_VOTE'
  | 'NO_CHAT_UNTIL_VOTE'
  | 'GUESS_WINNER'
  | 'QUICK_ACTION'
  | 'HIDE_ROLE'
  | 'CRAFT_CLUE';

export type MafiaInvestigationToolId =
  | 'SUSPICION_MATRIX'
  | 'TIMELINE_VIEW'
  | 'LIKELIHOOD_GUESS'
  | 'BEHAVIOR_LOG'
  | 'CLUE_BOARD';

export type MafiaGameMode = {
  id: MafiaGameModeId;
  label: string;
  description: string;
  tagline: string;
  timeMultiplier: number;
  killerMultiplier: number;
  experimental?: boolean;
  features: readonly string[];
};

export type MafiaSideQuest = {
  id: MafiaSideQuestId;
  title: string;
  description: string;
  difficulty: 1 | 2 | 3;
  reward: string;
  appliesToRoles?: readonly MafiaRoleName[];
  appliesToPhases?: readonly ('NIGHT' | 'DAY' | 'VOTING')[];
};

export type MafiaInvestigationTool = {
  id: MafiaInvestigationToolId;
  label: string;
  description: string;
  unlockPhase: 'LOBBY' | 'DAY' | 'VOTING';
  requiresRole?: MafiaRoleName;
};

export const MAFIA_GAME_MODES: Record<MafiaGameModeId, MafiaGameMode> = {
  CLASSIC: {
    id: 'CLASSIC',
    label: 'كلاسيكي',
    description:
      'الوضع الأصلي: ليل ونهار وتصويت. المواطنون ضد القتلة مع الأدوار الكاملة والمؤقت العادي.',
    tagline: 'تجربة أصلية متوازنة لجميع اللاعبين.',
    timeMultiplier: 1,
    killerMultiplier: 1,
    features: ['جميع الأدوار متاحة', 'أدوار خاصة (القاتل، المحقق، الطبيب، الحارس، الشاهد)'] as const,
  },
  SPEED: {
    id: 'SPEED',
    label: 'السريع',
    description:
      'نصف الوقت المعتاد لكل مرحلة، أهداف أقل، لكن النتيجة أسرع 2 دقيقة كحد أقصى للجولة.',
    tagline: 'لعبة خاطفة في 5 إلى 10 دقائق.',
    timeMultiplier: 0.5,
    killerMultiplier: 1,
    features: ['نصف الوقت لكل مرحلة', 'جولة واحدة في نهاية سريعة', 'تخفي عدد الأدوار الخاصة'] as const,
  },
  BLIND: {
    id: 'BLIND',
    label: 'الأعمى',
    description:
      'لا تظهر لك دورك إلا بعد أول إقصاء لاعب، ولا يظهر تفاصيل الأدوار إلا في نهاية اللعبة.',
    tagline: 'الغموض تام: لا أدلة واضحة حتى النهاية.',
    timeMultiplier: 1,
    killerMultiplier: 1.1,
    experimental: true,
    features: [
      'تجربة غامضة',
      'قواعد خاصة بالوضع',
    ] as const,
  },
  ASSASSIN: {
    id: 'ASSASSIN',
    label: 'القاتل المنفرد',
    description:
      'قاتل واحد فقط لكن لديه ثلاث مراحل قبل النهاية. المواطنون يجب أن يكتشفوه قبل أن يفقدوا جميع أصدقائهم.',
    tagline: 'فارسالي واحد ضد قرية بأسرها. من سينتصر؟',
    timeMultiplier: 1,
    killerMultiplier: 0.6,
    experimental: true,
    features: [
      'قاتل واحد فقط',
      'ضغط إضافي على المواطنين',
    ] as const,
  },
  CHAOS: {
    id: 'CHAOS',
    label: 'الفوضى',
    description:
      'تبديل عشوائي للأدوار في منتصف اللعبة، وقت أصوات مضاعفة، ودور زائفة تظهر للحظة قبل الليل القاتل.',
    tagline: 'كل شيء يمكن أن يتغير في أمر لا متوقع.',
    timeMultiplier: 0.75,
    killerMultiplier: 1.2,
    experimental: true,
    features: [
      'سرعة أعلى وتقلبات',
      'تجربة لا يمكن التنبؤ بها',
    ] as const,
  },
};

export const MAFIA_SIDE_QUESTS: Record<MafiaSideQuestId, MafiaSideQuest> = {
  FIRST_TO_ACCUSE: {
    id: 'FIRST_TO_ACCUSE',
    title: 'الجريء',
    description: 'كن أول لاعب يوجه اتهامًا صريح في قناة العامة لمن تشتبه له.',
    difficulty: 1,
    reward: 'مصادقة: تعمل نقطة مؤثر في مصفوفة الشكوك',
    appliesToPhases: ['DAY'],
  },
  DEFEND_SOMEONE: {
    id: 'DEFEND_SOMEONE',
    title: 'الصديق وفٍّ',
    description: 'ادفع عن لاعب يتعرض لاتهامات كثيرة في النقاش العام.',
    difficulty: 2,
    reward: 'نقطة وثوقة: تحمِ دفعة ثقة في تصويت الجولة التالية',
    appliesToPhases: ['DAY'],
  },
  GET_INVESTIGATE_3: {
    id: 'GET_INVESTIGATE_3',
    title: 'المحقق المثابر',
    description: 'حقق من 3 لاعبين مختلفين على الأقل قبل أن تكشف دورك.',
    difficulty: 3,
    reward: 'أولوية: تحقيق: اختيار إضافي ليلًا في الجولة الرابعة',
    appliesToRoles: ['DETECTIVE'],
  },
  CAST_LAST_VOTE: {
    id: 'CAST_LAST_VOTE',
    title: 'الملك اللحظة',
    description: 'كن آخر لاعب يثبت صوته في مرحلة التصويت.',
    difficulty: 2,
    reward: 'رؤية: تصويت المستبعدين يظهر لك قبل الإعلان',
    appliesToPhases: ['VOTING'],
  },
  NO_CHAT_UNTIL_VOTE: {
    id: 'NO_CHAT_UNTIL_VOTE',
    title: 'الصامت الحكيم',
    description: 'لا ترسل أي رسالة في النقاش العام حتى بدء التصويت.',
    difficulty: 3,
    reward: 'حظ: نتيجة التحقق تعجبوك بخصوص لاعب عشوائي عند الفوز بالتصويت',
    appliesToRoles: ['CITIZEN', 'WITNESS', 'GUARD', 'DOCTOR'],
  },
  GUESS_WINNER: {
    id: 'GUESS_WINNER',
    title: 'النبيذ الصغير',
    description: 'قبل الجولة الثانية، اختر من الذي ستعتقد أنه قاتل في ملاحظتك الخاصة.',
    difficulty: 2,
    reward: 'بطاقة دور زائفة صالحة لاستخدامها مرة واحدة',
    appliesToPhases: ['DAY'],
  },
  QUICK_ACTION: {
    id: 'QUICK_ACTION',
    title: 'السريع البديهة',
    description: 'ثبّت قرارك الليلي في أول 10 ثوانٍ من بداية الليل.',
    difficulty: 1,
    reward: 'سرعة: رسالة سرية عن نية زميل (إذا كنتَ قاتلاً)',
    appliesToPhases: ['NIGHT'],
  },
  HIDE_ROLE: {
    id: 'HIDE_ROLE',
    title: 'الممثل',
    description: 'خفِ دورك تماماً من خلال سلوك مضلل طوال اللعبة.',
    difficulty: 3,
    reward: 'تقنية: إسقاط تصويت واحدًا ضدك في الجولة التالية',
  },
  CRAFT_CLUE: {
    id: 'CRAFT_CLUE',
    title: 'الكاتب',
    description: 'صمم دليلاً خاطئًا أو صحيحًا وشاركه في القناة العامة.',
    difficulty: 2,
    reward: 'أدوات لوحة الأدلة: فتح لوحة الأدلة الخاصة بك',
    appliesToPhases: ['DAY'],
  },
};

export const MAFIA_INVESTIGATION_TOOLS: Record<
  MafiaInvestigationToolId,
  MafiaInvestigationTool
> = {
  SUSPICION_MATRIX: {
    id: 'SUSPICION_MATRIX',
    label: 'مصفوفة الشكوك',
    description:
      'لوحة تُعرّج لك مستوى الشك لكل لاعب بناءً على تصويتاته واتجاهاته في النقاش.',
    unlockPhase: 'DAY',
  },
  TIMELINE_VIEW: {
    id: 'TIMELINE_VIEW',
    label: 'الخط الزمني للأحداث',
    description: 'عرض مرئي لكل الإقصاءات والأصوات في تسلسل زمني واضح.',
    unlockPhase: 'DAY',
  },
  LIKELIHOOD_GUESS: {
    id: 'LIKELIHOOD_GUESS',
    label: 'توقع الدور',
    description: 'خمن أدوار كل لاعب وراقب مدى دقة توقعاتك مع النهاية.',
    unlockPhase: 'DAY',
  },
  BEHAVIOR_LOG: {
    id: 'BEHAVIOR_LOG',
    label: 'سجل السلوك',
    description: 'قائمة تلقائية لرسائل وتوقيت كل لاعب وارتباطها بالقرارات.',
    unlockPhase: 'DAY',
  },
  CLUE_BOARD: {
    id: 'CLUE_BOARD',
    label: 'لوحة الأدلة',
    description: 'قسم خاص لجمع الأدلة الخاصة بك مع إمكانية ربطها بأصحاب الاشتباه.',
    unlockPhase: 'DAY',
  },
};

export function pickQuestsForPlayer(
  role: MafiaRoleName,
  seed: number,
  count = 2,
): MafiaSideQuest[] {
  const applicable = Object.values(MAFIA_SIDE_QUESTS).filter((quest) => {
    if (quest.appliesToRoles && !quest.appliesToRoles.includes(role)) return false;
    return true;
  });
  const shuffled = [...applicable].sort((a, b) => {
    const aHash = (a.id.length * 13 + seed) % 97;
    const bHash = (b.id.length * 17 + seed) % 97;
    return aHash - bHash;
  });
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function applyModeMultipliers(
  mode: MafiaGameModeId,
  settings: {
    nightSeconds: number;
    daySeconds: number;
    votingSeconds: number;
    killerCount: number;
    maxPlayers: number;
  },
) {
  const m = MAFIA_GAME_MODES[mode];
  const multiplier = m.timeMultiplier;
  const killMul = m.killerMultiplier;
  const newKillers = Math.max(1, Math.round(settings.killerCount * killMul));
  const playerForKillers = Math.max(5, Math.min(settings.maxPlayers, settings.maxPlayers));
  const safeKillers = Math.max(1, Math.floor((playerForKillers - 2) / 3));
  return {
    nightSeconds: Math.max(15, Math.round(settings.nightSeconds * multiplier)),
    daySeconds: Math.max(30, Math.round(settings.daySeconds * multiplier)),
    votingSeconds: Math.max(15, Math.round(settings.votingSeconds * multiplier)),
    killerCount: Math.min(newKillers, safeKillers),
  } as const;
}

export function computeSuspicionScores(
  votes: Array<{ round: number; voterId: string; targetId: string }>,
  participants: Array<{ id: string; displayName: string; status: 'ALIVE' | 'ELIMINATED' }>,
  actions: Array<{ round: number; actorId: string; targetId: string; type: string }>,
  eliminatedIds: string[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const p of participants) scores.set(p.id, 50);
  for (const vote of votes) {
    const current = scores.get(vote.targetId) ?? 0;
    const bonus = vote.round === 1 ? 4 : vote.round === 2 ? 3 : 2;
    scores.set(vote.targetId, Math.min(100, current + bonus));
  }
  for (const act of actions) {
    if (act.type === 'KILL') {
      const current = scores.get(act.targetId) ?? 0;
      scores.set(act.targetId, Math.max(0, current - 10));
    }
    if (act.type === 'INVESTIGATE') {
      const current = scores.get(act.actorId) ?? 0;
      scores.set(act.actorId, Math.min(100, current + 6));
    }
  }
  for (const id of eliminatedIds) {
    scores.set(id, Math.max(0, (scores.get(id) ?? 50) - 15));
  }
  return scores;
}

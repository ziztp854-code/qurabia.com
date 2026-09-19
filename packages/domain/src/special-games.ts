export type SpecialGameMode = 'parallel-world' | 'reverse-time' | 'infiltrator' | 'risk' | 'chess';

export type SpecialGameMeta = {
  mode: SpecialGameMode;
  title: string;
  shortTitle: string;
  description: string;
  minimumPlayers: number;
  roundSeconds: number;
  contentLabel: string;
};

export type UpcomingSpecialGame = {
  slug: string;
  title: string;
  description: string;
  minimumPlayers: number;
  roundSeconds: number;
  contentLabel: string;
};

export type SpectrumPair = {
  id: string;
  left: string;
  right: string;
  category: string;
};

export type ParallelWorldVariant = {
  face: 'geography' | 'history' | 'culture' | 'tourism' | 'science' | 'sport';
  faceLabel: string;
  prompt: string;
  options: string[];
};

export type ParallelWorldRound = {
  id: string;
  answer: string;
  reveal: string;
  variants: ParallelWorldVariant[];
};

export type ReverseTimeRound = {
  id: string;
  answer: string;
  category: string;
  hint: string;
};

export type SpecialGameContentPack =
  | {
      mode: 'parallel-world' | 'infiltrator';
      rounds: ParallelWorldRound[];
    }
  | {
      mode: 'reverse-time';
      rounds: ReverseTimeRound[];
    };

const isShortText = (value: unknown, max: number, min = 1): value is string =>
  typeof value === 'string' && value.trim().length >= min && value.length <= max;

function isParallelRound(value: unknown): value is ParallelWorldRound {
  if (!value || typeof value !== 'object') return false;
  const round = value as Partial<ParallelWorldRound>;
  if (
    !isShortText(round.id, 80) ||
    !isShortText(round.answer, 120) ||
    !isShortText(round.reveal, 300, 8) ||
    !Array.isArray(round.variants) ||
    round.variants.length < 4 ||
    round.variants.length > 6
  ) {
    return false;
  }
  return round.variants.every(
    (variant) =>
      isShortText(variant?.face, 20) &&
      ['geography', 'history', 'culture', 'tourism', 'science', 'sport'].includes(variant.face) &&
      isShortText(variant.faceLabel, 40) &&
      isShortText(variant.prompt, 240, 8) &&
      Array.isArray(variant.options) &&
      variant.options.length === 4 &&
      new Set(variant.options).size === 4 &&
      variant.options.every((option) => isShortText(option, 120)) &&
      variant.options.includes(round.answer!),
  );
}

function isReverseRound(value: unknown): value is ReverseTimeRound {
  if (!value || typeof value !== 'object') return false;
  const round = value as Partial<ReverseTimeRound>;
  return (
    isShortText(round.id, 80) &&
    isShortText(round.answer, 120) &&
    isShortText(round.category, 80) &&
    isShortText(round.hint, 240, 5)
  );
}

export function isSpecialGameContentPack(value: unknown): value is SpecialGameContentPack {
  if (!value || typeof value !== 'object') return false;
  const pack = value as Partial<SpecialGameContentPack>;
  if (!Array.isArray(pack.rounds) || pack.rounds.length < 3 || pack.rounds.length > 6) {
    return false;
  }
  const ids = pack.rounds
    .map((round) => (round && typeof round === 'object' ? (round as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === 'string');
  if (new Set(ids).size !== pack.rounds.length) return false;
  return pack.mode === 'reverse-time'
    ? pack.rounds.every(isReverseRound)
    : (pack.mode === 'parallel-world' || pack.mode === 'infiltrator') &&
        pack.rounds.every(isParallelRound);
}

export const SPECIAL_GAME_META: Record<SpecialGameMode, SpecialGameMeta> = {
  'parallel-world': {
    mode: 'parallel-world',
    title: 'العالم الموازي',
    shortTitle: 'العوالم',
    description: 'أسئلة مختلفة لكل لاعب، لكن الإجابة التي تجمع العوالم واحدة.',
    minimumPlayers: 2,
    roundSeconds: 25,
    contentLabel: 'بنك أسئلة',
  },
  'reverse-time': {
    mode: 'reverse-time',
    title: 'الزمن المقلوب',
    shortTitle: 'الزمن',
    description: 'تظهر الإجابة أولًا، ثم يصنع اللاعبون السؤال الأذكى ويصوّتون له.',
    minimumPlayers: 3,
    roundSeconds: 35,
    contentLabel: 'بنك أسئلة',
  },
  infiltrator: {
    mode: 'infiltrator',
    title: 'الدخيل',
    shortTitle: 'الدخيل',
    description: 'سؤال واحد للأغلبية وسؤال مختلف للدخيل؛ أجب ثم اكتشفه قبل أن يخدعكم.',
    minimumPlayers: 4,
    roundSeconds: 45,
    contentLabel: 'بنك أسئلة',
  },
  risk: {
    mode: 'risk',
    title: 'المجازفة',
    shortTitle: 'المجازفة',
    description: 'اكشف البطاقات، احفظ رصيد دورك، وتوقف قبل ظهور القنبلة.',
    minimumPlayers: 2,
    roundSeconds: 30,
    contentLabel: '٢٤ بطاقة',
  },
  chess: {
    mode: 'chess',
    title: 'تحدي الشطرنج',
    shortTitle: 'الشطرنج',
    description: 'تحدى صديقك مباشرة أو شاهد المباراة برمز الغرفة — بدون تسجيل.',
    minimumPlayers: 2,
    roundSeconds: 0,
    contentLabel: 'استراتيجية',
  },
};

export const SPECIAL_GAME_ORDER: SpecialGameMode[] = [
  'parallel-world',
  'reverse-time',
  'infiltrator',
  'chess',
];

export const UPCOMING_SPECIAL_GAMES: UpcomingSpecialGame[] = [
  {
    slug: 'spectrum',
    title: 'الطيف',
    description: 'ضع إجابتك بين طرفين متقابلين، ثم اكتشف أين تتقاطع تقديرات الفريق.',
    minimumPlayers: 3,
    roundSeconds: 40,
    contentLabel: 'بنك أطياف',
  },
];

export const SPECTRUM_BANK: SpectrumPair[] = [
  { id: 'spectrum-quiet-loud', left: 'هادئ', right: 'صاخب', category: 'أجواء' },
  { id: 'spectrum-easy-hard', left: 'سهل', right: 'صعب', category: 'تحديات' },
  { id: 'spectrum-slow-fast', left: 'بطيء', right: 'سريع', category: 'إيقاع' },
  { id: 'spectrum-old-new', left: 'قديم', right: 'حديث', category: 'زمن' },
  { id: 'spectrum-serious-funny', left: 'جاد', right: 'مضحك', category: 'أسلوب' },
  { id: 'spectrum-safe-risky', left: 'آمن', right: 'مغامر', category: 'قرارات' },
  { id: 'spectrum-common-rare', left: 'شائع', right: 'نادر', category: 'انتشار' },
  { id: 'spectrum-stingy-generous', left: 'بخيل', right: 'كريم', category: 'شخصية' },
  { id: 'spectrum-simple-complex', left: 'بسيط', right: 'معقّد', category: 'أفكار' },
  { id: 'spectrum-local-global', left: 'محلي', right: 'عالمي', category: 'نطاق' },
  {
    id: 'spectrum-practical-imaginative',
    left: 'عملي',
    right: 'خيالي',
    category: 'تفكير',
  },
  {
    id: 'spectrum-traditional-modern',
    left: 'تراثي',
    right: 'حداثي',
    category: 'ثقافة',
  },
  { id: 'spectrum-calm-exciting', left: 'مريح', right: 'حماسي', category: 'تجربة' },
  { id: 'spectrum-light-heavy', left: 'خفيف', right: 'ثقيل', category: 'إحساس' },
  { id: 'spectrum-sweet-bitter', left: 'حلو', right: 'مُر', category: 'مذاق' },
  { id: 'spectrum-warm-cold', left: 'دافئ', right: 'بارد', category: 'طقس' },
  { id: 'spectrum-near-far', left: 'قريب', right: 'بعيد', category: 'مسافة' },
  { id: 'spectrum-small-large', left: 'صغير', right: 'ضخم', category: 'حجم' },
  {
    id: 'spectrum-expected-surprising',
    left: 'متوقّع',
    right: 'مفاجئ',
    category: 'انطباع',
  },
  {
    id: 'spectrum-organized-chaotic',
    left: 'منظّم',
    right: 'فوضوي',
    category: 'ترتيب',
  },
  { id: 'spectrum-real-fictional', left: 'واقعي', right: 'خيالي', category: 'حكايات' },
  {
    id: 'spectrum-acceptable-embarrassing',
    left: 'مقبول',
    right: 'محرج',
    category: 'مواقف',
  },
  { id: 'spectrum-short-long', left: 'قصير', right: 'طويل', category: 'مدة' },
  { id: 'spectrum-patient-hasty', left: 'صبور', right: 'متسرّع', category: 'شخصية' },
];

export const PARALLEL_WORLD_BANK: ParallelWorldRound[] = [
  {
    id: 'parallel-cairo',
    answer: 'القاهرة',
    reveal: 'كل الطرق كانت تقود إلى القاهرة، مهما اختلف مجال السؤال.',
    variants: [
      {
        face: 'geography',
        faceLabel: 'جغرافيا',
        prompt: 'ما عاصمة جمهورية مصر العربية؟',
        options: ['القاهرة', 'الإسكندرية', 'الأقصر', 'أسوان'],
      },
      {
        face: 'history',
        faceLabel: 'تاريخ',
        prompt: 'في أي مدينة تأسس الجامع الأزهر في العصر الفاطمي؟',
        options: ['القاهرة', 'القيروان', 'دمشق', 'بغداد'],
      },
      {
        face: 'culture',
        faceLabel: 'ثقافة',
        prompt: 'أي مدينة عربية اشتهرت بلقب «أم الدنيا»؟',
        options: ['القاهرة', 'بيروت', 'الرباط', 'عمّان'],
      },
      {
        face: 'tourism',
        faceLabel: 'سياحة',
        prompt: 'في أي مدينة يقف البرج الشهير المطل على نهر النيل؟',
        options: ['القاهرة', 'الخرطوم', 'طرابلس', 'تونس'],
      },
    ],
  },
  {
    id: 'parallel-riyadh',
    answer: 'الرياض',
    reveal: 'العاصمة والتاريخ والموسم والملعب اجتمعت كلها في الرياض.',
    variants: [
      {
        face: 'geography',
        faceLabel: 'جغرافيا',
        prompt: 'ما عاصمة المملكة العربية السعودية؟',
        options: ['الرياض', 'جدة', 'الدمام', 'أبها'],
      },
      {
        face: 'history',
        faceLabel: 'تاريخ',
        prompt: 'في أي مدينة يقع قصر المصمك التاريخي؟',
        options: ['الرياض', 'الدرعية', 'الطائف', 'حائل'],
      },
      {
        face: 'culture',
        faceLabel: 'ثقافة',
        prompt: 'أي مدينة تستضيف فعاليات «موسم الرياض»؟',
        options: ['الرياض', 'جدة', 'العلا', 'الخبر'],
      },
      {
        face: 'sport',
        faceLabel: 'رياضة',
        prompt: 'في أي مدينة يقع ملعب الملك فهد الدولي؟',
        options: ['الرياض', 'جدة', 'بريدة', 'تبوك'],
      },
    ],
  },
  {
    id: 'parallel-nile',
    answer: 'النيل',
    reveal: 'الحضارة والسد والمصب والرحلات كانت خيوطًا لنهر النيل.',
    variants: [
      {
        face: 'geography',
        faceLabel: 'جغرافيا',
        prompt: 'أي نهر يصب في البحر المتوسط بعد مروره بمصر؟',
        options: ['النيل', 'دجلة', 'الفرات', 'الأردن'],
      },
      {
        face: 'history',
        faceLabel: 'تاريخ',
        prompt: 'حول أي نهر ازدهرت الحضارة المصرية القديمة؟',
        options: ['النيل', 'الغانج', 'السند', 'الدانوب'],
      },
      {
        face: 'science',
        faceLabel: 'علوم',
        prompt: 'على أي نهر بُني السد العالي في أسوان؟',
        options: ['النيل', 'الأمازون', 'الكونغو', 'الراين'],
      },
      {
        face: 'tourism',
        faceLabel: 'سياحة',
        prompt: 'ما النهر الذي تعبره الرحلات السياحية بين الأقصر وأسوان؟',
        options: ['النيل', 'الفرات', 'السنغال', 'الفولغا'],
      },
    ],
  },
  {
    id: 'parallel-arabic',
    answer: 'اللغة العربية',
    reveal: 'لغة الضاد ويومها العالمي ومكانتها الأممية كشفت الإجابة.',
    variants: [
      {
        face: 'culture',
        faceLabel: 'ثقافة',
        prompt: 'ما اللغة التي تُعرف باسم «لغة الضاد»؟',
        options: ['اللغة العربية', 'اللغة الفارسية', 'اللغة التركية', 'اللغة السواحلية'],
      },
      {
        face: 'history',
        faceLabel: 'تاريخ',
        prompt: 'ما لغة المعلقات التي وصلتنا من الشعر الجاهلي؟',
        options: ['اللغة العربية', 'اللغة اللاتينية', 'اللغة اليونانية', 'اللغة السريانية'],
      },
      {
        face: 'geography',
        faceLabel: 'جغرافيا',
        prompt: 'ما اللغة الرسمية المشتركة بين دول جامعة الدول العربية؟',
        options: ['اللغة العربية', 'اللغة الفرنسية', 'اللغة الإنجليزية', 'اللغة الإسبانية'],
      },
      {
        face: 'culture',
        faceLabel: 'مناسبات',
        prompt: 'أي لغة يحتفل العالم بيومها في 18 ديسمبر؟',
        options: ['اللغة العربية', 'اللغة الصينية', 'اللغة الروسية', 'اللغة البرتغالية'],
      },
    ],
  },
  {
    id: 'parallel-jupiter',
    answer: 'المشتري',
    reveal: 'الحجم والبقعة الحمراء والأقمار كشفت عملاق المجموعة الشمسية.',
    variants: [
      {
        face: 'science',
        faceLabel: 'فضاء',
        prompt: 'ما أكبر كوكب في المجموعة الشمسية؟',
        options: ['المشتري', 'زحل', 'نبتون', 'الأرض'],
      },
      {
        face: 'science',
        faceLabel: 'فلك',
        prompt: 'على أي كوكب تقع «البقعة الحمراء العظيمة»؟',
        options: ['المشتري', 'المريخ', 'الزهرة', 'عطارد'],
      },
      {
        face: 'history',
        faceLabel: 'اكتشافات',
        prompt: 'أي كوكب تدور حوله الأقمار الغاليلية الأربعة؟',
        options: ['المشتري', 'أورانوس', 'زحل', 'نبتون'],
      },
      {
        face: 'geography',
        faceLabel: 'ترتيب كوني',
        prompt: 'ما الكوكب الخامس في البعد عن الشمس؟',
        options: ['المشتري', 'الأرض', 'المريخ', 'زحل'],
      },
    ],
  },
  {
    id: 'parallel-gold',
    answer: 'الذهب',
    reveal: 'العنصر والميدالية والزينة والاحتياطي حملت جميعها بريق الذهب.',
    variants: [
      {
        face: 'science',
        faceLabel: 'كيمياء',
        prompt: 'ما العنصر الكيميائي الذي رمزه Au؟',
        options: ['الذهب', 'الفضة', 'النحاس', 'الحديد'],
      },
      {
        face: 'sport',
        faceLabel: 'رياضة',
        prompt: 'ما معدن الميدالية التي ينالها صاحب المركز الأول؟',
        options: ['الذهب', 'الفضة', 'البرونز', 'البلاتين'],
      },
      {
        face: 'culture',
        faceLabel: 'تراث',
        prompt: 'ما المعدن النفيس الأكثر ارتباطًا بصياغة الحلي التقليدية؟',
        options: ['الذهب', 'القصدير', 'الألمنيوم', 'الزنك'],
      },
      {
        face: 'geography',
        faceLabel: 'اقتصاد',
        prompt: 'ما المعدن الذي تحتفظ به البنوك المركزية ضمن احتياطاتها؟',
        options: ['الذهب', 'الرصاص', 'النيكل', 'الكروم'],
      },
    ],
  },
];

export const REVERSE_TIME_BANK: ReverseTimeRound[] = [
  {
    id: 'reverse-riyadh',
    answer: 'الرياض',
    category: 'مكان',
    hint: 'اصنع سؤالًا لا يذكر كلمة «عاصمة».',
  },
  {
    id: 'reverse-moon',
    answer: 'القمر',
    category: 'فضاء',
    hint: 'اربط الإجابة بظاهرة أو رحلة أو تشبيه.',
  },
  {
    id: 'reverse-zero',
    answer: 'الصفر',
    category: 'أرقام',
    hint: 'اجعل السؤال بسيطًا في ظاهره ومخادعًا في معناه.',
  },
  { id: 'reverse-palm', answer: 'النخلة', category: 'تراث', hint: 'فكّر في رمز أو ثمرة أو بيئة.' },
  {
    id: 'reverse-red-sea',
    answer: 'البحر الأحمر',
    category: 'جغرافيا',
    hint: 'استخدم دولة أو مدينة أو كائنًا بحريًا كدليل.',
  },
  {
    id: 'reverse-arabic',
    answer: 'اللغة العربية',
    category: 'ثقافة',
    hint: 'ابنِ السؤال حول حرف أو مناسبة أو كتاب.',
  },
  {
    id: 'reverse-jupiter',
    answer: 'المشتري',
    category: 'علوم',
    hint: 'استعن بحجمه أو أقماره أو ترتيبه.',
  },
  {
    id: 'reverse-time',
    answer: 'الوقت',
    category: 'ألغاز',
    hint: 'اكتب سؤالًا لا يمكن تخزين إجابته في صندوق.',
  },
];

export function isSpecialGameMode(value: string): value is SpecialGameMode {
  return value === 'risk' || SPECIAL_GAME_ORDER.includes(value as SpecialGameMode);
}

import { COLOR_RUSH_TIMED_SECONDS } from '@tahaddi/domain';

export type InstantGameMode =
  | 'memory-flash'
  | 'question-word'
  | 'color-rush'
  | 'risk'
  | 'baloot';

export type InstantGameMeta = {
  mode: InstantGameMode;
  title: string;
  description: string;
  roundSeconds: number;
  minimumPlayers: number;
  contentLabel: string;
};

export const INSTANT_GAME_META: Record<InstantGameMode, InstantGameMeta> = {
  'memory-flash': {
    mode: 'memory-flash',
    title: 'ومضة الذاكرة',
    description: 'احفظ تسلسل الرموز، ثم أعده بالترتيب قبل أن تفقد محاولاتك.',
    roundSeconds: 60,
    minimumPlayers: 1,
    contentLabel: 'جولات تلقائية',
  },
  'question-word': {
    mode: 'question-word',
    title: 'كلمة وسؤال',
    description: 'سؤال سريع وإجابة من كلمة واحدة تركبها من حروف مبعثرة قبل الآخرين.',
    roundSeconds: 60,
    minimumPlayers: 2,
    contentLabel: '١٠ أسئلة',
  },
  'color-rush': {
    mode: 'color-rush',
    title: 'خدعة الألوان',
    description: 'اقرأ لون الكلمة لا معناها، واضغط الإجابة الصحيحة بأقصى سرعة.',
    roundSeconds: COLOR_RUSH_TIMED_SECONDS,
    minimumPlayers: 1,
    contentLabel: 'جولات تلقائية',
  },
  risk: {
    mode: 'risk',
    title: 'المجازفة',
    description:
      'اكشف بطاقات ثلاثية الأبعاد، اجمع رصيد دورك، واكتفِ قبل أن تقلب القنبلة كل الحسابات.',
    roundSeconds: 30,
    minimumPlayers: 2,
    contentLabel: '٢٤ بطاقة',
  },
  baloot: {
    mode: 'baloot',
    title: 'البلوت',
    description:
      'بلوت مباشر لأربعة لاعبين حقيقيين، بغرفة خاصة وتوزيع سري وتحكيم الضربات من الخادم.',
    roundSeconds: 0,
    minimumPlayers: 4,
    contentLabel: 'لعب مباشر',
  },
};

export const INSTANT_GAME_ORDER: InstantGameMode[] = [
  'baloot',
  'memory-flash',
  'question-word',
  'color-rush',
  'risk',
];

export const MEMORY_SYMBOL_BANK = [
  { value: '⚡', label: 'برق', color: '#facc15' },
  { value: '★', label: 'نجمة', color: '#fbbf24' },
  { value: '◆', label: 'ماسة', color: '#a78bfa' },
  { value: '●', label: 'دائرة', color: '#34d399' },
  { value: '🔥', label: 'لهب', color: '#f97316' },
  { value: '💎', label: 'جوهرة', color: '#22d3ee' },
  { value: '🌸', label: 'زهرة', color: '#fb7185' },
  { value: '🌙', label: 'قمر', color: '#c4b5fd' },
  { value: '🎯', label: 'هدف', color: '#f87171' },
  { value: '🏆', label: 'كأس', color: '#fcd34d' },
  { value: '🌈', label: 'قوس قزح', color: '#f472b6' },
  { value: '⚓', label: 'مرساة', color: '#94a3b8' },
] as const;

export type MemoryDifficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'legendary';

export type MemorySettings = {
  difficulty: MemoryDifficulty;
  label: string;
  mode: 'solo' | 'versus';
  previewBaseMs: number;
  previewStepMs: number;
  startingLives: number;
  totalSeconds: number;
  pointsPerSymbol: number;
};

export const MEMORY_DIFFICULTIES: Record<MemoryDifficulty, MemorySettings> = {
  easy: {
    difficulty: 'easy',
    label: 'سهل',
    mode: 'solo',
    previewBaseMs: 1000,
    previewStepMs: 180,
    startingLives: 5,
    totalSeconds: 90,
    pointsPerSymbol: 20,
  },
  medium: {
    difficulty: 'medium',
    label: 'متوسط',
    mode: 'solo',
    previewBaseMs: 850,
    previewStepMs: 160,
    startingLives: 4,
    totalSeconds: 75,
    pointsPerSymbol: 25,
  },
  hard: {
    difficulty: 'hard',
    label: 'صعب',
    mode: 'solo',
    previewBaseMs: 700,
    previewStepMs: 140,
    startingLives: 3,
    totalSeconds: 60,
    pointsPerSymbol: 30,
  },
  expert: {
    difficulty: 'expert',
    label: 'خبير',
    mode: 'solo',
    previewBaseMs: 550,
    previewStepMs: 120,
    startingLives: 2,
    totalSeconds: 50,
    pointsPerSymbol: 35,
  },
  legendary: {
    difficulty: 'legendary',
    label: 'أسطوري',
    mode: 'solo',
    previewBaseMs: 400,
    previewStepMs: 100,
    startingLives: 1,
    totalSeconds: 40,
    pointsPerSymbol: 40,
  },
};

export const MEMORY_MODE_META: Record<
  MemorySettings['mode'],
  { label: string; description: string }
> = {
  solo: {
    label: 'لاعب منفرد',
    description: 'تحدَّ ذاكرتك وحطّم الرقم القياسي.',
  },
  versus: {
    label: 'ضد رقمك',
    description: 'طارد رقمك القياسي وحاول تجاوزه في الجولة الحالية.',
  },
};

export const QUESTION_WORD_BANK = [
  {
    question: 'ما الكوكب الأقرب إلى الشمس؟',
    answer: 'عطارد',
    hint: 'أصغر كواكب المجموعة الشمسية وأسرعها دورانًا حول الشمس.',
    letters: ['د', 'ع', 'ا', 'ر', 'ط', 'م', 'ب'],
  },
  {
    question: 'ما الحيوان الأسترالي المشهور بالقفز؟',
    answer: 'كنغر',
    hint: 'يحمل صغيره في جراب أمامي.',
    letters: ['غ', 'ك', 'ر', 'ن', 'م', 'ل'],
  },
  {
    question: 'ما اسم الشهر الذي يصوم فيه المسلمون؟',
    answer: 'رمضان',
    hint: 'الشهر التاسع في التقويم الهجري.',
    letters: ['ض', 'ر', 'ا', 'ن', 'م', 'س', 'ل'],
  },
  {
    question: 'ما الغاز الذي يحتاجه الإنسان للتنفس؟',
    answer: 'أكسجين',
    hint: 'يشكل نحو خمس الغلاف الجوي للأرض.',
    letters: ['ج', 'أ', 'ن', 'س', 'ي', 'ك', 'م', 'ر'],
  },
  {
    question: 'ما المدينة السعودية الملقبة بعروس البحر الأحمر؟',
    answer: 'جدة',
    hint: 'مدينة ساحلية وبوابة تاريخية للحرمين الشريفين.',
    letters: ['د', 'ج', 'ة', 'ر', 'ب'],
  },
  {
    question: 'ما الجهاز المستخدم لقياس درجة الحرارة؟',
    answer: 'محرار',
    hint: 'يسمى أيضًا مقياس الحرارة.',
    letters: ['ر', 'م', 'ا', 'ح', 'ر', 'س', 'ت'],
  },
  {
    question: 'ما أكبر قارات العالم مساحة؟',
    answer: 'آسيا',
    hint: 'تضم أكبر عدد من سكان العالم.',
    letters: ['ي', 'آ', 'ا', 'س', 'ر', 'ن'],
  },
  {
    question: 'ما البحر الذي يفصل بين السعودية ومصر؟',
    answer: 'الأحمر',
    hint: 'يمتد بين قارتي آسيا وأفريقيا.',
    letters: ['م', 'ا', 'ر', 'أ', 'ح', 'ل', 'ب', 'د'],
  },
  {
    question: 'ما العلم الذي يدرس النجوم والكواكب؟',
    answer: 'فلك',
    hint: 'من أقدم العلوم الطبيعية.',
    letters: ['ل', 'ف', 'ك', 'م', 'ر'],
  },
  {
    question: 'ما الطائر الذي لا يطير ويعيش في القطب الجنوبي؟',
    answer: 'بطريق',
    hint: 'سباح ماهر وله ريش أسود وأبيض.',
    letters: ['ق', 'ب', 'ي', 'ط', 'ر', 'س', 'ن'],
  },
] as const;

export const COLOR_RUSH_BANK = [
  { label: 'أحمر', value: '#ff5252', symbol: '▲', symbolLabel: 'مثلث' },
  { label: 'أزرق', value: '#00d4ff', symbol: '●', symbolLabel: 'دائرة' },
  { label: 'ذهبي', value: '#ffb000', symbol: '■', symbolLabel: 'مربع' },
  { label: 'أخضر', value: '#10b981', symbol: '◆', symbolLabel: 'معيّن' },
] as const;

export function isInstantGameMode(value: string): value is InstantGameMode {
  return INSTANT_GAME_ORDER.includes(value as InstantGameMode);
}

export {
  buildRiskDeck,
  RISK_PRESETS,
  type RiskCard,
  type RiskCardKind,
  type RiskDifficulty,
} from '@tahaddi/domain';

import type { SpecialGameMode, SpecialGameMeta } from './special-games';
import { SPECIAL_GAME_META, SPECIAL_GAME_ORDER, UPCOMING_SPECIAL_GAMES } from './special-games';

export type InstantGameMode =
  | 'quote-master'
  | 'memory-flash'
  | 'word-code'
  | 'question-word'
  | 'color-rush'
  | 'spot-difference'
  | 'scrambled-words'
  | 'risk'
  | 'category-board'
  | 'millionaire'
  | 'baloot'
  | 'letter-challenge'
  | 'knowledge-tower'
  | 'ladder'
  | 'scrambled-words-live'
  | 'elimination-live';

export type InstantGameMeta = {
  mode: InstantGameMode;
  title: string;
  description: string;
  roundSeconds: number;
  minimumPlayers: number;
  contentLabel: string;
};

export const INSTANT_GAME_META: Record<InstantGameMode, InstantGameMeta> = {
  'quote-master': {
    mode: 'quote-master',
    title: 'من القائل؟',
    description: 'بيت شعر أو حكمة خالدة، وأربعة أسماء: اكتشف صاحب القول قبل نفاد الوقت.',
    roundSeconds: 20,
    minimumPlayers: 1,
    contentLabel: '١٢ قولاً',
  },
  'memory-flash': {
    mode: 'memory-flash',
    title: 'ومضة الذاكرة',
    description: 'احفظ تسلسل الرموز، ثم أعده بالترتيب قبل أن تفقد محاولاتك.',
    roundSeconds: 60,
    minimumPlayers: 1,
    contentLabel: 'جولات تلقائية',
  },
  'word-code': {
    mode: 'word-code',
    title: 'شفرة الحروف',
    description: 'فكّ الحروف العربية المبعثرة مستعينًا بالتلميح، واجمع أكبر رصيد.',
    roundSeconds: 60,
    minimumPlayers: 1,
    contentLabel: 'بنك كلمات',
  },
  'question-word': {
    mode: 'question-word',
    title: 'كلمة وسؤال',
    description: 'سؤال جماعي سريع، وإجابة من كلمة واحدة تركبها من حروف مبعثرة.',
    roundSeconds: 60,
    minimumPlayers: 2,
    contentLabel: '١٠ أسئلة',
  },
  'color-rush': {
    mode: 'color-rush',
    title: 'خدعة الألوان',
    description: 'اقرأ لون الكلمة لا معناها، واضغط الإجابة الصحيحة بأقصى سرعة.',
    roundSeconds: 45,
    minimumPlayers: 1,
    contentLabel: 'جولات تلقائية',
  },
  'spot-difference': {
    mode: 'spot-difference',
    title: 'اختلاف الصور',
    description: 'قارن بين مشهدين متطابقين ظاهريًا، واكشف الفروق الخمسة قبل انتهاء الوقت.',
    roundSeconds: 60,
    minimumPlayers: 1,
    contentLabel: 'مشاهد متعددة',
  },
  'scrambled-words': {
    mode: 'scrambled-words',
    title: 'كلمات مفككة',
    description: 'ركّب الكلمات المبعثرة حرفًا حرفًا مستعينًا بالصورة والتلميح، وأكمل اللوحات.',
    roundSeconds: 60,
    minimumPlayers: 1,
    contentLabel: 'لوحات كلمات',
  },
  risk: {
    mode: 'risk',
    title: 'المجازفة',
    description:
      'اكشف البطاقات واجمع رصيد دورك، ثم اكتفِ في الوقت المناسب قبل أن تظهر القنبلة.',
    roundSeconds: 0,
    minimumPlayers: 2,
    contentLabel: '٣٠ خانة',
  },
  'category-board': {
    mode: 'category-board',
    title: 'لوحة الفئات',
    description: 'فريقان وفئات متنوعة في مواجهات تديرها من لوحة مضيف واحدة.',
    roundSeconds: 0,
    minimumPlayers: 2,
    contentLabel: 'لوحة أسئلة',
  },
  millionaire: {
    mode: 'millionaire',
    title: 'من سيربح المليون؟',
    description: 'خمسة عشر مستوى، محطات أمان، وثلاث وسائل مساعدة في رحلة إلى المليون.',
    roundSeconds: 0,
    minimumPlayers: 1,
    contentLabel: '١٥ مستوى',
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
  'letter-challenge': {
    mode: 'letter-challenge',
    title: 'تحدي الحروف',
    description: 'فريقان يتنافسان على امتلاك الحروف وبناء مسار متصل عبر شبكة سداسية.',
    roundSeconds: 15,
    minimumPlayers: 2,
    contentLabel: '٢٥ حرفًا',
  },
  'knowledge-tower': {
    mode: 'knowledge-tower',
    title: 'برج المعرفة',
    description:
      'اصعد اثني عشر طابقاً من الأسئلة العربية؛ ثلاث أرواح، محطات أمان، ووقت يتسارع مع الارتفاع.',
    roundSeconds: 25,
    minimumPlayers: 1,
    contentLabel: '١٢ طابقاً',
  },
  ladder: {
    mode: 'ladder',
    title: 'السلم',
    description:
      'فريقان يتنافسان على السلم: إجابة صحيحة تصعد، وخاطئة تنزل. أول من يبلغ القمة يفوز.',
    roundSeconds: 15,
    minimumPlayers: 2,
    contentLabel: 'فريقان',
  },
  'scrambled-words-live': {
    mode: 'scrambled-words-live',
    title: 'كلمات مفككة — مباشرة',
    description:
      'صورة على الشاشة وكلماتها مقطعة إلى دوائر: سباق مباشر بين اللاعبين لتركيب كل الكلمات قبل نهاية الوقت.',
    roundSeconds: 60,
    minimumPlayers: 2,
    contentLabel: 'صور وكلمات',
  },
  'elimination-live': {
    mode: 'elimination-live',
    title: 'حلقة الإقصاء',
    description:
      'سؤال واحد في كل جولة وكل من يخطئ يُقصى فورًا: الأسئلة تتصاعد صعوبة والناجي الأخير وحده يتوج.',
    roundSeconds: 20,
    minimumPlayers: 2,
    contentLabel: 'إقصاء مباشر',
  },
};

export const INSTANT_GAME_ORDER: InstantGameMode[] = [
  'quote-master',
  'knowledge-tower',
  'category-board',
  'millionaire',
  'baloot',
  'memory-flash',
  'word-code',
  'question-word',
  'color-rush',
  'spot-difference',
  'scrambled-words',
  'risk',
  'letter-challenge',
  'ladder',
  'scrambled-words-live',
  'elimination-live',
];

export type GameKind = 'room' | 'instant' | 'upcoming';

export type DifficultyValue = 1 | 2 | 3 | 4 | 5;

export type PlatformValue = 'web' | 'mobile' | 'pwa';

export type GameCategory =
  'ثقافة' | 'ذكاء' | 'سرعة' | 'ذاكرة' | 'اجتماعي' | 'تركيز' | 'حظ' | 'استراتيجية';

export interface EnhancedGameMeta {
  id: string;
  mode: SpecialGameMode | InstantGameMode;
  kind: GameKind;
  title: string;
  shortTitle: string;
  description: string;
  minimumPlayers: number;
  maximumPlayers: number;
  roundSeconds: number;
  contentLabel: string;
  year: number;
  difficulty: DifficultyValue;
  platforms: PlatformValue[];
  categories: GameCategory[];
  tags: string[];
  accent: string;
  href?: string;
  requiresRealtime: boolean;
  requiresAuth: boolean;
}

export type GameSortKey = 'popular' | 'newest' | 'oldest' | 'players' | 'manual';

export interface GameFilterState {
  query: string;
  kinds: GameKind[];
  categories: GameCategory[];
  difficultyMin: DifficultyValue;
  difficultyMax: DifficultyValue;
  platforms: PlatformValue[];
  playersMin: number;
  playersMax: number;
  years: number[];
  tags: string[];
  sort: GameSortKey;
  view: 'grid' | 'list';
  manualOrder?: string[];
}

export interface GameSearchSuggestion {
  id: string;
  type: 'game' | 'category' | 'tag';
  label: string;
  match?: string;
}

export const INJECTED_GAME_CATALOG: EnhancedGameMeta[] = [
  {
    id: 'quote-master',
    mode: 'quote-master',
    kind: 'room',
    title: 'من القائل؟',
    shortTitle: 'من القائل؟',
    description:
      'شاشة عرض فاخرة يقودها المضيف: بيت شعر أو حكمة خالدة وأربعة أسماء من عمالقة الأدب العربي. يدخل المتسابقون بمسح الباركود، وتظهر أسماؤهم في ردهة المضيف، ثم يتنافسون على أعلى نقاط.',
    minimumPlayers: 2,
    maximumPlayers: 40,
    roundSeconds: 20,
    contentLabel: '١٢ قولاً',
    year: 2026,
    difficulty: 4,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ثقافة', 'ذكاء', 'اجتماعي'],
    tags: ['شعر', 'حكمة', 'أدب', 'اقتباس', 'باركود', 'مضيف'],
    accent: '#e8b64c',
    href: '/games/quote-master',
    requiresRealtime: true,
    requiresAuth: false,
  },
  {
    id: 'knowledge-tower',
    mode: 'knowledge-tower',
    kind: 'instant',
    title: 'برج المعرفة',
    shortTitle: 'البرج',
    description:
      'تسلّق اثني عشر طابقاً من الأسئلة العربية المتدرجة، بثلاث أرواح ومحطات أمان ووقت يضيق كلما ارتفعت.',
    minimumPlayers: 1,
    maximumPlayers: 1,
    roundSeconds: 25,
    contentLabel: '١٢ طابقاً',
    year: 2026,
    difficulty: 4,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ثقافة', 'ذكاء', 'تركيز'],
    tags: ['برج', 'أسئلة', 'تسلّق', 'محطات أمان', 'عربية'],
    accent: '#f59e0b',
    href: '/games/knowledge-tower',
    requiresRealtime: false,
    requiresAuth: false,
  },
  {
    id: 'letter-challenge',
    mode: 'letter-challenge',
    kind: 'instant',
    title: 'تحدي الحروف',
    shortTitle: 'الحروف',
    description: 'فريق أخضر وفريق برتقالي يتسابقان لامتلاك الحروف وبناء مسار متصل عبر لوحة سداسية.',
    minimumPlayers: 2,
    maximumPlayers: 20,
    roundSeconds: 15,
    contentLabel: '٢٥ حرفًا',
    year: 2026,
    difficulty: 3,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ذكاء', 'اجتماعي', 'استراتيجية'],
    tags: ['حروف', 'فريقان', 'شبكة سداسية', 'أسئلة عربية'],
    accent: '#28b878',
    href: '/games/letter-challenge',
    requiresRealtime: false,
    requiresAuth: false,
  },
  {
    id: 'ladder',
    mode: 'ladder',
    kind: 'room',
    title: 'السلم',
    shortTitle: 'السلم',
    description:
      'فريقان يتنافسان على السلم: إجابة صحيحة تصعد، وخاطئة تنزل. أول من يبلغ القمة يفوز.',
    minimumPlayers: 2,
    maximumPlayers: 20,
    roundSeconds: 15,
    contentLabel: 'فريقان',
    year: 2026,
    difficulty: 3,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ثقافة', 'سرعة', 'استراتيجية'],
    tags: ['سلم', 'فريقان', 'أسئلة', 'تنافس'],
    accent: '#00d4ff',
    href: '/games/ladder',
    requiresRealtime: true,
    requiresAuth: false,
  },
  {
    id: 'scrambled-words-live',
    mode: 'scrambled-words-live',
    kind: 'room',
    title: 'كلمات مفككة — مباشرة',
    shortTitle: 'مفككة مباشرة',
    description:
      'صورة على الشاشة وكلماتها مقطعة إلى دوائر: سباق مباشر بين اللاعبين لتركيب كل الكلمات قبل نهاية الوقت.',
    minimumPlayers: 2,
    maximumPlayers: 24,
    roundSeconds: 60,
    contentLabel: 'صور وكلمات',
    year: 2026,
    difficulty: 2,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ذكاء', 'سرعة', 'اجتماعي'],
    tags: ['كلمات', 'صور', 'سباق', 'تركيب', 'مباشر'],
    accent: '#ffb40c',
    href: '/games/scrambled-words-live',
    requiresRealtime: true,
    requiresAuth: false,
  },
  {
    id: 'elimination-live',
    mode: 'elimination-live',
    kind: 'room',
    title: 'حلقة الإقصاء',
    shortTitle: 'حلقة الإقصاء',
    description:
      'يبدأ الجميع معًا وسؤال واحد في كل جولة: كل من يخطئ يُقصى فورًا، والأسئلة تتصاعد صعوبة حتى يبقى ناجٍ واحد.',
    minimumPlayers: 2,
    maximumPlayers: 32,
    roundSeconds: 20,
    contentLabel: 'إقصاء مباشر',
    year: 2026,
    difficulty: 2,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ثقافة', 'سرعة', 'اجتماعي'],
    tags: ['إقصاء', 'نجاة', 'أسئلة', 'مباشر', 'جولات'],
    accent: '#ef5350',
    href: '/games/elimination-live',
    requiresRealtime: true,
    requiresAuth: false,
  },
  {
    id: 'category-board',
    mode: 'category-board',
    kind: 'instant',
    title: 'لوحة الفئات',
    shortTitle: 'لوحة الفئات',
    description:
      'قسّم الحضور إلى فريقين، اختر الفئات، ثم أدر الأسئلة والنقاط والوسائل من شاشة واحدة.',
    minimumPlayers: 2,
    maximumPlayers: 12,
    roundSeconds: 0,
    contentLabel: 'لوحة أسئلة',
    year: 2026,
    difficulty: 3,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ثقافة', 'اجتماعي', 'استراتيجية'],
    tags: ['فئات', 'فريقان', 'لوحة مضيف', 'أسئلة'],
    accent: '#d4af37',
    requiresRealtime: false,
    requiresAuth: false,
  },
  {
    id: 'millionaire',
    mode: 'millionaire',
    kind: 'instant',
    title: 'من سيربح المليون؟',
    shortTitle: 'المليون',
    description: 'تدرّج عبر ١٥ سؤالًا مع محطات أمان ووسائل مساعدة قبل الوصول إلى المليون.',
    minimumPlayers: 1,
    maximumPlayers: 1,
    roundSeconds: 0,
    contentLabel: '١٥ مستوى',
    year: 2026,
    difficulty: 4,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ثقافة', 'ذكاء', 'استراتيجية'],
    tags: ['مليون', 'أسئلة', 'محطات أمان', 'وسائل مساعدة'],
    accent: '#ffb40c',
    href: '/games/millionaire',
    requiresRealtime: false,
    requiresAuth: false,
  },
  {
    id: 'chess',
    mode: 'chess',
    kind: 'room',
    title: 'تحدي الشطرنج',
    shortTitle: 'الشطرنج',
    description: 'تحدى صديقك مباشرة أو شاهد المباراة برمز الغرفة — بدون تسجيل.',
    minimumPlayers: 2,
    maximumPlayers: 2,
    roundSeconds: 0,
    contentLabel: 'استراتيجية',
    year: 2026,
    difficulty: 3,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['استراتيجية'],
    tags: ['شطرنج', 'استراتيجية', 'مباشر', 'بدون تسجيل'],
    accent: '#8b5cf6',
    requiresRealtime: true,
    requiresAuth: false,
  },
  {
    id: 'baloot',
    mode: 'baloot',
    kind: 'instant',
    title: 'البلوت',
    shortTitle: 'البلوت',
    description:
      'لعبة بلوت مباشرة لأربعة لاعبين: غرف خاصة، شراء صن وحكم، تحقق خادمي من الحركات، واستعادة المقعد بعد الانقطاع.',
    minimumPlayers: 4,
    maximumPlayers: 4,
    roundSeconds: 0,
    contentLabel: 'قيد ١٥٢',
    year: 2026,
    difficulty: 3,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['استراتيجية', 'اجتماعي', 'حظ'],
    tags: ['بلوت', 'ورق', 'صكة', 'غرفة مباشرة'],
    accent: '#0f9f6e',
    href: '/games/baloot',
    requiresRealtime: true,
    requiresAuth: false,
  },
  {
    id: 'mafia',
    mode: 'infiltrator',
    kind: 'room',
    title: 'القاتل',
    shortTitle: 'القاتل',
    description:
      'أدوار سرية، ليل ونهار وتصويت؛ المضيف يرى المشهد الكامل واللاعبون يرون ما يخصهم فقط.',
    minimumPlayers: 5,
    maximumPlayers: 30,
    roundSeconds: 45,
    contentLabel: 'أدوار سرية',
    year: 2026,
    difficulty: 4,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['اجتماعي', 'استراتيجية'],
    tags: ['قاتل', 'أدوار', 'تصويت', 'تحقيق', 'غرفة'],
    accent: '#ef4444',
    href: '/mafia',
    requiresRealtime: false,
    requiresAuth: true,
  },
  {
    id: 'parallel-world',
    mode: 'parallel-world',
    kind: 'room',
    title: 'العالم الموازي',
    shortTitle: 'العالم الموازي',
    description: 'أسئلة مختلفة لكل لاعب، لكن الإجابة التي تجمع العوالم واحدة.',
    minimumPlayers: 2,
    maximumPlayers: 12,
    roundSeconds: 25,
    contentLabel: 'بنك أسئلة',
    year: 2025,
    difficulty: 3,
    platforms: ['web', 'pwa'],
    categories: ['ثقافة', 'ذكاء', 'اجتماعي'],
    tags: ['عالم موازي', 'أسئلة متعددة', 'جماعي', 'عربية'],
    accent: '#ff8a65',
    requiresRealtime: true,
    requiresAuth: false,
  },
  {
    id: 'reverse-time',
    mode: 'reverse-time',
    kind: 'room',
    title: 'الزمن المقلوب',
    shortTitle: 'الزمن المقلوب',
    description: 'تظهر الإجابة أولًا، ثم يصنع اللاعبون السؤال الأذكى ويصوّتون له.',
    minimumPlayers: 3,
    maximumPlayers: 10,
    roundSeconds: 35,
    contentLabel: 'بنك أسئلة',
    year: 2025,
    difficulty: 4,
    platforms: ['web', 'pwa'],
    categories: ['ذكاء', 'اجتماعي', 'استراتيجية'],
    tags: ['عكس', 'تصويت', 'إبداع', 'سؤال مفتوح'],
    accent: '#ffb74d',
    requiresRealtime: true,
    requiresAuth: false,
  },
  {
    id: 'infiltrator',
    mode: 'infiltrator',
    kind: 'room',
    title: 'الدخيل',
    shortTitle: 'الدخيل',
    description: 'سؤال واحد للأغلبية وسؤال مختلف للدخيل؛ أجب ثم اكتشفه قبل أن يخدعكم.',
    minimumPlayers: 4,
    maximumPlayers: 16,
    roundSeconds: 45,
    contentLabel: 'بنك أسئلة',
    year: 2025,
    difficulty: 4,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['اجتماعي', 'استراتيجية', 'حظ'],
    tags: ['دخيل', 'تصويت', 'أدوار', 'تفكير جماعي'],
    accent: '#ef5350',
    requiresRealtime: true,
    requiresAuth: false,
  },
  {
    id: 'spectrum',
    mode: 'parallel-world',
    kind: 'upcoming',
    title: 'الطيف',
    shortTitle: 'الطيف',
    description: 'ضع إجابتك بين طرفين متقابلين، ثم اكتشف أين تتقاطع تقديرات الفريق.',
    minimumPlayers: 3,
    maximumPlayers: 12,
    roundSeconds: 40,
    contentLabel: 'بنك أطياف',
    year: 2026,
    difficulty: 3,
    platforms: ['web', 'pwa'],
    categories: ['اجتماعي', 'تركيز', 'استراتيجية'],
    tags: ['طيف', 'تقدير', 'جماعي', 'قيد التطوير'],
    accent: '#ab47bc',
    requiresRealtime: true,
    requiresAuth: false,
  },
  {
    id: 'memory-flash',
    mode: 'memory-flash',
    kind: 'instant',
    title: 'ومضة الذاكرة',
    shortTitle: 'ومضة الذاكرة',
    description: 'احفظ تسلسل الرموز، ثم أعده بالترتيب قبل أن تفقد محاولاتك.',
    minimumPlayers: 1,
    maximumPlayers: 1,
    roundSeconds: 60,
    contentLabel: 'جولات تلقائية',
    year: 2024,
    difficulty: 2,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ذاكرة', 'سرعة', 'تركيز'],
    tags: ['ذاكرة', 'رموز', 'فوري', 'وحيد'],
    accent: '#34d399',
    requiresRealtime: false,
    requiresAuth: false,
  },
  {
    id: 'word-code',
    mode: 'word-code',
    kind: 'instant',
    title: 'شفرة الحروف',
    shortTitle: 'شفرة الحروف',
    description: 'فكّ الحروف العربية المبعثرة مستعينًا بالتلميح، واجمع أكبر رصيد.',
    minimumPlayers: 1,
    maximumPlayers: 1,
    roundSeconds: 60,
    contentLabel: 'بنك كلمات',
    year: 2024,
    difficulty: 2,
    platforms: ['web', 'pwa'],
    categories: ['ذكاء', 'سرعة', 'ثقافة'],
    tags: ['حروف', 'كلمات', 'تلميح', 'فوري'],
    accent: '#22d3ee',
    requiresRealtime: false,
    requiresAuth: false,
  },
  {
    id: 'question-word',
    mode: 'question-word',
    kind: 'instant',
    title: 'كلمة وسؤال',
    shortTitle: 'كلمة وسؤال',
    description: 'سؤال واحد للجميع، كلمة واحدة، وحروف مبعثرة تضغطها بالترتيب قبل انتهاء الدقيقة.',
    minimumPlayers: 2,
    maximumPlayers: 20,
    roundSeconds: 60,
    contentLabel: '١٠ أسئلة',
    year: 2026,
    difficulty: 3,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ثقافة', 'سرعة', 'اجتماعي'],
    tags: ['سؤال', 'كلمة', 'حروف', 'سرعة', 'جماعي'],
    accent: '#00d4ff',
    href: '/games/question-word',
    requiresRealtime: false,
    requiresAuth: false,
  },
  {
    id: 'color-rush',
    mode: 'color-rush',
    kind: 'instant',
    title: 'خدعة الألوان',
    shortTitle: 'خدعة الألوان',
    description: 'اقرأ لون الكلمة لا معناها، واضغط الإجابة الصحيحة بأقصى سرعة.',
    minimumPlayers: 1,
    maximumPlayers: 1,
    roundSeconds: 45,
    contentLabel: 'جولات تلقائية',
    year: 2025,
    difficulty: 3,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['تركيز', 'سرعة', 'ذاكرة'],
    tags: ['ألوان', 'حبس انتباه', 'Stroop', 'فوري'],
    accent: '#fbbf24',
    requiresRealtime: false,
    requiresAuth: false,
  },
  {
    id: 'spot-difference',
    mode: 'spot-difference',
    kind: 'instant',
    title: 'اختلاف الصور',
    shortTitle: 'الفروق',
    description:
      'قارن بين مشهدين متطابقين ظاهريًا، واكشف الفروق الخمسة بأسرع ما يمكن قبل انتهاء الوقت.',
    minimumPlayers: 1,
    maximumPlayers: 1,
    roundSeconds: 60,
    contentLabel: 'مشاهد متعددة',
    year: 2026,
    difficulty: 2,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['تركيز', 'ذاكرة', 'سرعة'],
    tags: ['فروق', 'صور', 'ملاحظة', 'فوري'],
    accent: '#60a5fa',
    href: '/games/spot-difference',
    requiresRealtime: false,
    requiresAuth: false,
  },
  {
    id: 'scrambled-words',
    mode: 'scrambled-words',
    kind: 'instant',
    title: 'كلمات مفككة',
    shortTitle: 'الكلمات',
    description:
      'ركّب الكلمات المبعثرة حرفًا حرفًا مستعينًا بالصورة والتلميح، وأكمل لوحات الكلمات قبل الوقت.',
    minimumPlayers: 1,
    maximumPlayers: 1,
    roundSeconds: 60,
    contentLabel: 'لوحات كلمات',
    year: 2026,
    difficulty: 2,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['ذكاء', 'سرعة', 'تركيز'],
    tags: ['كلمات', 'حروف', 'تركيب', 'فوري'],
    accent: '#e879f9',
    href: '/games/scrambled-words',
    requiresRealtime: false,
    requiresAuth: false,
  },
  {
    id: 'risk',
    mode: 'risk',
    kind: 'instant',
    title: 'المجازفة',
    shortTitle: 'المجازفة',
    description:
      'اكشف البطاقات واجمع رصيد دورك، ثم اكتفِ في الوقت المناسب قبل أن تظهر القنبلة.',
    minimumPlayers: 2,
    maximumPlayers: 8,
    roundSeconds: 30,
    contentLabel: '٢٤ بطاقة',
    year: 2026,
    difficulty: 2,
    platforms: ['web', 'pwa', 'mobile'],
    categories: ['اجتماعي', 'حظ'],
    tags: ['مجازفة', 'فِرق', 'تحديات', 'حفلات'],
    accent: '#f43f5e',
    href: '/games/risk',
    requiresRealtime: false,
    requiresAuth: false,
  },
];

export const DEFAULT_FILTER_STATE: GameFilterState = {
  query: '',
  kinds: [],
  categories: [],
  difficultyMin: 1,
  difficultyMax: 5,
  platforms: [],
  playersMin: 0,
  playersMax: 20,
  years: [],
  tags: [],
  sort: 'popular',
  view: 'grid',
};

export function normalizeCatalogFilters(filters: GameFilterState): GameFilterState {
  const difficultyMin = Math.min(
    Math.max(1, filters.difficultyMin) as DifficultyValue,
    Math.max(1, filters.difficultyMax) as DifficultyValue,
  ) as DifficultyValue;
  const difficultyMax = Math.max(
    Math.min(5, filters.difficultyMin) as DifficultyValue,
    Math.min(5, filters.difficultyMax) as DifficultyValue,
  ) as DifficultyValue;
  const playersMin = Math.min(Math.max(0, filters.playersMin), Math.max(0, filters.playersMax));
  const playersMax = Math.max(Math.min(20, filters.playersMin), Math.min(20, filters.playersMax));
  return {
    ...filters,
    difficultyMin,
    difficultyMax,
    playersMin,
    playersMax,
  };
}

export function gameMatchesFilters(game: EnhancedGameMeta, filters: GameFilterState): boolean {
  const f = normalizeCatalogFilters(filters);
  if (f.kinds.length > 0 && !f.kinds.includes(game.kind)) return false;
  if (f.categories.length > 0 && !game.categories.some((c) => f.categories.includes(c))) {
    return false;
  }
  if (game.difficulty < f.difficultyMin || game.difficulty > f.difficultyMax) {
    return false;
  }
  if (f.platforms.length > 0 && !game.platforms.some((p) => f.platforms.includes(p))) {
    return false;
  }
  if (game.maximumPlayers < f.playersMin) return false;
  if (game.minimumPlayers > f.playersMax) return false;
  if (f.years.length > 0 && !f.years.includes(game.year)) return false;
  if (f.tags.length > 0 && !game.tags.some((t) => f.tags.includes(t))) return false;
  if (f.query.trim()) {
    const q = f.query.trim().toLocaleLowerCase('ar');
    const haystack = [
      game.title,
      game.shortTitle,
      game.description,
      game.contentLabel,
      ...game.categories,
      ...game.tags,
    ]
      .join(' ')
      .toLocaleLowerCase('ar');
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export function sortGames<T extends EnhancedGameMeta>(games: T[], filters: GameFilterState): T[] {
  const sorted = [...games];
  switch (filters.sort) {
    case 'popular':
      break;
    case 'newest':
      sorted.sort((a, b) => b.year - a.year);
      break;
    case 'oldest':
      sorted.sort((a, b) => a.year - b.year);
      break;
    case 'players':
      sorted.sort((a, b) => b.maximumPlayers - a.maximumPlayers);
      break;
    case 'manual':
      if (filters.manualOrder?.length) {
        const rank = new Map(filters.manualOrder.map((id, i) => [id, i]));
        sorted.sort((a, b) => {
          const ar = rank.get(a.id);
          const br = rank.get(b.id);
          if (ar == null && br == null) return 0;
          if (ar == null) return 1;
          if (br == null) return -1;
          return ar - br;
        });
      }
      break;
  }
  return sorted;
}

export function collectAllTags(games: EnhancedGameMeta[]): string[] {
  const set = new Set<string>();
  for (const g of games) for (const t of g.tags) set.add(t);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
}

export function collectAllYears(games: EnhancedGameMeta[]): number[] {
  return Array.from(new Set(games.map((g) => g.year))).sort((a, b) => b - a);
}

export function collectAllCategories(games: EnhancedGameMeta[]): GameCategory[] {
  const set = new Set<GameCategory>();
  for (const g of games) for (const c of g.categories) set.add(c);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
}

export function buildSearchSuggestions(
  games: EnhancedGameMeta[],
  filters: GameFilterState,
  limit = 8,
): GameSearchSuggestion[] {
  const results: GameSearchSuggestion[] = [];
  const q = filters.query.trim().toLocaleLowerCase('ar');
  if (!q) return [];

  for (const game of games) {
    const title = game.title.toLocaleLowerCase('ar');
    if (title.includes(q) || game.shortTitle.toLocaleLowerCase('ar').includes(q)) {
      results.push({
        id: `game:${game.id}`,
        type: 'game',
        label: game.title,
        match: `${game.kind === 'room' ? 'جماعية' : game.kind === 'instant' ? 'فورية' : 'قريبًا'} · ${game.categories[0] ?? ''}`,
      });
      if (results.length >= limit) return results;
    }
  }

  const cats = collectAllCategories(games);
  for (const cat of cats) {
    if (cat.toLocaleLowerCase('ar').includes(q)) {
      results.push({ id: `cat:${cat}`, type: 'category', label: `التصنيف: ${cat}` });
      if (results.length >= limit) return results;
    }
  }

  const tags = collectAllTags(games);
  for (const tag of tags) {
    if (tag.toLocaleLowerCase('ar').includes(q)) {
      results.push({ id: `tag:${tag}`, type: 'tag', label: `الوسم: ${tag}` });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

export function collectAllGames(): EnhancedGameMeta[] {
  return [...INJECTED_GAME_CATALOG];
}

export function enrichSpecialGame(mode: SpecialGameMode): EnhancedGameMeta {
  const base: SpecialGameMeta = SPECIAL_GAME_META[mode];
  const existing = INJECTED_GAME_CATALOG.find((g) => g.id === mode);
  if (existing) return existing;
  return {
    id: mode,
    mode,
    kind: 'room',
    title: base.title,
    shortTitle: base.shortTitle,
    description: base.description,
    minimumPlayers: base.minimumPlayers,
    maximumPlayers: 12,
    roundSeconds: base.roundSeconds,
    contentLabel: base.contentLabel,
    year: 2025,
    difficulty: 3,
    platforms: ['web', 'pwa'],
    categories: ['اجتماعي', 'ذكاء'],
    tags: ['محدث'],
    accent: '#ffb74d',
    requiresRealtime: true,
    requiresAuth: false,
  };
}

export function mergeCatalogWithExisting(base?: EnhancedGameMeta[]): EnhancedGameMeta[] {
  const items = base ?? collectAllGames();
  const fromUpcoming: EnhancedGameMeta[] = UPCOMING_SPECIAL_GAMES.filter(
    (u) => !items.some((g) => g.id === u.slug),
  ).map((u, i) => ({
    id: u.slug,
    mode: 'parallel-world' as SpecialGameMode,
    kind: 'upcoming' as GameKind,
    title: u.title,
    shortTitle: u.title,
    description: u.description,
    minimumPlayers: u.minimumPlayers,
    maximumPlayers: 12,
    roundSeconds: u.roundSeconds,
    contentLabel: u.contentLabel,
    year: 2026,
    difficulty: 3 as DifficultyValue,
    platforms: ['web', 'pwa'] as PlatformValue[],
    categories: ['اجتماعي'] as GameCategory[],
    tags: ['قيد التطوير'],
    accent: ['#ab47bc', '#26c6da', '#ec407a'][i % 3] ?? '#ab47bc',
    requiresRealtime: true,
    requiresAuth: false,
  }));
  return [...items, ...fromUpcoming];
}

export function applyCatalogFilters<T extends EnhancedGameMeta>(
  games: T[],
  filters: GameFilterState,
): T[] {
  const normalized = normalizeCatalogFilters(filters);
  return sortGames(
    games.filter((g) => gameMatchesFilters(g, normalized)),
    normalized,
  );
}

export function summarizeGames(games: EnhancedGameMeta[]) {
  const total = games.length;
  return {
    total,
    categories: collectAllCategories(games).length,
  };
}

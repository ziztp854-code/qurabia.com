export type InstantGameMode =
  | 'memory-flash'
  | 'word-code'
  | 'question-word'
  | 'color-rush'
  | 'spot-difference'
  | 'scrambled-words'
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
    description: 'سؤال سريع وإجابة من كلمة واحدة تركبها من حروف مبعثرة قبل الآخرين.',
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
  'word-code',
  'question-word',
  'color-rush',
  'spot-difference',
  'scrambled-words',
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

export const WORD_CODE_BANK = [
  { word: 'السعودية', scrambled: 'سعلاةودي', hint: 'وطننا الغالي' },
  { word: 'منافسة', scrambled: 'افسمنة', hint: 'تحدٍّ بين لاعبين' },
  { word: 'صحراء', scrambled: 'ءحراص', hint: 'رمال واسعة' },
  { word: 'تاريخ', scrambled: 'راتيخ', hint: 'حكاية ما مضى' },
  { word: 'سرعة', scrambled: 'عرةس', hint: 'عكس البطء' },
  { word: 'نجمة', scrambled: 'جنةم', hint: 'تلمع في السماء' },
  { word: 'بطولة', scrambled: 'وبلةط', hint: 'منافسة تنتهي بكأس' },
  { word: 'مغامرة', scrambled: 'غمامرة', hint: 'رحلة مليئة بالمفاجآت' },
  { word: 'فريق', scrambled: 'فيرق', hint: 'لاعبون في جهة واحدة' },
  { word: 'صدارة', scrambled: 'ةرداص', hint: 'المركز الأول' },
  { word: 'إجابة', scrambled: 'اإبجة', hint: 'حل السؤال' },
  { word: 'حماس', scrambled: 'احمس', hint: 'شعور يشعل التحدّي' },
  { word: 'مكتبة', scrambled: 'تكةبم', hint: 'بيت الكتب' },
  { word: 'قهوة', scrambled: 'ةقهو', hint: 'مشروب الضيافة العربي' },
  { word: 'شاطئ', scrambled: 'طائش', hint: 'حيث يلتقي البحر بالرمل' },
  { word: 'نخلة', scrambled: 'نلةخ', hint: 'شجرة التمر' },
  { word: 'قلعة', scrambled: 'لةعق', hint: 'حصن قديم' },
  { word: 'مدرسة', scrambled: 'مرةدس', hint: 'مكان التعلم' },
  { word: 'طائرة', scrambled: 'رةاطئ', hint: 'تحلق في السماء' },
  { word: 'مفتاح', scrambled: 'مفاحت', hint: 'يفتح الأبواب' },
  { word: 'جزيرة', scrambled: 'رجةزي', hint: 'أرض يحيط بها الماء' },
  { word: 'مهرجان', scrambled: 'مجرهان', hint: 'احتفال كبير' },
  { word: 'عاصمة', scrambled: 'معاةص', hint: 'أهم مدينة في الدولة' },
  { word: 'ملعب', scrambled: 'لمبع', hint: 'ساحة المباريات' },
  { word: 'حاسوب', scrambled: 'ابوسح', hint: 'جهاز ذكي للعمل واللعب' },
  { word: 'شلال', scrambled: 'للشا', hint: 'ماء يهوي من علٍ' },
  { word: 'غيمة', scrambled: 'يةغم', hint: 'تحمل المطر' },
  { word: 'فانوس', scrambled: 'وسافن', hint: 'مصباح رمضان' },
  { word: 'خريطة', scrambled: 'خرطةي', hint: 'دليل الأماكن' },
  { word: 'متحف', scrambled: 'فحمت', hint: 'بيت الآثار' },
  { word: 'برتقال', scrambled: 'ربلقات', hint: 'فاكهة شتوية لونها اسمها' },
  { word: 'مسابقة', scrambled: 'سباةقم', hint: 'اختبار يفوز فيه الأسرع' },
  { word: 'هدية', scrambled: 'هدةي', hint: 'تُقدَّم في المناسبات' },
  { word: 'رحلة', scrambled: 'رةلح', hint: 'سفر قصير أو طويل' },
  { word: 'لغز', scrambled: 'زغل', hint: 'سؤال محيّر' },
  { word: 'ذهب', scrambled: 'هذب', hint: 'معدن أصفر ثمين' },
  { word: 'قصيدة', scrambled: 'يةدصق', hint: 'كلام موزون مقفّى' },
  { word: 'واحة', scrambled: 'وةاح', hint: 'خضرة وسط الصحراء' },
  { word: 'مرصد', scrambled: 'رصدم', hint: 'منه نراقب النجوم' },
  { word: 'سفينة', scrambled: 'فةنسي', hint: 'تمخر عباب البحر' },
] as const;

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

/** لوحة اختلاف الصور: كل مشهد نسختان متطابقتان عدا الفروق المحددة. */
export type SpotDifferenceDiff = { r: number; c: number; with: string };

export type SpotDifferenceScene = {
  id: string;
  title: string;
  rows: string[][];
  diffs: SpotDifferenceDiff[];
};

export function isInstantGameMode(value: string): value is InstantGameMode {
  return INSTANT_GAME_ORDER.includes(value as InstantGameMode);
}

export const SPOT_DIFFERENCE_SCENES: SpotDifferenceScene[] = [
  {
    id: 'beach',
    title: 'شاطئ الصيف',
    rows: [
      ['☀️', '☁️', '🌊', '⛵', '🌊', '☁️'],
      ['🌊', '🏖️', '🐚', '🦀', '🏖️', '🌊'],
      ['🌴', '🥥', '🌴', '🐚', '🌴', '🥥'],
      ['🏖️', '🏐', '🩴', '🐚', '🏖️', '🏐'],
      ['🌊', '🐠', '🌊', '🐚', '🌊', '🐟'],
      ['🐚', '🌊', '🏖️', '🌊', '🦀', '🌊'],
    ],
    diffs: [
      { r: 0, c: 0, with: '🌙' },
      { r: 1, c: 3, with: '🐙' },
      { r: 2, c: 1, with: '🌵' },
      { r: 4, c: 1, with: '🦈' },
      { r: 5, c: 0, with: '⭐' },
    ],
  },
  {
    id: 'kitchen',
    title: 'مطبخ الطاهي',
    rows: [
      ['🍳', '🥘', '🍲', '🥄', '🍽️', '🧂'],
      ['🧅', '🧄', '🥕', '🥒', '🍋', '🥬'],
      ['🔪', '🧊', '🥛', '☕', '🧃', '🍶'],
      ['🍚', '🍜', '🥟', '🍣', '🍤', '🥠'],
      ['🧁', '🍰', '🎂', '🍫', '🍪', '🍩'],
      ['🧹', '🧽', '🧼', '🧴', '🧺', '🚿'],
    ],
    diffs: [
      { r: 0, c: 2, with: '🥫' },
      { r: 2, c: 3, with: '🍵' },
      { r: 3, c: 0, with: '🍱' },
      { r: 4, c: 4, with: '🥠' },
      { r: 5, c: 5, with: '🧻' },
    ],
  },
  {
    id: 'garden',
    title: 'حديقة المنزل',
    rows: [
      ['🌳', '🐦', '🌳', '🌻', '🌳', '🦋'],
      ['🌻', '🌷', '🌹', '🌼', '🌸', '🌺'],
      ['🐝', '🐞', '🐜', '🐌', '🦋', '🐝'],
      ['🥕', '🍅', '🌽', '🥬', '🥒', '🍆'],
      ['🍄', '🌵', '🌿', '☘️', '🍃', '🌾'],
      ['🦔', '🐇', '🐿️', '🦔', '🐇', '🦡'],
    ],
    diffs: [
      { r: 0, c: 1, with: '🦉' },
      { r: 2, c: 5, with: '🦟' },
      { r: 3, c: 2, with: '🫑' },
      { r: 4, c: 4, with: '🍀' },
      { r: 5, c: 2, with: '🐭' },
    ],
  },
  {
    id: 'ramadan',
    title: 'مساء رمضان',
    rows: [
      ['🌙', '⭐', '🕌', '⭐', '🌙', '✨'],
      ['🏮', '🌙', '🏮', '🌙', '🏮', '🌙'],
      ['🧕', '🧕', '🧓', '🧕', '🧕', '🧓'],
      ['🍽️', '🫖', '☕', '🍵', '🫖', '🍽️'],
      ['🌙', '🏮', '🌙', '✨', '🌙', '🏮'],
      ['🧆', '🥙', '🫓', '🍢', '🍚', '🥤'],
    ],
    diffs: [
      { r: 0, c: 2, with: '🕋' },
      { r: 1, c: 4, with: '🕯️' },
      { r: 2, c: 2, with: '🧕' },
      { r: 3, c: 2, with: '🥛' },
      { r: 4, c: 3, with: '🌟' },
    ],
  },
  {
    id: 'cafe',
    title: 'قهوة الصباح',
    rows: [
      ['☕', '🥐', '🧇', '☕', '🥞', '🧇'],
      ['🧑‍🍳', '☕', '🥐', '🧑‍🍳', '☕', '🥐'],
      ['🍰', '🧁', '🍩', '🍪', '🎂', '🍫'],
      ['📰', '📖', '📰', '📖', '📰', '📖'],
      ['🪑', '🪟', '🪴', '🪑', '🪟', '🪴'],
      ['🍯', '🥛', '🍯', '🥛', '🍯', '🥛'],
    ],
    diffs: [
      { r: 0, c: 3, with: '🍵' },
      { r: 1, c: 4, with: '🧋' },
      { r: 2, c: 4, with: '🥮' },
      { r: 4, c: 2, with: '🌵' },
      { r: 5, c: 5, with: '🧃' },
    ],
  },
  {
    id: 'market',
    title: 'سوق الفواكه',
    rows: [
      ['🍎', '🍏', '🍎', '🍏', '🍎', '🍏'],
      ['🍌', '🍌', '🍇', '🍇', '🍉', '🍉'],
      ['🍓', '🍒', '🍑', '🥭', '🍍', '🥝'],
      ['🧺', '🧺', '🧺', '🧺', '🧺', '🧺'],
      ['🥕', '🧄', '🧅', '🥔', '🌽', '🌶️'],
      ['🍋', '🍊', '🍋', '🍊', '🍋', '🍊'],
    ],
    diffs: [
      { r: 0, c: 0, with: '🍅' },
      { r: 1, c: 4, with: '🍈' },
      { r: 2, c: 3, with: '🥑' },
      { r: 4, c: 5, with: '🥦' },
      { r: 5, c: 3, with: '🍑' },
    ],
  },
];

/** لوحة كلمات مفككة: صورة + تلميح + كلمات تُركّب من فقاعات الحروف. */
export type ScrambledWordsRound = {
  picture: string;
  hint: string;
  words: string[];
  letters: string[];
};

export const SCRAMBLED_WORDS_ROUNDS: ScrambledWordsRound[] = [
  {
    picture: '🌙⭐',
    hint: 'سماء الليل',
    words: ['قمر', 'نجوم', 'ظلام'],
    letters: ['ن', 'ظ', 'م', 'ق', 'ج', 'ا', 'ل', 'و', 'م', 'ر', 'م', 'س', 'ب', 'ه'],
  },
  {
    picture: '🌊🐠',
    hint: 'في قاع البحر',
    words: ['سمك', 'موج', 'شعاب'],
    letters: ['م', 'س', 'و', 'ك', 'ش', 'م', 'ج', 'ع', 'ا', 'ب', 'ن', 'ل', 'ر'],
  },
  {
    picture: '🌷🌹',
    hint: 'حديقة الزهور',
    words: ['ورد', 'عطر', 'نبات'],
    letters: ['و', 'ر', 'د', 'ع', 'ط', 'ر', 'ن', 'ب', 'ا', 'ت', 'س', 'م', 'ل'],
  },
  {
    picture: '🍎🍇',
    hint: 'سلطة فواكه',
    words: ['تفاح', 'عنب', 'مانجو'],
    letters: ['ت', 'ف', 'ا', 'ح', 'ع', 'ن', 'ب', 'م', 'ا', 'ن', 'ج', 'و', 'ر', 'س', 'ل'],
  },
  {
    picture: '📚✏️',
    hint: 'رفوف المكتبة',
    words: ['كتاب', 'قلم', 'ورق'],
    letters: ['ب', 'ك', 'ا', 'ت', 'ل', 'ق', 'م', 'و', 'ر', 'ق', 'س', 'ن', 'ه'],
  },
  {
    picture: '🐪🏜️',
    hint: 'رحلة الصحراء',
    words: ['جمل', 'رمل', 'ناقة'],
    letters: ['ج', 'م', 'ل', 'ر', 'م', 'ل', 'ن', 'ا', 'ق', 'ة', 'س', 'ب', 'و'],
  },
  {
    picture: '⚽🏆',
    hint: 'ملعب المباراة',
    words: ['كرة', 'فوز', 'لاعب'],
    letters: ['ك', 'ر', 'ة', 'ف', 'و', 'ز', 'ل', 'ا', 'ع', 'ب', 'س', 'م', 'ن'],
  },
  {
    picture: '🫖🍽️',
    hint: 'مجلس الضيافة',
    words: ['قهوة', 'تمر', 'ضيافة'],
    letters: ['ق', 'ه', 'و', 'ة', 'ت', 'م', 'ر', 'ض', 'ي', 'ا', 'ف', 'ة', 'ن', 'ل'],
  },
];

export {
  buildRiskDeck,
  RISK_PRESETS,
  type RiskCard,
  type RiskCardKind,
  type RiskDifficulty,
} from '@tahaddi/domain';

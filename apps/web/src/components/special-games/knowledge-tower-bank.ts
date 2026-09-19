export type TowerDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type KnowledgeTowerQuestion = {
  id: string;
  floor: number;
  category: string;
  difficulty: TowerDifficulty;
  prompt: string;
  options: [string, string, string, string];
  answerIndex: 0 | 1 | 2 | 3;
  explanation: string;
};

export const KNOWLEDGE_TOWER_FLOORS = 12;
export const KNOWLEDGE_TOWER_LIVES = 3;
export const KNOWLEDGE_TOWER_CHECKPOINTS = [4, 8, 12] as const;
export const KNOWLEDGE_TOWER_POINTS = [
  100, 200, 350, 500, 800, 1200, 1800, 2500, 4000, 6000, 8500, 12000,
] as const;

export function getTowerSeconds(floor: number) {
  if (floor >= 10) return 12;
  if (floor >= 7) return 16;
  if (floor >= 4) return 20;
  return 25;
}

export function getTowerDifficulty(floor: number): TowerDifficulty {
  if (floor >= 9) return 'HARD';
  if (floor >= 5) return 'MEDIUM';
  return 'EASY';
}

export const KNOWLEDGE_TOWER_BANK: KnowledgeTowerQuestion[] = [
  {
    id: 'kt-01',
    floor: 1,
    category: 'ثقافة إسلامية',
    difficulty: 'EASY',
    prompt: 'كم عدد أركان الإسلام؟',
    options: ['خمسة', 'أربعة', 'ستة', 'سبعة'],
    answerIndex: 0,
    explanation: 'أركان الإسلام خمسة: الشهادتان، الصلاة، الزكاة، الصوم، والحج.',
  },
  {
    id: 'kt-02',
    floor: 1,
    category: 'جغرافيا',
    difficulty: 'EASY',
    prompt: 'ما عاصمة المملكة العربية السعودية؟',
    options: ['الرياض', 'جدة', 'الدمام', 'مكة المكرمة'],
    answerIndex: 0,
    explanation: 'الرياض هي العاصمة الإدارية والسياسية للمملكة.',
  },
  {
    id: 'kt-03',
    floor: 2,
    category: 'علوم',
    difficulty: 'EASY',
    prompt: 'ما أكبر كوكب في المجموعة الشمسية؟',
    options: ['المشتري', 'زحل', 'الأرض', 'نبتون'],
    answerIndex: 0,
    explanation: 'المشتري هو الأضخم كتلة وحجماً في نظامنا الشمسي.',
  },
  {
    id: 'kt-04',
    floor: 2,
    category: 'رياضة',
    difficulty: 'EASY',
    prompt: 'كم لاعباً لكل فريق داخل ملعب كرة القدم؟',
    options: ['11', '9', '7', '12'],
    answerIndex: 0,
    explanation: 'يتكون فريق كرة القدم داخل الملعب من 11 لاعباً.',
  },
  {
    id: 'kt-05',
    floor: 3,
    category: 'أدب ولغة',
    difficulty: 'EASY',
    prompt: 'من فاز بجائزة نوبل في الأدب عام 1988؟',
    options: ['نجيب محفوظ', 'طه حسين', 'محمود درويش', 'أدونيس'],
    answerIndex: 0,
    explanation: 'نجيب محفوظ هو الأديب العربي الوحيد الحائز على نوبل حتى الآن.',
  },
  {
    id: 'kt-06',
    floor: 3,
    category: 'تاريخ السعودية',
    difficulty: 'EASY',
    prompt: 'في أي شهر يُحتفى باليوم الوطني السعودي؟',
    options: ['سبتمبر', 'فبراير', 'يناير', 'مارس'],
    answerIndex: 0,
    explanation: 'اليوم الوطني يوافق 23 سبتمبر من كل عام.',
  },
  {
    id: 'kt-07',
    floor: 4,
    category: 'تقنية',
    difficulty: 'EASY',
    prompt: 'ماذا يعني اختصار WWW في الإنترنت؟',
    options: ['الشبكة العنكبوتية العالمية', 'شبكة الحاسوب الواسعة', 'موقع الويب الداخلي', 'نظام التشغيل الشبكي'],
    answerIndex: 0,
    explanation: 'WWW اختصار World Wide Web أي الشبكة العنكبوتية العالمية.',
  },
  {
    id: 'kt-08',
    floor: 4,
    category: 'جغرافيا',
    difficulty: 'EASY',
    prompt: 'ما أكبر دولة عربية مساحة؟',
    options: ['الجزائر', 'السعودية', 'السودان', 'ليبيا'],
    answerIndex: 0,
    explanation: 'الجزائر هي الأكبر عربياً وإفريقياً من حيث المساحة.',
  },
  {
    id: 'kt-09',
    floor: 5,
    category: 'تاريخ',
    difficulty: 'MEDIUM',
    prompt: 'في أي عام استرد صلاح الدين القدس بعد حطين؟',
    options: ['1187م', '1099م', '1258م', '1453م'],
    answerIndex: 0,
    explanation: 'فتح صلاح الدين القدس عام 1187م بعد معركة حطين.',
  },
  {
    id: 'kt-10',
    floor: 5,
    category: 'علوم',
    difficulty: 'MEDIUM',
    prompt: 'ما الغاز الأكثر وفرة في الغلاف الجوي للأرض؟',
    options: ['النيتروجين', 'الأكسجين', 'ثاني أكسيد الكربون', 'الهيدروجين'],
    answerIndex: 0,
    explanation: 'يشكّل النيتروجين نحو 78% من الغلاف الجوي.',
  },
  {
    id: 'kt-11',
    floor: 6,
    category: 'ثقافة إسلامية',
    difficulty: 'MEDIUM',
    prompt: 'ما أول سورة نزلت آياتها الأولى على النبي ﷺ؟',
    options: ['العلق', 'الفاتحة', 'المدثر', 'القلم'],
    answerIndex: 0,
    explanation: 'نزلت الآيات الخمس الأولى من سورة العلق في غار حراء.',
  },
  {
    id: 'kt-12',
    floor: 6,
    category: 'رياضة',
    difficulty: 'MEDIUM',
    prompt: 'أي منتخب يحمل الرقم القياسي في ألقاب كأس العالم؟',
    options: ['البرازيل', 'ألمانيا', 'إيطاليا', 'الأرجنتين'],
    answerIndex: 0,
    explanation: 'البرازيل توجت خمس مرات بكأس العالم.',
  },
  {
    id: 'kt-13',
    floor: 7,
    category: 'جغرافيا',
    difficulty: 'MEDIUM',
    prompt: 'أي مضيق يفصل إفريقيا عن أوروبا ويربط المتوسط بالأطلسي؟',
    options: ['جبل طارق', 'هرمز', 'باب المندب', 'البوسفور'],
    answerIndex: 0,
    explanation: 'مضيق جبل طارق يقع بين المغرب وإسبانيا.',
  },
  {
    id: 'kt-14',
    floor: 7,
    category: 'أدب ولغة',
    difficulty: 'MEDIUM',
    prompt: 'من مؤلف خماسية «مدن الملح»؟',
    options: ['عبد الرحمن منيف', 'غسان كنفاني', 'الطيب صالح', 'إبراهيم نصر الله'],
    answerIndex: 0,
    explanation: 'عبد الرحمن منيف صاحب رواية مدن الملح.',
  },
  {
    id: 'kt-15',
    floor: 8,
    category: 'رياضيات',
    difficulty: 'MEDIUM',
    prompt: 'ما ناتج 12 × 15؟',
    options: ['180', '150', '165', '200'],
    answerIndex: 0,
    explanation: '12 × 15 = 180.',
  },
  {
    id: 'kt-16',
    floor: 8,
    category: 'تاريخ السعودية',
    difficulty: 'MEDIUM',
    prompt: 'في أي مدينة يقع حي الطريف المسجّل في التراث العالمي؟',
    options: ['الدرعية', 'العلا', 'جدة', 'الهفوف'],
    answerIndex: 0,
    explanation: 'حي الطريف في الدرعية عاصمة الدولة السعودية الأولى.',
  },
  {
    id: 'kt-17',
    floor: 9,
    category: 'تاريخ',
    difficulty: 'HARD',
    prompt: 'من مؤسس علم الاجتماع ومؤلف «المقدمة»؟',
    options: ['ابن خلدون', 'ابن رشد', 'الفارابي', 'ابن طفيل'],
    answerIndex: 0,
    explanation: 'عبد الرحمن بن خلدون أسس علم العمران في مقدمته.',
  },
  {
    id: 'kt-18',
    floor: 9,
    category: 'علوم',
    difficulty: 'HARD',
    prompt: 'كم عدد عظام جسم الإنسان البالغ تقريباً؟',
    options: ['206', '180', '250', '300'],
    answerIndex: 0,
    explanation: 'الهيكل العظمي للبالغ يحتوي على 206 عظمات.',
  },
  {
    id: 'kt-19',
    floor: 10,
    category: 'ثقافة إسلامية',
    difficulty: 'HARD',
    prompt: 'في أي سنة هجرية وقعت غزوة بدر؟',
    options: ['السنة الثانية', 'السنة الأولى', 'السنة الثالثة', 'السنة الخامسة'],
    answerIndex: 0,
    explanation: 'وقعت بدر في 17 رمضان من السنة الثانية للهجرة.',
  },
  {
    id: 'kt-20',
    floor: 10,
    category: 'تقنية',
    difficulty: 'HARD',
    prompt: 'أي بروتوكول يُستخدم لتشفير صفحات الويب؟',
    options: ['HTTPS', 'FTP', 'SMTP', 'ICMP'],
    answerIndex: 0,
    explanation: 'HTTPS يشفّر الاتصال عبر TLS فوق HTTP.',
  },
  {
    id: 'kt-21',
    floor: 11,
    category: 'رياضة',
    difficulty: 'HARD',
    prompt: 'ما النادي الأكثر تتويجاً بدوري أبطال آسيا؟',
    options: ['الهلال', 'الاتحاد', 'أوراوا', 'بوهانغ'],
    answerIndex: 0,
    explanation: 'الهلال السعودي هو الأكثر تتويجاً في تاريخ البطولة.',
  },
  {
    id: 'kt-22',
    floor: 11,
    category: 'جغرافيا',
    difficulty: 'HARD',
    prompt: 'أي بحر يفصل شبه الجزيرة العربية عن إفريقيا؟',
    options: ['البحر الأحمر', 'الخليج العربي', 'بحر العرب', 'البحر المتوسط'],
    answerIndex: 0,
    explanation: 'البحر الأحمر يفصل الجزيرة العربية عن الساحل الإفريقي.',
  },
  {
    id: 'kt-23',
    floor: 12,
    category: 'تاريخ السعودية',
    difficulty: 'HARD',
    prompt: 'في أي عام ميلادي أُعلن توحيد المملكة العربية السعودية؟',
    options: ['1932م', '1902م', '1926م', '1945م'],
    answerIndex: 0,
    explanation: 'صدر مرسوم التوحيد في 23 سبتمبر 1932م.',
  },
  {
    id: 'kt-24',
    floor: 12,
    category: 'أدب ولغة',
    difficulty: 'HARD',
    prompt: 'ما المعنى المعجمي الأقرب لكلمة «الجود»؟',
    options: ['الكرم والسخاء', 'الشجاعة', 'الحكمة', 'السرعة'],
    answerIndex: 0,
    explanation: 'الجود في لسان العرب هو الكرم وبذل ما ينبغي.',
  },
];

export function buildKnowledgeTowerRun(): KnowledgeTowerQuestion[] {
  const used = new Set<string>();
  const run: KnowledgeTowerQuestion[] = [];

  for (let floor = 1; floor <= KNOWLEDGE_TOWER_FLOORS; floor += 1) {
    const difficulty = getTowerDifficulty(floor);
    const pool = KNOWLEDGE_TOWER_BANK.filter(
      (question) => question.difficulty === difficulty && !used.has(question.id),
    );
    const fallback = KNOWLEDGE_TOWER_BANK.filter((question) => !used.has(question.id));
    const source = pool.length > 0 ? pool : fallback;
    const pick = source[Math.floor(Math.random() * source.length)] ?? KNOWLEDGE_TOWER_BANK[0];
    used.add(pick.id);
    run.push({ ...pick, floor });
  }

  return run;
}

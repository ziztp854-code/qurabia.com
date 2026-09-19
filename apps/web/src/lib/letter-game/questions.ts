import type { LetterQuestion, LetterQuestionCategory, LetterQuestionPattern } from './types';

export const BOARD_LETTERS = [
  'أ',
  'ب',
  'ت',
  'ث',
  'ج',
  'ح',
  'خ',
  'د',
  'ذ',
  'ر',
  'ز',
  'س',
  'ش',
  'ص',
  'ض',
  'ط',
  'ظ',
  'ع',
  'غ',
  'ف',
  'ق',
  'ك',
  'ل',
  'م',
  'ن',
] as const;

export const LETTER_QUESTIONS: readonly LetterQuestion[] = [
  {
    id: 'alif-lion',
    letter: 'أ',
    prompt: 'في السافانا الأفريقية، أيُّ حيوانٍ يتربّع على عرشها بلا منازع، وتخشاه كلُّ الوحوش؟',
    answer: 'أسد',
    category: 'animals',
    pattern: 'scenario',
  },
  {
    id: 'baa-bahr',
    letter: 'ب',
    prompt: 'ما المسطّح المائي الأكبر على وجه الأرض الذي تَعبره السفن، ويَفصل بين القارّات أو يربطها؟',
    answer: 'بحر',
    category: 'science',
    pattern: 'definition',
  },
  {
    id: 'taa-apple',
    letter: 'ت',
    prompt: 'ما الفاكهة المستديرة التي رَواها المثل: «تفاحةٌ في اليوم تُبعد الطبيب عنك»؟',
    answer: 'تفاح',
    category: 'plants',
    pattern: 'definition',
  },
  {
    id: 'thaa-fox',
    letter: 'ث',
    prompt: 'بين الذئب والكلب، أيُّ حيوانٍ يُوصف بالمكر والدهاء، ويَتْرُك ذيلَه الكثيف يزيّن خطواته؟',
    answer: 'ثعلب',
    category: 'animals',
    pattern: 'comparison',
  },
  {
    id: 'jeem-camel',
    letter: 'ج',
    prompt: 'في قلب الصحراء، ما الحيوان الصبور الذي يعبر الرمال بلا عطش لأيام، وتُخزِّن سنامه الدهون؟',
    answer: 'جمل',
    category: 'animals',
    pattern: 'inference',
  },
  {
    id: 'haa-milk',
    letter: 'ح',
    prompt: 'ما السائل الأبيض الذي تفرزه الأنعام، ويُعدُّ أوّلَ غذاءٍ للطفل بعد ولادته؟',
    answer: 'حليب',
    category: 'food-drink',
    pattern: 'definition',
  },
  {
    id: 'khaa-cucumber',
    letter: 'خ',
    prompt: 'في طبق السلطة، أيُّ خضرةٍ خضراء ذات قشرةٍ مُبردلة ومنعشة، تَروي العطش في الصيف؟',
    answer: 'خيار',
    category: 'plants',
    pattern: 'scenario',
  },
  {
    id: 'dal-dub',
    letter: 'د',
    prompt: 'ما الحيوان الضخم القويّ الذي يَعيش في الغابات الباردة، ويشتهر بحبّه الشديد للعسل؟',
    answer: 'دب',
    category: 'animals',
    pattern: 'definition',
  },
  {
    id: 'thal-gold',
    letter: 'ذ',
    prompt: 'بين الفضة والبلاتين، أيُّ معدنٍ أصفر لامع خَتَمَت به العملات منذ آلاف السنين، ورمزٌ للثروة؟',
    answer: 'ذهب',
    category: 'science',
    pattern: 'comparison',
  },
  {
    id: 'raa-pomegranate',
    letter: 'ر',
    prompt: 'ما الفاكهة ذات الحبوب الياقوتية التي ذُكِرت في القرآن، ويُتبارَك بها العُرسان في بعض البلاد؟',
    answer: 'رمان',
    category: 'plants',
    pattern: 'curiosity',
  },
  {
    id: 'zay-saturn',
    letter: 'ز',
    prompt: 'ما الكوكب الغازي العملاق الذي يَتَوّج بحلقاتٍ بديعة من الجليد والصخور؟',
    answer: 'زحل',
    category: 'space',
    pattern: 'descriptive',
  },
  {
    id: 'seen-fish',
    letter: 'س',
    prompt: 'في أعماق البحار، ما الكائن البارد الدم الذي يتنفّس بواسطة الخياشيم، ولا يقدر على العيش خارج الماء؟',
    answer: 'سمكة',
    category: 'marine-life',
    pattern: 'inference',
  },
  {
    id: 'sheen-sun',
    letter: 'ش',
    prompt: 'في قلب مجموعتنا الشمسية، ما النجم الذي يمنح الأرض الضياء والنور والدفءَ كلَّ صباح؟',
    answer: 'شمس',
    category: 'space',
    pattern: 'scenario',
  },
  {
    id: 'sad-falcon',
    letter: 'ص',
    prompt: 'ما الطائر الجارح حادُّ البصر الذي يتفاخر به أبناءُ الجزيرة رمزاً للأصالة والشموخ؟',
    answer: 'صقر',
    category: 'birds',
    pattern: 'definition',
  },
  {
    id: 'dad-frog',
    letter: 'ض',
    prompt: 'حول البرك والمستنقعات، من هو الحيوان البرمائي الذي يقفز بقدميه القويتين، ويُصدِر نقيقاً مميّزاً؟',
    answer: 'ضفدع',
    category: 'animals',
    pattern: 'scenario',
  },
  {
    id: 'taa-taoos',
    letter: 'ط',
    prompt: 'ما الطائر الذي يَفْرُد ذيلَه المُذهَّل بريش قوس قزح في موسم التزاوج، في لوحة فنية لا تنسى؟',
    answer: 'طاووس',
    category: 'birds',
    pattern: 'descriptive',
  },
  {
    id: 'zaa-gazelle',
    letter: 'ظ',
    prompt: 'في البريّة العربية، أيُّ حيوانٍ رشيق القوام يُضرَب به المثل في سَعة العينين ونَقائِهما؟',
    answer: 'ظبي',
    category: 'animals',
    pattern: 'inference',
  },
  {
    id: 'ain-enab',
    letter: 'ع',
    prompt: 'ما الفاكهة العُنقودية التي تُستخدم في صناعة النبيذ والخلّ والعصائر اللذيذة، وتُعدّ من أقدم الثمار المزروعة؟',
    answer: 'عنب',
    category: 'plants',
    pattern: 'definition',
  },
  {
    id: 'ghain-gazelle',
    letter: 'غ',
    prompt: 'ما الحيوان البريّ سريعُ العدو الذي يُضرَب به المثل في الرشاقة والرقة وجمال المُقلة؟',
    answer: 'غزال',
    category: 'animals',
    pattern: 'definition',
  },
  {
    id: 'faa-france',
    letter: 'ف',
    prompt: 'في أوروبا الغربية، أيُّ دولةٍ يحتضن «برج إيفل» سماءها، وعاصمتُها باريس مدينةُ الأنوار؟',
    answer: 'فرنسا',
    category: 'geography',
    pattern: 'inference',
  },
  {
    id: 'qaf-moon',
    letter: 'ق',
    prompt: 'ما الجرم السماوي الذي يُضيء سماءنا ليلاً بأطواره المختلفة، ويَدور حول الأرض تابعاً لها؟',
    answer: 'قمر',
    category: 'space',
    pattern: 'curiosity',
  },
  {
    id: 'kaf-dog',
    letter: 'ك',
    prompt: 'ما الحيوان الأليف الوفيُّ الذي يُستخدم في الحراسة ورعي الأغنام وصيد الطرائد؟',
    answer: 'كلب',
    category: 'animals',
    pattern: 'descriptive',
  },
  {
    id: 'lam-lemon',
    letter: 'ل',
    prompt: 'ما الثمرة الحمضية الصفراء الحامضة المذاق، الغنية بفيتامين C، التي تُنكِّه العصائر وأطباق الطعام؟',
    answer: 'ليمون',
    category: 'plants',
    pattern: 'definition',
  },
  {
    id: 'meem-mars',
    letter: 'م',
    prompt: 'في الليالي الصافية، أيُّ كوكب يظهر بلونٍ أحمر مائلٍ إلى البرتقالي، ويأتي رابعاً في بُعده عن الشمس؟',
    answer: 'مريخ',
    category: 'space',
    pattern: 'scenario',
  },
  {
    id: 'noon-palm',
    letter: 'ن',
    prompt: 'ما الشجرة المباركة في الجزيرة العربية التي تُعدُّ مصدر التمر، وظلالاً ووقوداً للوادي؟',
    answer: 'نخلة',
    category: 'plants',
    pattern: 'descriptive',
  },
];

export const LETTER_QUESTION_CATEGORIES: readonly LetterQuestionCategory[] = [
  'animals',
  'plants',
  'geography',
  'space',
  'science',
  'food-drink',
  'marine-life',
  'birds',
];

export const LETTER_QUESTION_PATTERNS: readonly LetterQuestionPattern[] = [
  'descriptive',
  'scenario',
  'comparison',
  'definition',
  'curiosity',
  'inference',
];

export const PATTERN_THRESHOLD = 0.5;

export function getQuestionForLetter(
  letter: string,
  questions: readonly LetterQuestion[] = LETTER_QUESTIONS,
): LetterQuestion {
  const question = questions.find((candidate) => candidate.letter === letter);
  if (!question) throw new Error(`لا يوجد سؤال للحرف ${letter}.`);
  return question;
}

export interface LetterQuestionStats {
  total: number;
  byCategory: Record<LetterQuestionCategory, number>;
  byPattern: Record<LetterQuestionPattern, number>;
  categoryShare: Record<LetterQuestionCategory, number>;
  patternShare: Record<LetterQuestionPattern, number>;
}

function emptyCategoryCounts(): Record<LetterQuestionCategory, number> {
  return LETTER_QUESTION_CATEGORIES.reduce(
    (acc, category) => ({ ...acc, [category]: 0 }),
    {} as Record<LetterQuestionCategory, number>,
  );
}

function emptyPatternCounts(): Record<LetterQuestionPattern, number> {
  return LETTER_QUESTION_PATTERNS.reduce(
    (acc, pattern) => ({ ...acc, [pattern]: 0 }),
    {} as Record<LetterQuestionPattern, number>,
  );
}

export function getLetterQuestionStats(): LetterQuestionStats {
  const total = LETTER_QUESTIONS.length;
  const byCategory = emptyCategoryCounts();
  const byPattern = emptyPatternCounts();

  for (const question of LETTER_QUESTIONS) {
    byCategory[question.category] += 1;
    byPattern[question.pattern] += 1;
  }

  const categoryShare = LETTER_QUESTION_CATEGORIES.reduce(
    (acc, category) => ({ ...acc, [category]: total ? byCategory[category] / total : 0 }),
    {} as Record<LetterQuestionCategory, number>,
  );
  const patternShare = LETTER_QUESTION_PATTERNS.reduce(
    (acc, pattern) => ({ ...acc, [pattern]: total ? byPattern[pattern] / total : 0 }),
    {} as Record<LetterQuestionPattern, number>,
  );

  return { total, byCategory, byPattern, categoryShare, patternShare };
}

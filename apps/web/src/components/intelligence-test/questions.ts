export const LEVELS = ['سهل', 'متوسط', 'متقدم'] as const;
export const SKILLS = ['الاستدلال العددي', 'المنطق', 'الأنماط'] as const;
export type Skill = (typeof SKILLS)[number];
export type Question = {
  prompt: string;
  sequence?: string;
  options: readonly string[];
  answer: number;
  explanation: string;
  level: 1 | 2 | 3;
  skill: Skill;
};
export const DISCLAIMER =
  'هذه لعبة تدريبية ترفيهية تقيس أداءك في أسئلتها فقط؛ ليست اختبار IQ معياريًا أو تقييمًا نفسيًا، ولا تحدد ذكاءك العام.';
export const QUESTIONS: readonly Question[] = [
  {
    level: 1,
    skill: 'الاستدلال العددي',
    prompt: 'ما العدد التالي؟',
    sequence: '2, 4, 6, 8, ?',
    options: ['9', '10', '12', '16'],
    answer: 1,
    explanation: 'نضيف 2 إلى كل عدد؛ إذن التالي 10.',
  },
  {
    level: 1,
    skill: 'المنطق',
    prompt: 'كل المربعات أشكال هندسية. هذا الشكل مربع. ماذا نستنتج؟',
    options: ['هو دائرة', 'ليس شكلًا هندسيًا', 'هو شكل هندسي', 'لا يمكن الاستنتاج'],
    answer: 2,
    explanation: 'بما أن كل مربع شكل هندسي، فهذا المربع شكل هندسي أيضًا.',
  },
  {
    level: 1,
    skill: 'الأنماط',
    prompt: 'ما الرمز الذي يكمل النمط؟',
    sequence: '● ▲ ● ▲ ● ?',
    options: ['▲', '●', '■', '◆'],
    answer: 0,
    explanation: 'يتناوب النمط بين دائرة ومثلث؛ الرمز التالي مثلث.',
  },
  {
    level: 1,
    skill: 'الاستدلال العددي',
    prompt: 'معك 3 علب، في كل علبة 4 أقلام. كم قلمًا معك؟',
    options: ['7', '9', '16', '12'],
    answer: 3,
    explanation: '3 علب × 4 أقلام = 12 قلمًا.',
  },
  {
    level: 1,
    skill: 'المنطق',
    prompt: 'سارة أطول من ريم، وريم أطول من هدى. من الأقصر؟',
    options: ['هدى', 'سارة', 'ريم', 'كلهن بالطول نفسه'],
    answer: 0,
    explanation: 'الترتيب من الأطول إلى الأقصر: سارة، ثم ريم، ثم هدى.',
  },
  {
    level: 1,
    skill: 'الأنماط',
    prompt: 'ما المجموعة التالية؟',
    sequence: '■, ■■, ■■■, ?',
    options: ['■', '■■', '■■■■', '■■■■■'],
    answer: 2,
    explanation: 'نضيف مربعًا واحدًا في كل خطوة؛ المجموعة التالية أربعة مربعات.',
  },
  {
    level: 2,
    skill: 'الاستدلال العددي',
    prompt: 'ما العدد التالي؟',
    sequence: '3, 6, 12, 24, ?',
    options: ['30', '36', '48', '60'],
    answer: 2,
    explanation: 'نضاعف كل عدد؛ 24 × 2 = 48.',
  },
  {
    level: 2,
    skill: 'المنطق',
    prompt: 'لا يوجد طائر من الثدييات. الخفاش من الثدييات. ما الاستنتاج الصحيح؟',
    options: ['الخفاش طائر', 'الخفاش ليس طائرًا', 'كل الثدييات تطير', 'كل الطيور خفافيش'],
    answer: 1,
    explanation: 'المجموعتان منفصلتان، لذا لا يمكن أن يكون الخفاش طائرًا.',
  },
  {
    level: 2,
    skill: 'الأنماط',
    prompt: 'ما الاتجاه التالي؟',
    sequence: '↑ → ↓ ← ↑ ?',
    options: ['↑', '↓', '←', '→'],
    answer: 3,
    explanation: 'يدور السهم ربع دورة مع عقارب الساعة؛ بعد الأعلى يأتي اليمين.',
  },
  {
    level: 2,
    skill: 'الاستدلال العددي',
    prompt: 'ما العدد التالي؟',
    sequence: '1, 4, 9, 16, ?',
    options: ['25', '20', '24', '36'],
    answer: 0,
    explanation: 'هذه مربعات الأعداد: 1، 2، 3، 4؛ مربع 5 يساوي 25.',
  },
  {
    level: 2,
    skill: 'المنطق',
    prompt: 'وصل خالد قبل عمر، ووصل عمر قبل علي. من وصل أولًا؟',
    options: ['عمر', 'علي', 'خالد', 'لا يمكن تحديده'],
    answer: 2,
    explanation: 'خالد سبق عمر الذي سبق علي، إذن خالد وصل أولًا.',
  },
  {
    level: 2,
    skill: 'الأنماط',
    prompt: 'ما الرمز التالي في المجموعة المتكررة؟',
    sequence: '● ● ▲ ● ● ▲ ● ● ?',
    options: ['●', '▲', '■', '◆'],
    answer: 1,
    explanation: 'تتكرر مجموعة من دائرتين ثم مثلث؛ الرمز الناقص مثلث.',
  },
  {
    level: 3,
    skill: 'الاستدلال العددي',
    prompt: 'ما العدد التالي؟',
    sequence: '2, 6, 12, 20, 30, ?',
    options: ['36', '40', '42', '44'],
    answer: 2,
    explanation: 'الفروق 4، 6، 8، 10، ثم 12؛ لذلك 30 + 12 = 42.',
  },
  {
    level: 3,
    skill: 'المنطق',
    prompt: 'بعض القرّاء رسّامون. كل الرسّامين مبدعون. ما الاستنتاج المؤكد؟',
    options: ['كل القراء مبدعون', 'لا قارئ مبدع', 'كل المبدعين قراء', 'بعض القراء مبدعون'],
    answer: 3,
    explanation: 'القراء الذين هم رسامون مبدعون بالضرورة؛ لا نعرف ذلك عن جميع القراء.',
  },
  {
    level: 3,
    skill: 'الأنماط',
    prompt: 'ما المجموعة التالية إذا زاد عدد الدوائر بواحد في كل مجموعة؟',
    sequence: '▲●, ▲●●, ▲●●●, ?',
    options: ['▲●●●●', '▲▲●●', '●●●●', '▲●●●'],
    answer: 0,
    explanation: 'يبقى المثلث ثابتًا، ويزيد عدد الدوائر من ثلاث إلى أربع.',
  },
  {
    level: 3,
    skill: 'الاستدلال العددي',
    prompt: 'تنتج 5 آلات 5 قطع في 5 دقائق. بنفس المعدل، كم دقيقة تحتاج 20 آلة لإنتاج 20 قطعة؟',
    options: ['20 دقيقة', '5 دقائق', '10 دقائق', 'دقيقة واحدة'],
    answer: 1,
    explanation: 'تنتج كل آلة قطعة في 5 دقائق؛ تعمل 20 آلة بالتوازي فتنتج 20 قطعة في 5 دقائق.',
  },
  {
    level: 3,
    skill: 'المنطق',
    prompt: 'إذا أمطرت ابتلّت الأرض. الأرض لم تبتلّ. بافتراض صحة القاعدة دائمًا، ماذا نستنتج؟',
    options: ['أمطرت', 'ستُمطر غدًا', 'لم تُمطر', 'الأرض ساخنة'],
    answer: 2,
    explanation: 'لو أمطرت لابتلت الأرض وفق القاعدة؛ عدم ابتلالها يعني أنه لم يمطر.',
  },
  {
    level: 3,
    skill: 'الأنماط',
    prompt: 'اختر العدد الناقص؛ مجموع كل صف يساوي 15.',
    sequence: '8  1  6\n3  5  7\n4  9  ?',
    options: ['1', '3', '5', '2'],
    answer: 3,
    explanation: '4 + 9 = 13؛ نضيف 2 ليصبح مجموع الصف 15.',
  },
];

export function performanceLevel(score: number) {
  if (score >= 80)
    return {
      label: 'أداء متميز',
      advice: 'أظهرت إتقانًا جيدًا لهذه الأسئلة. جرّب مسائل جديدة وأكثر تنوعًا لتوسيع مهاراتك.',
    };
  if (score >= 60)
    return {
      label: 'أداء قوي',
      advice: 'لديك أساس جيد في هذه التحديات. راجع تفسيرات الأسئلة وتمرّن على المهارة الأقل نتيجة.',
    };
  if (score >= 40)
    return {
      label: 'أداء واعد',
      advice: 'خذ وقتك في اكتشاف القاعدة قبل الإجابة، وابدأ بالمسائل البسيطة ثم زد الصعوبة.',
    };
  return {
    label: 'بداية للتدرّب',
    advice: 'هذه نقطة بداية في اللعبة. جرّب الحل على ورقة وراجع التفسيرات خطوة بخطوة.',
  };
}

export function calculateResult(answers: readonly (number | null)[]) {
  const correct = QUESTIONS.filter((q, i) => answers[i] === q.answer);
  const maximum = QUESTIONS.reduce((sum, q) => sum + q.level, 0);
  const points = correct.reduce((sum, q) => sum + q.level, 0);
  const score = Math.round((points / maximum) * 100);
  return {
    correct: correct.length,
    points,
    maximum,
    score,
    ...performanceLevel(score),
    skills: SKILLS.map((skill) => ({
      skill,
      correct: correct.filter((q) => q.skill === skill).length,
      total: QUESTIONS.filter((q) => q.skill === skill).length,
    })),
    levels: LEVELS.map((label, i) => ({
      label,
      correct: correct.filter((q) => q.level === i + 1).length,
      total: QUESTIONS.filter((q) => q.level === i + 1).length,
    })),
  };
}

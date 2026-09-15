export type QuoteQuestion = {
  id: string;
  /** البيت أو الحكمة المطلوب معرفة قائلها. */
  quote: string;
  /** أسماء المرشحين الأربعة. */
  options: [string, string, string, string];
  /** موضع الإجابة الصحيحة ضمن options. */
  answerIndex: number;
  /** وسم قصير يظهر أعلى السؤال (نوع القول). */
  category: string;
  /** جملة تعريفية تُعرض بعد الكشف. */
  explanation: string;
};

export const QUOTE_MASTER_ROUNDS = 12;
export const QUOTE_MASTER_LIVES = 3;
export const QUOTE_MASTER_SECONDS = 20;
/** النقاط الأساسية لكل إجابة صحيحة قبل مضاعف السلسلة. */
export const QUOTE_MASTER_BASE_POINTS = 100;
/** حد أقصى لمضاعف السلسلة كي لا تنفجر النقاط. */
export const QUOTE_MASTER_MAX_COMBO = 5;
/** مكافأة السرعة إذا أجبت والوقت المتبقي ضمن هذا الحد. */
export const QUOTE_MASTER_SPEED_BONUS = 50;
export const QUOTE_MASTER_SPEED_THRESHOLD = 12;

const BANK: QuoteQuestion[] = [
  {
    id: 'mutanabbi-khayl',
    quote: 'الخيلُ والليلُ والبيداءُ تعرفُني\nوالسيفُ والرمحُ والقرطاسُ والقلمُ',
    options: ['المتنبي', 'أبو تمام', 'البحتري', 'جرير'],
    answerIndex: 0,
    category: 'بيت شعر',
    explanation: 'من فخريات أبي الطيب المتنبي، أشهر شعراء العربية.',
  },
  {
    id: 'mutanabbi-azm',
    quote: 'على قدرِ أهلِ العزمِ تأتي العزائمُ\nوتأتي على قدرِ الكرامِ المكارمُ',
    options: ['الفرزدق', 'المتنبي', 'امرؤ القيس', 'أبو نواس'],
    answerIndex: 1,
    category: 'بيت شعر',
    explanation: 'مطلع قصيدة المتنبي في مدح سيف الدولة الحمداني.',
  },
  {
    id: 'shafii-dae',
    quote: 'دعِ الأيامَ تفعلُ ما تشاءُ\nوطِبْ نفساً إذا حكمَ القضاءُ',
    options: ['الإمام الشافعي', 'ابن الرومي', 'المعري', 'الخنساء'],
    answerIndex: 0,
    category: 'حكمة شعرية',
    explanation: 'من حكميات الإمام الشافعي في الرضا بالقضاء.',
  },
  {
    id: 'shafii-ilm',
    quote: 'ومن لم يذُقْ مُرَّ التعلّمِ ساعةً\nتجرّعَ ذُلَّ الجهلِ طولَ حياتِه',
    options: ['حافظ إبراهيم', 'الإمام الشافعي', 'أبو العلاء المعري', 'البارودي'],
    answerIndex: 1,
    category: 'حكمة شعرية',
    explanation: 'بيت منسوب للإمام الشافعي في فضل طلب العلم.',
  },
  {
    id: 'imru-qifa',
    quote: 'قِفا نبكِ من ذكرى حبيبٍ ومنزلِ\nبسِقْطِ اللِّوى بين الدَّخولِ فحوملِ',
    options: ['عنترة العبسي', 'زهير بن أبي سلمى', 'امرؤ القيس', 'طرفة بن العبد'],
    answerIndex: 2,
    category: 'مُعلّقة',
    explanation: 'مطلع معلّقة امرئ القيس، أشهر مطالع الشعر الجاهلي.',
  },
  {
    id: 'shawqi-muallim',
    quote: 'قُمْ للمعلّمِ وفِّهِ التبجيلا\nكادَ المعلّمُ أن يكونَ رسولا',
    options: ['أحمد شوقي', 'إيليا أبو ماضي', 'نزار قباني', 'محمود درويش'],
    answerIndex: 0,
    category: 'بيت شعر',
    explanation: 'لأمير الشعراء أحمد شوقي في تكريم المعلّم.',
  },
  {
    id: 'shawqi-akhlaq',
    quote: 'وإنّما الأممُ الأخلاقُ ما بقيَتْ\nفإنْ همُ ذهبتْ أخلاقُهم ذهبوا',
    options: ['المتنبي', 'أحمد شوقي', 'حافظ إبراهيم', 'أبو تمام'],
    answerIndex: 1,
    category: 'بيت شعر',
    explanation: 'من قصيدة أحمد شوقي في مكانة الأخلاق.',
  },
  {
    id: 'shabbi-shaab',
    quote: 'إذا الشعبُ يوماً أرادَ الحياةَ\nفلا بُدَّ أن يستجيبَ القدرْ',
    options: ['أبو القاسم الشابي', 'الجواهري', 'بدر شاكر السياب', 'نزار قباني'],
    answerIndex: 0,
    category: 'بيت شعر',
    explanation: 'مطلع «إرادة الحياة» لأبي القاسم الشابي.',
  },
  {
    id: 'shawqi-tamanni',
    quote: 'وما نيلُ المطالبِ بالتمنّي\nولكن تُؤخذُ الدنيا غِلابا',
    options: ['الفرزدق', 'أحمد شوقي', 'المعري', 'ابن زيدون'],
    answerIndex: 1,
    category: 'حكمة شعرية',
    explanation: 'لأحمد شوقي في الحثّ على الجدّ والسعي.',
  },
  {
    id: 'mutanabbi-majd',
    quote: 'لا تحسَبَنّ المجدَ تمراً أنت آكِلُه\nلن تبلغَ المجدَ حتى تلعَقَ الصبِرا',
    options: ['أبو فراس الحمداني', 'المتنبي', 'البحتري', 'الأعشى'],
    answerIndex: 1,
    category: 'حكمة شعرية',
    explanation: 'من حكم المتنبي في أن المجد ثمرة الصبر.',
  },
  {
    id: 'abufiras-dam',
    quote: 'أراكَ عصيَّ الدمعِ شيمتُك الصبرُ\nأما للهوى نهيٌ عليك ولا أمرُ',
    options: ['أبو فراس الحمداني', 'ابن زيدون', 'جرير', 'عمر بن أبي ربيعة'],
    answerIndex: 0,
    category: 'بيت شعر',
    explanation: 'مطلع رائية أبي فراس الحمداني التي نظمها في الأسر.',
  },
  {
    id: 'maari-ghayr',
    quote: 'وإني وإن كنتُ الأخيرَ زمانُه\nلآتٍ بما لم تستطِعْه الأوائلُ',
    options: ['أبو العلاء المعري', 'المتنبي', 'أبو تمام', 'ابن الرومي'],
    answerIndex: 0,
    category: 'بيت شعر',
    explanation: 'من مفاخر أبي العلاء المعري بنفسه وشعره.',
  },
  {
    id: 'abutammam-sayf',
    quote: 'السيفُ أصدقُ إنباءً من الكتبِ\nفي حدِّهِ الحدُّ بين الجِدِّ واللعبِ',
    options: ['البحتري', 'أبو تمام', 'المتنبي', 'النابغة الذبياني'],
    answerIndex: 1,
    category: 'بيت شعر',
    explanation: 'مطلع قصيدة أبي تمام في فتح عمّورية.',
  },
  {
    id: 'zuhayr-hilm',
    quote: 'ومن لم يُصانِعْ في أمورٍ كثيرةٍ\nيُضرَّسْ بأنيابٍ ويوطأْ بمنسِمِ',
    options: ['عنترة العبسي', 'زهير بن أبي سلمى', 'لبيد بن ربيعة', 'الأعشى'],
    answerIndex: 1,
    category: 'مُعلّقة',
    explanation: 'من حكم زهير بن أبي سلمى في معلّقته الشهيرة.',
  },
];

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** يبني جولة من أسئلة عشوائية مع خلط ترتيب الخيارات مع تثبيت الإجابة. */
export function buildQuoteMasterRun(count = QUOTE_MASTER_ROUNDS): QuoteQuestion[] {
  return shuffle(BANK)
    .slice(0, Math.min(count, BANK.length))
    .map((question) => {
      const answer = question.options[question.answerIndex];
      const shuffledOptions = shuffle(question.options);
      const answerIndex = shuffledOptions.indexOf(answer);
      return {
        ...question,
        options: shuffledOptions as [string, string, string, string],
        answerIndex,
      };
    });
}

/** يحسب مضاعف السلسلة الحالي (يبدأ من 1 ويصعد مع كل إجابة صحيحة). */
export function comboMultiplier(streak: number): number {
  return Math.min(1 + streak, QUOTE_MASTER_MAX_COMBO);
}

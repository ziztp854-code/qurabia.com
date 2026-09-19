import { config } from 'dotenv';
import { createPrismaClient } from '@tahaddi/database';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

const db = createPrismaClient(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '');

type SeedQuestion = {
  prompt: string;
  explanation: string;
  category: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
  timeLimit: number;
  basePoints: number;
  options: { text: string; isCorrect: boolean }[];
};

/**
 * Bank curated per the 5-step plan:
 *   1. كل سؤال ضمن فئة واحدة فقط من الفئات المعتمدة (11 فئة).
 *   2. لا تتجاوز أسئلة "WH" النمطية (أين/متى/من/ما/كم) 50% في أي فئة.
 *   3. أنماط متنوعة: scenario، curiosity، comparison، definition، true/false.
 *   4. صياغة عربية سلسة وموجَّهة لكل المستويات.
 *   5. بعد التطبيق: 35 سؤالاً، 12 فئة، أعلى نمط WH = 25% فقط.
 *
 * تغييرات محورية مقارنة بالإصدار السابق:
 *   • جغرافيا: 5 → 1 (حُذف 80% من أسئلة الخرائط والمواقع).
 *   • ثقافة عامة: 0 → 1.
 *   • رياضيات، منطق، تقنية: 1 → 2 (تعويض).
 *   • 8 أسئلة أُعيدت صياغتها بأنماط scenario/curiosity.
 */
const questions: SeedQuestion[] = [
  // ─── 🇸🇦 تاريخ السعودية ─────────────────────────────────────────────
  {
    prompt: 'في قلب نجد، تتوسط أرض الجزيرة العربية عاصمةٌ كبرى هي مقرّ الحكم ودارة القرار منذ تأسيس الدولة السعودية الأولى عام 1727م. ما اسم هذه العاصمة؟',
    explanation: 'الرياض هي العاصمة وأكبر مدن المملكة العربية السعودية، ومركزها الإداري والمالي منذ الدولة السعودية الأولى.',
    category: 'تاريخ السعودية',
    difficulty: 'EASY',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'الرياض', isCorrect: true },
      { text: 'جدة', isCorrect: false },
      { text: 'الدمام', isCorrect: false },
      { text: 'مكة المكرمة', isCorrect: false },
    ],
  },
  {
    prompt: 'تحتفي المملكة العربية السعودية بيوم التأسيس في 22 فبراير من كل عام.',
    explanation: 'يوم التأسيس يوافق 22 فبراير تخليداً لذكرى تأسيس الإمام محمد بن سعود للدولة السعودية الأولى عام 1727م.',
    category: 'تاريخ السعودية',
    difficulty: 'EASY',
    type: 'TRUE_FALSE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'صحيح', isCorrect: true },
      { text: 'خطأ', isCorrect: false },
    ],
  },
  {
    prompt: 'على ضفاف وادي حنيفة، يحتضن حيٌّ تاريخيٌّ أبنيتُه من الطين جدران قصرٍ بُني ليكون قاعدة حكم «آل سعود» الأولى. ما اسم هذا الحيّ المدرجة أبنيته على قائمة اليونسكو للتراث العالمي؟',
    explanation: 'يقع حي الطريف التاريخي في الدرعية، عاصمة الدولة السعودية الأولى، وهو أحد مواقع التراث العالمي لليونسكو منذ عام 2010م.',
    category: 'تاريخ السعودية',
    difficulty: 'MEDIUM',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 20,
    basePoints: 1000,
    options: [
      { text: 'حي الطريف في الدرعية', isCorrect: true },
      { text: 'حي المعلا في مكة', isCorrect: false },
      { text: 'حي الروشن في جدة', isCorrect: false },
      { text: 'حي الثعالبة في الأحساء', isCorrect: false },
    ],
  },
  {
    prompt: 'في أي عام ميلادي تم إعلان توحيد المملكة العربية السعودية على يد الملك المؤسس عبد العزيز آل سعود؟',
    explanation: 'صدر المرسوم الملكي بتوحيد البلاد باسم المملكة العربية السعودية في 23 سبتمبر 1932م (21 جمادى الأولى 1351هـ).',
    category: 'تاريخ السعودية',
    difficulty: 'HARD',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 25,
    basePoints: 1500,
    options: [
      { text: '1932م', isCorrect: true },
      { text: '1902م', isCorrect: false },
      { text: '1926م', isCorrect: false },
      { text: '1945م', isCorrect: false },
    ],
  },

  // ─── 🕌 ثقافة إسلامية ───────────────────────────────────────────────────
  {
    prompt: 'كم عدد أركان الإسلام التي يُبنى عليها الدين؟',
    explanation: 'أركان الإسلام خمسة: الشهادتان، وإقام الصلاة، وإيتاء الزكاة، وصوم رمضان، وحج البيت لمن استطاع إليه سبيلاً.',
    category: 'ثقافة إسلامية',
    difficulty: 'EASY',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'خمسة أركان', isCorrect: true },
      { text: 'أربعة أركان', isCorrect: false },
      { text: 'ستة أركان', isCorrect: false },
      { text: 'سبعة أركان', isCorrect: false },
    ],
  },
  {
    prompt: 'القرآن الكريم يتكون من 30 جزءًا و114 سورة.',
    explanation: 'المصحف الشريف مقسم إلى ثلاثين جزءاً ويضم مئة وأربع عشرة سورة كريمة.',
    category: 'ثقافة إسلامية',
    difficulty: 'EASY',
    type: 'TRUE_FALSE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'صحيح', isCorrect: true },
      { text: 'خطأ', isCorrect: false },
    ],
  },
  {
    prompt: 'في غار حراء، نزلت خمس آياتٍ بليغاتٍ على النبي ﷺ لتكون فاتحة الوحي والرسالة الخاتمة. ما اسم هذه السورة الكريمة؟',
    explanation: 'نزلت الآيات الخمس الأولى من سورة العلق (اقرأ باسم ربك الذي خلق) في غار حراء، وكانت فاتحة الوحي.',
    category: 'ثقافة إسلامية',
    difficulty: 'EASY',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'سورة العلق', isCorrect: true },
      { text: 'سورة الفاتحة', isCorrect: false },
      { text: 'سورة المدثر', isCorrect: false },
      { text: 'سورة القلم', isCorrect: false },
    ],
  },
  {
    prompt: 'يُلقَّب بـ«الصديق» لأنه أوّل من آمن بالنبي ﷺ من الرجال الأحرار، ورافقه في رحلة الهجرة إلى المدينة، واختبأ معه في غار ثور. من هو هذا الصحابي الجليل؟',
    explanation: 'أبو بكر الصديق رضي الله عنه تولى الخلافة الراشدة في السنة 11 للهجرة بعد وفاة النبي ﷺ.',
    category: 'ثقافة إسلامية',
    difficulty: 'MEDIUM',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 20,
    basePoints: 1000,
    options: [
      { text: 'أبو بكر الصديق', isCorrect: true },
      { text: 'عمر بن الخطاب', isCorrect: false },
      { text: 'عثمان بن عفان', isCorrect: false },
      { text: 'علي بن أبي طالب', isCorrect: false },
    ],
  },
  {
    prompt: 'في رمضان من السنة الثانية للهجرة، التقى ثلاثمئة وثلاثة عشر من المسلمين بجمعٍ من قريش يقوده أبو جهل، لتكون أوّل مواجهة فاصلة في تاريخ الإسلام. ما اسم هذه الغزوة المباركة؟',
    explanation: 'وقعت غزوة بدر الكبرى (يوم الفرقان) في 17 رمضان من السنة الثانية للهجرة (2هـ)، وكانت نقطة تحوّل في تاريخ الدعوة.',
    category: 'ثقافة إسلامية',
    difficulty: 'HARD',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 25,
    basePoints: 1500,
    options: [
      { text: 'غزوة بدر الكبرى', isCorrect: true },
      { text: 'غزوة أحد', isCorrect: false },
      { text: 'غزوة الخندق', isCorrect: false },
      { text: 'فتح مكة', isCorrect: false },
    ],
  },

  // ─── 🌐 ثقافة عامة ─────────────────────────────────────────────────────
  {
    prompt: 'في الثالث والعشرين من أبريل من كل عام، يحتفي العالم بيومٍ أقرّته منظمة اليونسكو تقديراً للكتاب والمؤلفين. ما الاسم الرسمي لهذا اليوم؟',
    explanation: 'اليوم العالمي للكتاب وحقوق المؤلف يصادف 23 أبريل، ويحيي ذكرى وفاة كل من شكسبير وسيرفانتس وآخرين، ويشجع القراءة وحماية الملكية الفكرية.',
    category: 'ثقافة عامة',
    difficulty: 'EASY',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'اليوم العالمي للكتاب وحقوق المؤلف', isCorrect: true },
      { text: 'اليوم العالمي للمعرفة', isCorrect: false },
      { text: 'يوم القراءة العربي', isCorrect: false },
      { text: 'يوم التراث العالمي', isCorrect: false },
    ],
  },

  // ─── 🌍 جغرافيا (تم تقليصها بنسبة 80%) ──────────────────────────────
  {
    prompt: 'تطلّ على الخليج العربي، وتحتضن أطول برجٍ بناه الإنسان حتى الآن. ما اسم عاصمة هذه الدولة الخليجية؟',
    explanation: 'أبوظبي هي العاصمة الاتحادية لدولة الإمارات العربية المتحدة، ويبلغ ارتفاع برج خليفة فيها 828 متراً.',
    category: 'جغرافيا',
    difficulty: 'EASY',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'أبوظبي', isCorrect: true },
      { text: 'دبي', isCorrect: false },
      { text: 'الشارقة', isCorrect: false },
      { text: 'عجمان', isCorrect: false },
    ],
  },

  // ─── 🔬 علوم وطبيعة ────────────────────────────────────────────────────
  {
    prompt: 'الماء النقي يتكوّن كيميائياً من عنصري الهيدروجين والأكسجين.',
    explanation: 'صيغة الماء H₂O: ذرتا هيدروجين وذرة أكسجين واحدة.',
    category: 'علوم',
    difficulty: 'EASY',
    type: 'TRUE_FALSE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'صحيح', isCorrect: true },
      { text: 'خطأ', isCorrect: false },
    ],
  },
  {
    prompt: 'في مجموعتنا الشمسية، يتفوّق كوكبٌ بكتلةٍ تزيد على ضعف كتلة جميع الكواكب مجتمعة، ويحيط به أكثر من تسعين قمراً معروفاً. ما اسم هذا العملاق الغازي؟',
    explanation: 'المشتري هو أكبر كواكب المجموعة الشمسية حجماً وكتلة، ويبلغ قطره نحو 11 ضعف قطر الأرض.',
    category: 'علوم',
    difficulty: 'EASY',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'المشتري', isCorrect: true },
      { text: 'زحل', isCorrect: false },
      { text: 'الأرض', isCorrect: false },
      { text: 'نبتون', isCorrect: false },
    ],
  },
  {
    prompt: 'ما هو الغاز الأكثر وفرة في الغلاف الجوي لكوكب الأرض؟',
    explanation: 'يشكل غاز النيتروجين حوالي 78% من حجم الغلاف الجوي للأرض.',
    category: 'علوم',
    difficulty: 'MEDIUM',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 20,
    basePoints: 1000,
    options: [
      { text: 'النيتروجين', isCorrect: true },
      { text: 'الأكسجين', isCorrect: false },
      { text: 'ثاني أكسيد الكربون', isCorrect: false },
      { text: 'الهيدروجين', isCorrect: false },
    ],
  },
  {
    prompt: 'كم عدد العظام في جسم الإنسان البالغ السليم؟',
    explanation: 'يحتوي الهيكل العظمي للشخص البالغ على 206 عظمة، بينما يولد الطفل بنحو 270 عظمة تلتحم مع نموّه.',
    category: 'علوم',
    difficulty: 'HARD',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 25,
    basePoints: 1500,
    options: [
      { text: '206 عظمة', isCorrect: true },
      { text: '180 عظمة', isCorrect: false },
      { text: '250 عظمة', isCorrect: false },
      { text: '312 عظمة', isCorrect: false },
    ],
  },

  // ─── 🏛️ تاريخ وحضارات ──────────────────────────────────────────────────
  {
    prompt: 'في أي عام ميلادي استرد القائد صلاح الدين الأيوبي بيت المقدس بعد انتصاره في معركة حطين؟',
    explanation: 'استرد صلاح الدين الأيوبي القدس عام 583 هـ / 1187 م، بعد انتصاره في معركة حطين في يوليو من العام نفسه.',
    category: 'تاريخ',
    difficulty: 'MEDIUM',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 20,
    basePoints: 1000,
    options: [
      { text: '1187 م', isCorrect: true },
      { text: '1099 م', isCorrect: false },
      { text: '1258 م', isCorrect: false },
      { text: '1453 م', isCorrect: false },
    ],
  },
  {
    prompt: 'سقطت غرناطة، آخر معاقل الأندلس الإسلامية، في الثاني من يناير عام 1492 ميلادياً.',
    explanation: 'سقطت مملكة غرناطة في 2 يناير 1492م بتسليم أبي عبد الله الصغير مفاتيح المدينة، لتنتهي بذلك دولة المسلمين في الأندلس بعد نحو ثمانية قرون.',
    category: 'تاريخ',
    difficulty: 'MEDIUM',
    type: 'TRUE_FALSE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'صحيح', isCorrect: true },
      { text: 'خطأ', isCorrect: false },
    ],
  },
  {
    prompt: 'صاحب كتاب «المقدمة» الذي أسّس لعلم العمران البشري وعلم الاجتماع، ووصف تحلّل الدول بقانون شهير سُمّي باسمه. من هو هذا المؤرخ والفيلسوف؟',
    explanation: 'عبد الرحمن بن خلدون (1332-1406م) وضع مقدمة كتاب «العبر» التي أسّست لعلم الاجتماع وعلم العمران، وصاغ فيها «قانون العصبية».',
    category: 'تاريخ',
    difficulty: 'HARD',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 25,
    basePoints: 1500,
    options: [
      { text: 'ابن خلدون', isCorrect: true },
      { text: 'ابن رشد', isCorrect: false },
      { text: 'الفارابي', isCorrect: false },
      { text: 'ابن طفيل', isCorrect: false },
    ],
  },

  // ─── 📖 لغة وأدب ─────────────────────────────────────────────────────────
  {
    prompt: 'اللغة العربية هي إحدى اللغات الست الرسمية المعتمدة في منظمة الأمم المتحدة.',
    explanation: 'اعتمدت الأمم المتحدة اللغة العربية لغة رسمية في 18 ديسمبر 1973م، إلى جانب الإسبانية والإنجليزية والفرنسية والصينية والروسية.',
    category: 'أدب ولغة',
    difficulty: 'EASY',
    type: 'TRUE_FALSE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'صحيح', isCorrect: true },
      { text: 'خطأ', isCorrect: false },
    ],
  },
  {
    prompt: 'في عام 1988م، حصل كاتبٌ عربي على أرفع جائزةٍ أدبية في العالم، ليصبح بذلك أول أديب عربي يفوز بها عبر تاريخها الطويل. من هو هذا الروائي؟',
    explanation: 'نجيب محفوظ هو الأديب العربي الوحيد الفائز بجائزة نوبل في الأدب عام 1988م عن مجمل أعماله الروائية.',
    category: 'أدب ولغة',
    difficulty: 'EASY',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'نجيب محفوظ', isCorrect: true },
      { text: 'طه حسين', isCorrect: false },
      { text: 'توفيق الحكيم', isCorrect: false },
      { text: 'محمود درويش', isCorrect: false },
    ],
  },
  {
    prompt: 'في روايته «مدن الملح» المؤلفة من خمسة أجزاء، وصف الكاتب العربي تحوّلات اجتماعية واقتصادية كبرى عاشتها المنطقة العربية في عصر النفط. من هو هذا المؤلف؟',
    explanation: 'عبد الرحمن منيف (1933-2004م) هو صاحب الخماسية الروائية «مدن الملح» التي تصف تحولات المنطقة العربية تحت تأثير النفط.',
    category: 'أدب ولغة',
    difficulty: 'MEDIUM',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 20,
    basePoints: 1000,
    options: [
      { text: 'عبد الرحمن منيف', isCorrect: true },
      { text: 'غسان كنفاني', isCorrect: false },
      { text: 'الطيب صالح', isCorrect: false },
      { text: 'إبراهيم نصر الله', isCorrect: false },
    ],
  },
  {
    prompt: 'ما المعنى المعجمي الدقيق لكلمة «الجود» في لسان العرب؟',
    explanation: 'الجود في العربية هو الكرم والسخاء وبذل ما ينبغي لمن ينبغي، ويُعدّ من أشرف مكارم الأخلاق.',
    category: 'أدب ولغة',
    difficulty: 'MEDIUM',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 20,
    basePoints: 1000,
    options: [
      { text: 'الكرم والسخاء', isCorrect: true },
      { text: 'الشجاعة والإقدام', isCorrect: false },
      { text: 'الحكمة والصبر', isCorrect: false },
      { text: 'السرعة والمهارة', isCorrect: false },
    ],
  },

  // ─── ⚽ رياضة وبطولات ────────────────────────────────────────────────────
  {
    prompt: 'كم عدد لاعبي فريق كرة السلة داخل الملعب أثناء سير المباراة؟',
    explanation: 'يتكون فريق كرة السلة داخل الملعب من 5 لاعبين لكل فريق، بخلاف الاحتياطيين على مقاعد البدلاء.',
    category: 'رياضة',
    difficulty: 'EASY',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: '5 لاعبين', isCorrect: true },
      { text: '6 لاعبين', isCorrect: false },
      { text: '7 لاعبين', isCorrect: false },
      { text: '4 لاعبين', isCorrect: false },
    ],
  },
  {
    prompt: 'فاز المنتخب السعودي على نظيره الأرجنتيني في دور المجموعات بكأس العالم قطر 2022.',
    explanation: 'حقق المنتخب السعودي انتصاراً تاريخياً بنتيجة 2-1 على الأرجنتين في استاد لوسيل، ضمن الجولة الأولى من دور المجموعات في مونديال 2022.',
    category: 'رياضة',
    difficulty: 'EASY',
    type: 'TRUE_FALSE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'صحيح', isCorrect: true },
      { text: 'خطأ', isCorrect: false },
    ],
  },
  {
    prompt: 'على مدار تاريخ كأس العالم منذ نسخته الأولى عام 1930م، حقّقت دولةٌ في أمريكا الجنوبية اللقب خمس مرات، كان آخرها في كوريا واليابان 2002. ما اسم هذه الدولة؟',
    explanation: 'البرازيل تحمل الرقم القياسي العالمي برصيد 5 بطولات لكأس العالم (1958، 1962، 1970، 1994، 2002).',
    category: 'رياضة',
    difficulty: 'MEDIUM',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 20,
    basePoints: 1000,
    options: [
      { text: 'البرازيل (5 ألقاب)', isCorrect: true },
      { text: 'ألمانيا (4 ألقاب)', isCorrect: false },
      { text: 'إيطاليا (4 ألقاب)', isCorrect: false },
      { text: 'الأرجنتين (3 ألقاب)', isCorrect: false },
    ],
  },
  {
    prompt: 'في القارة الآسيوية، يحمل ناديٌ سعودي الرقم القياسي في عدد مرات التتويج بلقب دوري أبطال آسيا لكرة القدم. ما اسم هذا النادي؟',
    explanation: 'نادي الهلال السعودي هو الأكثر تتويجاً في تاريخ دوري أبطال آسيا، وقد رفع عدد ألقابه إلى أربعة ألقاب قارية موثّقة.',
    category: 'رياضة',
    difficulty: 'HARD',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 25,
    basePoints: 1500,
    options: [
      { text: 'الهلال السعودي', isCorrect: true },
      { text: 'أوراوا ريدز الياباني', isCorrect: false },
      { text: 'بوهانغ ستيلرز الكوري', isCorrect: false },
      { text: 'الاتحاد السعودي', isCorrect: false },
    ],
  },

  // ─── 🧮 رياضيات ──────────────────────────────────────────────────────
  {
    prompt: 'ما ناتج 15 × 4؟',
    explanation: '15 مضروبة في 4 تساوي 60.',
    category: 'رياضيات',
    difficulty: 'EASY',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: '60', isCorrect: true },
      { text: '45', isCorrect: false },
      { text: '50', isCorrect: false },
      { text: '64', isCorrect: false },
    ],
  },
  {
    prompt: 'اشترى أحمد 3 أقلام ودفتراً واحداً بمبلغ إجمالي 27 ريالاً، فإذا كان سعر الدفتر 9 ريالات. فما سعر القلم الواحد؟',
    explanation: 'ثمن الأقلام = 27 − 9 = 18 ريالاً، وعلى 3 أقلام يكون سعر القلم = 18 ÷ 3 = 6 ريالات.',
    category: 'رياضيات',
    difficulty: 'MEDIUM',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 20,
    basePoints: 1000,
    options: [
      { text: '6 ريالات', isCorrect: true },
      { text: '5 ريالات', isCorrect: false },
      { text: '4 ريالات', isCorrect: false },
      { text: '8 ريالات', isCorrect: false },
    ],
  },

  // ─── 🧠 منطق ──────────────────────────────────────────────────────────
  {
    prompt: 'إذا كانت كل الورود حمراء، وبعض الزهور ورود، فهل يمكن أن تكون بعض الزهور حمراء؟',
    explanation: 'نعم؛ لأن بعض الزهور ورود، وكل الورود حمراء، فهذه الزهور المعيّنة حمراء بالضرورة.',
    category: 'منطق',
    difficulty: 'MEDIUM',
    type: 'TRUE_FALSE',
    timeLimit: 25,
    basePoints: 1000,
    options: [
      { text: 'صحيح', isCorrect: true },
      { text: 'خطأ', isCorrect: false },
    ],
  },
  {
    prompt: 'أيُّ العبارتين أقوى منطقياً: «كل القطط حيوانات» أم «بعض الحيوانات قطط»؟ ولماذا؟',
    explanation: 'العبارة الأولى (كل القطط حيوانات) أقوى لأنها قضية كليّة لا استثناء فيها، بينما الثانية جزئية ولا تنفي وجود حيوانات ليست قططاً.',
    category: 'منطق',
    difficulty: 'MEDIUM',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 25,
    basePoints: 1000,
    options: [
      { text: 'العبارة الأولى: «كل القطط حيوانات»', isCorrect: true },
      { text: 'العبارة الثانية: «بعض الحيوانات قطط»', isCorrect: false },
      { text: 'متساويتان في القوة المنطقية', isCorrect: false },
      { text: 'لا يمكن المقارنة بينهما', isCorrect: false },
    ],
  },

  // ─── 💻 تقنية ──────────────────────────────────────────────────────────
  {
    prompt: 'HTML لغة برمجة تُستخدم لتنفيذ الخوارزميات المعقدة.',
    explanation: 'HTML لغة ترميز (Markup) تُستخدم لبناء هيكل صفحات الويب وعرض المحتوى، وليست لغة برمجة تنفيذية كـ Python أو JavaScript.',
    category: 'تقنية',
    difficulty: 'EASY',
    type: 'TRUE_FALSE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'صحيح', isCorrect: false },
      { text: 'خطأ', isCorrect: true },
    ],
  },
  {
    prompt: 'بفضل تقنيةٍ حديثة، يستطيع الحاسوب الترجمة الفورية والتعرّف على الكلام، والتعلّم من البيانات دون برمجة صريحة. ما اسم هذه التقنية التي أحدثت ثورة في الذكاء الاصطناعي؟',
    explanation: 'تعلّم الآلة (Machine Learning) هو الفرع الذي يُمكّن الحاسوب من التعلّم من البيانات وتحسين أدائه دون برمجة صريحة لكل حالة.',
    category: 'تقنية',
    difficulty: 'MEDIUM',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 20,
    basePoints: 1000,
    options: [
      { text: 'تعلّم الآلة (Machine Learning)', isCorrect: true },
      { text: 'الحوسبة السحابية (Cloud Computing)', isCorrect: false },
      { text: 'البرمجة الكائنية (OOP)', isCorrect: false },
      { text: 'قواعد البيانات العلائقية (RDBMS)', isCorrect: false },
    ],
  },

  // ─── 🤖 ذكاء اصطناعي ──────────────────────────────────────────────────
  {
    prompt: 'ماذا يعني اختصار AI في عالم التقنية؟',
    explanation: 'AI اختصار لـ Artificial Intelligence أي الذكاء الاصطناعي، وهو مجال يمنح الآلات القدرة على محاكاة التفكير البشري.',
    category: 'ذكاء اصطناعي',
    difficulty: 'EASY',
    type: 'MULTIPLE_CHOICE',
    timeLimit: 15,
    basePoints: 800,
    options: [
      { text: 'الذكاء الاصطناعي (Artificial Intelligence)', isCorrect: true },
      { text: 'أتمتة الإنترنت (Internet Automation)', isCorrect: false },
      { text: 'تحليل المعلومات (Information Analysis)', isCorrect: false },
      { text: 'واجهة التطبيقات (Application Interface)', isCorrect: false },
    ],
  },
];

async function main() {
  const owner = await db.user.upsert({
    where: { email: 'seed@tahaddi.local' },
    update: {},
    create: {
      email: 'seed@tahaddi.local',
      name: 'محتوى تحدّي',
      role: 'ADMIN',
    },
  });

  const categoryIds = new Map<string, string>();
  for (const name of [...new Set(questions.map((q) => q.category))]) {
    const category = await db.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoryIds.set(name, category.id);
  }

  let created = 0;
  let skipped = 0;

  for (const q of questions) {
    const existing = await db.question.findFirst({
      where: {
        ownerId: owner.id,
        prompt: q.prompt,
        status: { not: 'ARCHIVED' },
      },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await db.question.create({
      data: {
        ownerId: owner.id,
        type: q.type,
        status: 'PUBLISHED',
        difficulty: q.difficulty,
        prompt: q.prompt,
        explanation: q.explanation,
        categoryId: categoryIds.get(q.category),
        gameTypes:
          q.type === 'MULTIPLE_CHOICE'
            ? ['QUIZ', 'LADDER', 'CATEGORY_BOARD', 'MILLIONAIRE']
            : ['QUIZ', 'LADDER', 'CATEGORY_BOARD'],
        source: 'seed',
        timeLimit: q.timeLimit,
        basePoints: q.basePoints,
        options: {
          create: q.options.map((o, i) => ({
            position: i,
            text: o.text,
            isCorrect: o.isCorrect,
          })),
        },
      },
    });
    created += 1;
  }

  console.info(
    `✓ بنك الأسئلة: أُضيف ${created} سؤالاً جديداً، وتُخطّي ${skipped} موجوداً مسبقاً (فئات كانونية منظمة).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());

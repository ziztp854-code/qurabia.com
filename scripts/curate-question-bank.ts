/**
 * scripts/curate-question-bank.ts
 * ---------------------------------------------------------------------------
 * One-shot curation applied to the live database after the seed file was
 * re-organised. The script is idempotent — re-running it is safe.
 *
 *   1. Archive the four geography questions removed from the seed
 *      (80% cut requested on 2026-08-18).
 *   2. Update eight questions that were rephrased for diversity
 *      (scenario / curiosity framing instead of plain WH).
 *   3. Insert the four replacement questions added in new categories
 *      (culture générale, mathématiques, logique, technologie).
 *   4. Print a JSON before/after summary.
 *
 * Usage:
 *   pnpm tsx scripts/curate-question-bank.ts            # run on live DB
 *   pnpm tsx scripts/curate-question-bank.ts --dry-run  # report only
 */
import { config } from 'dotenv';
import { createPrismaClient } from '@tahaddi/database';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });
if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
  config({ path: '.env.example', quiet: true });
}

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DIRECT_URL or DATABASE_URL is required.');
  process.exit(1);
}

const db = createPrismaClient(connectionString);
const dryRun = process.argv.includes('--dry-run');

const ARCHIVE_OLD_PROMPTS = [
  'ما هي أكبر دولة عربية من حيث المساحة الإجمالية؟',
  'ما هو أطول نهر في العالم؟',
  'العراق دولة تطلّ على البحر الأبيض المتوسط.',
  'ما المضيق الذي يفصل بين قارة إفريقيا وقارة أوروبا ويربط البحر المتوسط بالمحيط الأطلسي؟',
];

type Rewrite = {
  oldPrompt: string;
  prompt: string;
  explanation: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  options: { text: string; isCorrect: boolean }[];
};

const REWRITES: Rewrite[] = [
  {
    oldPrompt: 'ما هي عاصمة المملكة العربية السعودية؟',
    prompt: 'في قلب نجد، تتوسط أرض الجزيرة العربية عاصمةٌ كبرى هي مقرّ الحكم ودارة القرار منذ تأسيس الدولة السعودية الأولى عام 1727م. ما اسم هذه العاصمة؟',
    explanation: 'الرياض هي العاصمة وأكبر مدن المملكة العربية السعودية، ومركزها الإداري والمالي منذ الدولة السعودية الأولى.',
    difficulty: 'EASY',
    options: [
      { text: 'الرياض', isCorrect: true },
      { text: 'جدة', isCorrect: false },
      { text: 'الدمام', isCorrect: false },
      { text: 'مكة المكرمة', isCorrect: false },
    ],
  },
  {
    oldPrompt: 'في أي مدينة سعودية يقع حي الطريف التاريخي المسجل في قائمة التراث العالمي؟',
    prompt: 'على ضفاف وادي حنيفة، يحتضن حيٌّ تاريخيٌّ أبنيتُه من الطين جدران قصرٍ بُني ليكون قاعدة حكم «آل سعود» الأولى. ما اسم هذا الحيّ المدرجة أبنيته على قائمة اليونسكو للتراث العالمي؟',
    explanation: 'يقع حي الطريف التاريخي في الدرعية، عاصمة الدولة السعودية الأولى، وهو أحد مواقع التراث العالمي لليونسكو منذ عام 2010م.',
    difficulty: 'MEDIUM',
    options: [
      { text: 'حي الطريف في الدرعية', isCorrect: true },
      { text: 'حي المعلا في مكة', isCorrect: false },
      { text: 'حي الروشن في جدة', isCorrect: false },
      { text: 'حي الثعالبة في الأحساء', isCorrect: false },
    ],
  },
  {
    oldPrompt: 'ما أول سورة نزلت آياتها الأولى على رسول الله ﷺ؟',
    prompt: 'في غار حراء، نزلت خمس آياتٍ بليغاتٍ على النبي ﷺ لتكون فاتحة الوحي والرسالة الخاتمة. ما اسم هذه السورة الكريمة؟',
    explanation: 'نزلت الآيات الخمس الأولى من سورة العلق (اقرأ باسم ربك الذي خلق) في غار حراء، وكانت فاتحة الوحي.',
    difficulty: 'EASY',
    options: [
      { text: 'سورة العلق', isCorrect: true },
      { text: 'سورة الفاتحة', isCorrect: false },
      { text: 'سورة المدثر', isCorrect: false },
      { text: 'سورة القلم', isCorrect: false },
    ],
  },
  {
    oldPrompt: 'من هو أول خليفة في الإسلام بعد وفاة النبي ﷺ؟',
    prompt: 'يُلقَّب بـ«الصديق» لأنه أوّل من آمن بالنبي ﷺ من الرجال الأحرار، ورافقه في رحلة الهجرة إلى المدينة، واختبأ معه في غار ثور. من هو هذا الصحابي الجليل؟',
    explanation: 'أبو بكر الصديق رضي الله عنه تولى الخلافة الراشدة في السنة 11 للهجرة بعد وفاة النبي ﷺ.',
    difficulty: 'MEDIUM',
    options: [
      { text: 'أبو بكر الصديق', isCorrect: true },
      { text: 'عمر بن الخطاب', isCorrect: false },
      { text: 'عثمان بن عفان', isCorrect: false },
      { text: 'علي بن أبي طالب', isCorrect: false },
    ],
  },
  {
    oldPrompt: 'في أي سنة هجرية وقعت غزوة بدر الكبرى (يوم الفرقان)؟',
    prompt: 'في رمضان من السنة الثانية للهجرة، التقى ثلاثمئة وثلاثة عشر من المسلمين بجمعٍ من قريش يقوده أبو جهل، لتكون أوّل مواجهة فاصلة في تاريخ الإسلام. ما اسم هذه الغزوة المباركة؟',
    explanation: 'وقعت غزوة بدر الكبرى (يوم الفرقان) في 17 رمضان من السنة الثانية للهجرة (2هـ)، وكانت نقطة تحوّل في تاريخ الدعوة.',
    difficulty: 'HARD',
    options: [
      { text: 'غزوة بدر الكبرى', isCorrect: true },
      { text: 'غزوة أحد', isCorrect: false },
      { text: 'غزوة الخندق', isCorrect: false },
      { text: 'فتح مكة', isCorrect: false },
    ],
  },
  {
    oldPrompt: 'ما هو أكبر كوكب في المجموعة الشمسية حجماً وكتلة؟',
    prompt: 'في مجموعتنا الشمسية، يتفوّق كوكبٌ بكتلةٍ تزيد على ضعف كتلة جميع الكواكب مجتمعة، ويحيط به أكثر من تسعين قمراً معروفاً. ما اسم هذا العملاق الغازي؟',
    explanation: 'المشتري هو أكبر كواكب المجموعة الشمسية حجماً وكتلة، ويبلغ قطره نحو 11 ضعف قطر الأرض.',
    difficulty: 'EASY',
    options: [
      { text: 'المشتري', isCorrect: true },
      { text: 'زحل', isCorrect: false },
      { text: 'الأرض', isCorrect: false },
      { text: 'نبتون', isCorrect: false },
    ],
  },
  {
    oldPrompt: 'من هو الروائي العربي الحائز على جائزة نوبل في الآداب عام 1988م؟',
    prompt: 'في عام 1988م، حصل كاتبٌ عربي على أرفع جائزةٍ أدبية في العالم، ليصبح بذلك أول أديب عربي يفوز بها عبر تاريخها الطويل. من هو هذا الروائي؟',
    explanation: 'نجيب محفوظ هو الأديب العربي الوحيد الفائز بجائزة نوبل في الأدب عام 1988م عن مجمل أعماله الروائية.',
    difficulty: 'EASY',
    options: [
      { text: 'نجيب محفوظ', isCorrect: true },
      { text: 'طه حسين', isCorrect: false },
      { text: 'توفيق الحكيم', isCorrect: false },
      { text: 'محمود درويش', isCorrect: false },
    ],
  },
  {
    oldPrompt: 'ما هي الدولة الأكثر تتويجاً بلقب بطولة كأس العالم لكرة القدم عبر التاريخ؟',
    prompt: 'على مدار تاريخ كأس العالم منذ نسخته الأولى عام 1930م، حقّقت دولةٌ في أمريكا الجنوبية اللقب خمس مرات، كان آخرها في كوريا واليابان 2002. ما اسم هذه الدولة؟',
    explanation: 'البرازيل تحمل الرقم القياسي العالمي برصيد 5 بطولات لكأس العالم (1958، 1962، 1970، 1994، 2002).',
    difficulty: 'MEDIUM',
    options: [
      { text: 'البرازيل (5 ألقاب)', isCorrect: true },
      { text: 'ألمانيا (4 ألقاب)', isCorrect: false },
      { text: 'إيطاليا (4 ألقاب)', isCorrect: false },
      { text: 'الأرجنتين (3 ألقاب)', isCorrect: false },
    ],
  },
];

type NewQuestion = {
  prompt: string;
  explanation: string;
  category: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
  timeLimit: number;
  basePoints: number;
  options: { text: string; isCorrect: boolean }[];
};

const NEW_QUESTIONS: NewQuestion[] = [
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
];

async function ensureOwner() {
  return db.user.upsert({
    where: { email: 'seed@tahaddi.local' },
    update: {},
    create: {
      email: 'seed@tahaddi.local',
      name: 'محتوى تحدّي',
      role: 'ADMIN',
    },
  });
}

async function ensureCategory(name: string) {
  return db.category.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function archiveOldGeography(ownerId: string) {
  const archived: string[] = [];
  for (const prompt of ARCHIVE_OLD_PROMPTS) {
    const existing = await db.question.findFirst({
      where: { ownerId, prompt, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    if (!existing) continue;
    if (dryRun) {
      archived.push(prompt);
      continue;
    }
    await db.question.update({
      where: { id: existing.id },
      data: { status: 'ARCHIVED', lastEditedAt: new Date() },
    });
    archived.push(prompt);
  }
  return archived;
}

async function applyRewrites(ownerId: string) {
  const updated: string[] = [];
  for (const rewrite of REWRITES) {
    const existing = await db.question.findFirst({
      where: { ownerId, prompt: rewrite.oldPrompt, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    if (!existing) continue;
    if (dryRun) {
      updated.push(rewrite.oldPrompt);
      continue;
    }
    await db.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: existing.id },
        data: {
          prompt: rewrite.prompt,
          explanation: rewrite.explanation,
          difficulty: rewrite.difficulty,
          lastEditedAt: new Date(),
        },
      });
      await tx.questionOption.deleteMany({ where: { questionId: existing.id } });
      await tx.questionOption.createMany({
        data: rewrite.options.map((option, position) => ({
          questionId: existing.id,
          position,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
      });
    });
    updated.push(rewrite.oldPrompt);
  }
  return updated;
}

async function createNewQuestions(ownerId: string) {
  const categoryIds = new Map<string, string>();
  for (const question of NEW_QUESTIONS) {
    if (!categoryIds.has(question.category)) {
      const category = await ensureCategory(question.category);
      categoryIds.set(question.category, category.id);
    }
  }

  const created: string[] = [];
  for (const question of NEW_QUESTIONS) {
    const exists = await db.question.findFirst({
      where: { ownerId, prompt: question.prompt, status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    if (exists) continue;
    if (dryRun) {
      created.push(question.prompt);
      continue;
    }
    await db.question.create({
      data: {
        ownerId,
        type: question.type,
        status: 'PUBLISHED',
        difficulty: question.difficulty,
        prompt: question.prompt,
        explanation: question.explanation,
        categoryId: categoryIds.get(question.category) ?? null,
        gameTypes:
          question.type === 'MULTIPLE_CHOICE'
            ? ['QUIZ', 'LADDER', 'CATEGORY_BOARD', 'MILLIONAIRE']
            : ['QUIZ', 'LADDER', 'CATEGORY_BOARD'],
        source: 'curation-2026-08-18',
        timeLimit: question.timeLimit,
        basePoints: question.basePoints,
        options: {
          create: question.options.map((option, position) => ({
            position,
            text: option.text,
            isCorrect: option.isCorrect,
          })),
        },
      },
    });
    created.push(question.prompt);
  }
  return created;
}

async function summary() {
  const [byCategory, totals] = await Promise.all([
    db.question.groupBy({
      by: ['categoryId', 'type', 'difficulty', 'status'],
      _count: { _all: true },
    }),
    db.question.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  const categories = await db.category.findMany({ select: { id: true, name: true } });
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return {
    totals: totals.map((row) => ({ status: row.status, count: row._count._all })),
    perCategory: byCategory
      .filter((row) => row.status === 'PUBLISHED')
      .map((row) => ({
        category: categoryName.get(row.categoryId ?? '') ?? 'بدون فئة',
        type: row.type,
        difficulty: row.difficulty,
        count: row._count._all,
      })),
  };
}

async function main() {
  console.info(`\n🎯  وضع التنفيذ: ${dryRun ? 'معاينة فقط (dry-run)' : 'تطبيق فعلي'}`);
  const owner = await ensureOwner();

  const archived = await archiveOldGeography(owner.id);
  const updated = await applyRewrites(owner.id);
  const created = await createNewQuestions(owner.id);

  console.info('\n══════════════════════════════════════════════════════════════');
  console.info('  📋  تقرير تطبيق التحديث على بنك الأسئلة');
  console.info('══════════════════════════════════════════════════════════════');
  console.info(`  • أسئلة جغرافيا مؤرشفة: ${archived.length}`);
  archived.forEach((p) => console.info(`      - ${p}`));
  console.info(`  • أسئلة أُعيدت صياغتها: ${updated.length}`);
  updated.forEach((p) => console.info(`      - ${p.slice(0, 60)}…`));
  console.info(`  • أسئلة جديدة أُضيفت:   ${created.length}`);
  created.forEach((p) => console.info(`      - ${p.slice(0, 60)}…`));

  if (dryRun) {
    console.info('\n  (معاينة فقط — لم يُعدَّل أي سجل في قاعدة البيانات)');
  }

  if (!dryRun) {
    const snap = await summary();
    console.info('\n══════════════════════════════════════════════════════════════');
    console.info('  📊  التوزيع الحالي بعد التطبيق');
    console.info('══════════════════════════════════════════════════════════════');
    for (const row of snap.totals) {
      console.info(`  • status=${row.status}: ${row.count}`);
    }
    console.info('\n  ─── الأسئلة المنشورة حسب الفئة ───');
    const byCat = new Map<string, number>();
    for (const row of snap.perCategory) {
      byCat.set(row.category, (byCat.get(row.category) ?? 0) + row.count);
    }
    for (const [cat, count] of byCat) {
      console.info(`  • ${cat}: ${count}`);
    }
  }
}

main()
  .catch((e) => {
    console.error('❌ Curation failed:', e);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());

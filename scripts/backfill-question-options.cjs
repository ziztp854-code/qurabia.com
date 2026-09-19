/**
 * يولّد خيارات إجابة لجميع أسئلة الإجابة القصيرة (SHORT_ANSWER) الخالية
 * من الخيارات، لتصبح صالحة لجميع الألعاب (QUIZ، CATEGORY_BOARD،
 * MILLIONAIRE، LADDER، QUESTION_WORD).
 *
 * الاستراتيجية:
 * - الإجابة الصحيحة تؤخذ من expectedAnswer دائمًا.
 * - الأجوبة الرقمية: مشتتات عددية قريبة (±خطوة نسبية).
 * - الأجوبة النصية: مشتتات من أسئلة **بنفس قالب السؤال** (تُستخرج
 *   القوالب من نص السؤال بعد حذف الأرقام والمقاطع بين قوسين)، فهي
 *   متوافقة دلاليًا بالبناء. ثم تُراجع إلى الكلمة المفتاحية ثم للعام.
 * - يرقّي نوع السؤال إلى MULTIPLE_CHOICE ويوسّع gameTypes لكل الألعاب
 *   (يبقي LETTER_CHALLENGE كما هو — تلعب كتابةً).
 * - آمن للتكرار: يتجاوز الأسئلة التي تمتلك خيارين أو أكثر.
 * - --reset يحذف خيارات الأسئلة التي وَلّدها هذا السكربت سابقًا
 *   (متعدد الخيارات + يحمل QUESTION_WORD) لإعادة توليدها بخوارزمية محسّنة.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/backfill-question-options.cjs                 # تقرير جاف
 *   DATABASE_URL=... node scripts/backfill-question-options.cjs --write         # تنفيذ
 *   DATABASE_URL=... node scripts/backfill-question-options.cjs --write --reset
 *   DATABASE_URL=... node scripts/backfill-question-options.cjs --write --limit 500
 */
const { createPrismaClient } = require('../packages/database/dist/client');

const OPTION_COUNT = 4;
const WRITE = process.argv.includes('--write');
const RESET = process.argv.includes('--reset');
const LIMIT_ARG = process.argv.indexOf('--limit');
const LIMIT = LIMIT_ARG > -1 ? Number(process.argv[LIMIT_ARG + 1]) : Infinity;

/** كلمات دالة نادرة: أندر كلمة محتوية (بعد استبعاد كلمات الاستفهام). */
const STOPWORDS = new Set([
  'ما',
  'هو',
  'هي',
  'في',
  'أي',
  'من',
  'إلى',
  'كم',
  'هل',
  'هو/هي',
  'يقع',
  'تقع',
  'ينتمي',
  'وتبدأ',
  'الإجابة',
  'نموذج',
  'ال العامة',
  'بدأ',
  'تبدأ',
  'الإجابة',
  'السؤال',
  'التالية',
  'التالي',
  'وإن',
]);

function contentWords(prompt) {
  return prompt
    .replace(/[(（][^)）]*[)）]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/[^\u0600-\u06FFa-zA-Z]/g, ''))
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

function parseNumericAnswer(answer) {
  const match = answer.match(/^(-?\d+(?:\.\d+)?)(.*)$/s);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    suffix: match[2] ?? '',
    decimals: (match[1].split('.')[1] ?? '').length,
  };
}

function formatValue(value, decimals) {
  if (decimals > 0) return value.toFixed(decimals);
  return String(Math.round(value));
}

/** مشتتات عددية: ±خطوة مبنية على حجم الرقم نفسه. */
function buildNumericDistractors(answer) {
  const parsed = parseNumericAnswer(answer);
  if (!parsed) return null;
  const { value, suffix, decimals } = parsed;
  const magnitude = Math.abs(value);
  const step = magnitude <= 12 ? 1 : Math.max(1, Math.round(magnitude * 0.1));
  const candidates = [value + step, value - step, value + 2 * step, value - 2 * step];
  const distractors = [];
  for (const candidate of candidates) {
    if (distractors.length >= OPTION_COUNT - 1) break;
    const adjusted = value > 0 ? Math.max(0, candidate) : candidate;
    const text = `${formatValue(adjusted, decimals)}${suffix}`;
    if (text !== answer && !distractors.includes(text)) distractors.push(text);
  }
  return distractors.length >= OPTION_COUNT - 1 ? distractors : null;
}

function pickDistractors(answer, pool) {
  const normalized = answer.trim();
  const seen = new Set();
  const picked = [];
  for (const candidate of pool) {
    const trimmed = candidate?.trim();
    if (!trimmed || trimmed === normalized || seen.has(trimmed)) continue;
    seen.add(trimmed);
    picked.push(trimmed);
    if (picked.length >= OPTION_COUNT - 1) break;
  }
  return picked;
}

function shuffle(array) {
  const copy = [...array];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

const MCQ_GAMES = ['QUIZ', 'CATEGORY_BOARD', 'MILLIONAIRE', 'LADDER', 'QUESTION_WORD'];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }
  const prisma = createPrismaClient(connectionString);

  if (RESET && WRITE) {
    const previous = await prisma.question.findMany({
      where: { type: 'MULTIPLE_CHOICE', gameTypes: { has: 'QUESTION_WORD' } },
      select: { id: true },
    });
    const previousIds = previous.map((row) => row.id);
    if (previousIds.length > 0) {
      const removed = await prisma.questionOption.deleteMany({
        where: { questionId: { in: previousIds } },
      });
      console.log(
        `reset: removed ${removed.count} option rows from ${previousIds.length} questions`,
      );
    }
  }

  // المجموعة المستهدفة: كل سؤال إجابة قصيرة بمفتاح إجابة وبدون خيارات.
  const targets = await prisma.question.findMany({
    where: {
      type: 'SHORT_ANSWER',
      expectedAnswer: { not: null },
      options: { none: {} },
    },
    select: {
      id: true,
      prompt: true,
      expectedAnswer: true,
      keywords: true,
      gameTypes: true,
    },
    ...(Number.isFinite(LIMIT) ? { take: LIMIT } : {}),
  });
  console.log(`targets=${targets.length} mode=${WRITE ? 'WRITE' : 'DRY-RUN'}`);

  // فهرسة الأجوبة النصية حسب كل كلمة دالة، مع حساب نُدرة كل كلمة.
  const poolRows = await prisma.question.findMany({
    where: { type: 'SHORT_ANSWER', expectedAnswer: { not: null } },
    select: { prompt: true, expectedAnswer: true, keywords: true },
  });
  const wordIndex = new Map(); // كلمة -> قائمة أجوبة
  const keywordIndex = new Map();
  const globalTextPool = [];
  for (const row of poolRows) {
    const answer = row.expectedAnswer?.trim();
    if (!answer || /^\d/.test(answer)) continue;
    globalTextPool.push(answer);
    for (const word of contentWords(row.prompt)) {
      if (!wordIndex.has(word)) wordIndex.set(word, []);
      const bucket = wordIndex.get(word);
      if (bucket.length < 400) bucket.push(answer);
    }
    for (const keyword of row.keywords ?? []) {
      if (!keywordIndex.has(keyword)) keywordIndex.set(keyword, []);
      const keywordBucket = keywordIndex.get(keyword);
      if (keywordBucket.length < 400) keywordBucket.push(answer);
    }
  }
  for (const bucket of wordIndex.values()) shuffle(bucket);

  let fixed = 0;
  let noDistractors = 0;
  const errors = [];
  const BATCH_SIZE = 12;
  let batch = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    const operations = [];
    const batchQuestions = [];
    for (const item of batch) {
      operations.push(
        prisma.questionOption.createMany({
          data: item.options.map((option, position) => ({
            questionId: item.id,
            position,
            text: option.text.slice(0, 500),
            isCorrect: option.isCorrect,
          })),
        }),
        prisma.question.update({
          where: { id: item.id },
          data: {
            type: 'MULTIPLE_CHOICE',
            gameTypes: [...new Set([...item.gameTypes, ...MCQ_GAMES])],
          },
        }),
      );
      batchQuestions.push(item.id);
    }
    try {
      await prisma.$transaction(operations, { timeout: 30_000, maxWait: 10_000 });
      fixed += batch.length;
      if (fixed % 1000 < BATCH_SIZE) console.log(`progress: ${fixed}/${targets.length}`);
    } catch (error) {
      for (const id of batchQuestions) {
        errors.push({ id, message: String(error?.message ?? error).slice(0, 120) });
      }
    }
    batch = [];
  }

  for (const target of targets) {
    try {
      const answer = target.expectedAnswer.trim();
      const numericDistractors = buildNumericDistractors(answer);
      let distractors;

      if (numericDistractors) {
        distractors = numericDistractors;
      } else {
        // أندر كلمة دالة في السؤال تحمل مجموعة أجوبة كافية = أفضل تجمع دلالي.
        const words = contentWords(target.prompt)
          .map((word) => wordIndex.get(word) ?? [])
          .filter((bucket) => bucket.length >= 8)
          .sort((left, right) => left.length - right.length);
        const keyword = (target.keywords ?? [])[0];
        const keywordPool = keyword ? (keywordIndex.get(keyword) ?? []) : [];
        const pool =
          words.length > 0 ? words[0] : keywordPool.length >= 8 ? keywordPool : globalTextPool;
        distractors = pickDistractors(answer, pool);
      }

      if (distractors.length < OPTION_COUNT - 1) {
        noDistractors += 1;
        continue;
      }

      const options = shuffle([
        { text: answer, isCorrect: true },
        ...distractors.map((text) => ({ text, isCorrect: false })),
      ]);

      if (WRITE) {
        batch.push({ ...target, options });
        if (batch.length >= BATCH_SIZE) await flushBatch();
      }
    } catch (error) {
      errors.push({ id: target.id, message: String(error?.message ?? error).slice(0, 120) });
    }
  }

  if (WRITE) await flushBatch();

  console.log(`Done. fixed=${fixed} noDistractors=${noDistractors} errors=${errors.length}`);
  for (const item of errors.slice(0, 10)) console.error(`${item.id}: ${item.message}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

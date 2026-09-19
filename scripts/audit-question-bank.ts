/**
 * One-shot audit of the central question bank.
 * Prints a single JSON object to stdout.
 *
 * Usage: pnpm exec tsx scripts/audit-question-bank.ts
 */
import { config } from 'dotenv';
import { createPrismaClient } from '@tahaddi/database';
import { validateQuestionRow } from '../apps/web/src/lib/questions/validation';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DIRECT_URL or DATABASE_URL is required');
  process.exit(1);
}

const prisma = createPrismaClient(connectionString);

function countBy<T extends string>(items: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return out;
}

async function main() {
  const [
    total,
    byStatus,
    byType,
    byDifficulty,
    uncategorized,
    noKeywords,
    inactiveCategory,
    categories,
    questions,
  ] = await Promise.all([
    prisma.question.count(),
    prisma.question.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.question.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.question.groupBy({ by: ['difficulty'], _count: { _all: true } }),
    prisma.question.count({ where: { categoryId: null } }),
    prisma.question.count({ where: { keywords: { equals: [] } } }),
    prisma.question.count({
      where: { category: { is: { isActive: false } } },
    }),
    prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        isActive: true,
        _count: { select: { questions: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.question.findMany({
      select: {
        id: true,
        type: true,
        status: true,
        difficulty: true,
        prompt: true,
        expectedAnswer: true,
        keywords: true,
        gameTypes: true,
        timeLimit: true,
        basePoints: true,
        categoryId: true,
        options: { select: { text: true, isCorrect: true }, orderBy: { position: 'asc' } },
      },
    }),
  ]);

  const gameCounts: Record<string, number> = {};
  let publishBlockingErrors = 0;
  let publishWarnings = 0;
  const issueSamples: Array<{ id: string; status: string; errors: string[] }> = [];

  for (const q of questions) {
    for (const game of q.gameTypes) {
      gameCounts[game] = (gameCounts[game] ?? 0) + 1;
    }
    const correctOption = q.options.findIndex((o) => o.isCorrect);
    const issues = validateQuestionRow({
      type: q.type,
      prompt: q.prompt,
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
      correctOption,
      expectedAnswer: q.expectedAnswer,
      timeLimit: q.timeLimit,
      basePoints: q.basePoints,
      difficulty: q.difficulty,
      gameTypes: q.gameTypes,
      keywords: q.keywords,
      categoryId: q.categoryId,
      status: q.status,
    });
    const errors = issues.filter((i) => i.level === 'error').map((i) => i.message);
    const warnings = issues.filter((i) => i.level === 'warning');
    if (errors.length > 0) {
      publishBlockingErrors += 1;
      if (issueSamples.length < 12) {
        issueSamples.push({ id: q.id, status: q.status, errors: errors.slice(0, 3) });
      }
    }
    if (warnings.length > 0) publishWarnings += 1;
  }

  const roots = categories.filter((c) => c.parentId === null);
  const leaves = categories.filter((c) => c.parentId !== null);
  const orphanLeaves = leaves.filter((c) => !categories.some((p) => p.id === c.parentId));
  const topCategories = [...categories]
    .sort((a, b) => b._count.questions - a._count.questions)
    .slice(0, 20)
    .map((c) => ({
      name: c.name,
      count: c._count.questions,
      active: c.isActive,
      isDomain: c.parentId === null,
      slug: c.slug,
    }));

  const emptyCategories = categories
    .filter((c) => c._count.questions === 0)
    .map((c) => ({ name: c.name, isDomain: c.parentId === null, active: c.isActive }));

  const published = byStatus.find((s) => s.status === 'PUBLISHED')?._count._all ?? 0;
  const draft = byStatus.find((s) => s.status === 'DRAFT')?._count._all ?? 0;
  const archived = byStatus.find((s) => s.status === 'ARCHIVED')?._count._all ?? 0;

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      questions: total,
      published,
      draft,
      archived,
      categories: categories.length,
      domainRoots: roots.length,
      leafCategories: leaves.length,
      uncategorized,
      noKeywords,
      inactiveCategoryQuestions: inactiveCategory,
      publishBlockingErrors,
      questionsWithWarnings: publishWarnings,
    },
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    byType: Object.fromEntries(byType.map((s) => [s.type, s._count._all])),
    byDifficulty: Object.fromEntries(byDifficulty.map((s) => [s.difficulty, s._count._all])),
    byGame: gameCounts,
    topCategories,
    emptyCategories,
    orphanLeaves: orphanLeaves.map((c) => c.name),
    issueSamples,
    ladderEligible: questions.filter(
      (q) =>
        q.status === 'PUBLISHED' &&
        (q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE') &&
        q.gameTypes.includes('LADDER'),
    ).length,
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

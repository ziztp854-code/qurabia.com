import { config } from 'dotenv';
import { createPrismaClient } from '@tahaddi/database';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

const prisma = createPrismaClient(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);

async function main() {
  const samples = await prisma.question.findMany({
    take: 10,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      status: true,
      type: true,
      difficulty: true,
      prompt: true,
      expectedAnswer: true,
      gameTypes: true,
      keywords: true,
      category: { select: { name: true, parentId: true, parent: { select: { name: true } } } },
      _count: { select: { options: true } },
    },
  });
  const [optioned, withExpected, mcq, tf, publishedMcqOrTf] = await Promise.all([
    prisma.question.count({ where: { options: { some: {} } } }),
    prisma.question.count({ where: { NOT: { expectedAnswer: null } } }),
    prisma.question.count({ where: { type: 'MULTIPLE_CHOICE' } }),
    prisma.question.count({ where: { type: 'TRUE_FALSE' } }),
    prisma.question.count({
      where: {
        status: 'PUBLISHED',
        type: { in: ['MULTIPLE_CHOICE', 'TRUE_FALSE'] },
      },
    }),
  ]);
  const ladderTagged = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "Question"
    WHERE 'LADDER' = ANY ("gameTypes")
  `.then((rows) => Number(rows[0]?.count ?? 0));

  const categoryTree = await prisma.category.findMany({
    where: { parentId: null },
    select: {
      name: true,
      children: {
        select: { name: true, _count: { select: { questions: true } } },
        orderBy: { name: 'asc' },
      },
      _count: { select: { questions: true } },
    },
    orderBy: { name: 'asc' },
  });

  console.log(
    JSON.stringify(
      {
        optioned,
        withExpected,
        ladderTagged,
        mcq,
        tf,
        publishedMcqOrTf,
        samples: samples.map((s) => ({
          status: s.status,
          type: s.type,
          difficulty: s.difficulty,
          prompt: s.prompt.slice(0, 80),
          expectedAnswer: s.expectedAnswer?.slice(0, 40) ?? null,
          options: s._count.options,
          games: s.gameTypes,
          keywords: s.keywords.length,
          category: s.category?.name ?? null,
          domain: s.category?.parent?.name ?? null,
        })),
        domainTree: categoryTree.map((d) => ({
          domain: d.name,
          directQuestions: d._count.questions,
          children: d.children.map((c) => ({ name: c.name, questions: c._count.questions })),
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

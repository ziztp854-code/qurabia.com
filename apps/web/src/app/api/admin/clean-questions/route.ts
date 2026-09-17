import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requireAdminConsole } from '@/lib/auth/session';

export async function POST() {
  await requireAdminConsole();

  const prisma = getPrismaClient();
  const archivedAt = new Date();
  const archiveData = {
    status: 'ARCHIVED' as const,
    archivedAt,
    lastEditedAt: archivedAt,
  };

  const archiveWeird = await prisma.question.updateMany({
    where: {
      status: { not: 'ARCHIVED' },
      OR: [{ prompt: '' }, { prompt: ' ' }, { prompt: { contains: 'في أي عام ولد لاون التاسع', mode: 'insensitive' } }],
    },
    data: archiveData,
  });

  const nonArabicQuestions = await prisma.question.findMany({
    where: {
      source: { not: null },
    },
    select: { id: true, source: true },
  });

  const arabicRegex = /[\u0600-\u06FF]/;
  const idsToArchive = nonArabicQuestions
    .filter((q) => !arabicRegex.test(q.source!))
    .map((q) => q.id);

  const archiveNonArabic = idsToArchive.length
    ? await prisma.question.updateMany({
        where: { id: { in: idsToArchive }, status: { not: 'ARCHIVED' } },
        data: archiveData,
      })
    : { count: 0 };

  const archivedCount = archiveWeird.count + archiveNonArabic.count;

  return NextResponse.json({
    message: 'تمت أرشفة الأسئلة المطابقة بنجاح.',
    archivedCount,
  });
}

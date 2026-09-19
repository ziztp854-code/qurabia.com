import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requireAdminConsole } from '@/lib/auth/session';

export async function POST() {
  // Ensure the caller is an admin
  await requireAdminConsole();

  const prisma = getPrismaClient();

  // Delete "weird" questions (empty/whitespace prompt or archived)
  const deleteWeird = await prisma.question.deleteMany({
    where: {
      OR: [
        { prompt: '' },
        { prompt: ' ' },
        { status: 'ARCHIVED' },
        { prompt: { contains: 'في أي عام ولد لاون التاسع', mode: 'insensitive' } },
      ],
    },
  });

  // Delete questions whose source is not Arabic (no Arabic characters)
  const nonArabicQuestions = await prisma.question.findMany({
    where: {
      source: { not: null },
    },
    select: { id: true, source: true },
  });

  const arabicRegex = /[\u0600-\u06FF]/;
  const idsToDelete = nonArabicQuestions
    .filter((q) => !arabicRegex.test(q.source!))
    .map((q) => q.id);

  const deleteNonArabic = idsToDelete.length
    ? await prisma.question.deleteMany({ where: { id: { in: idsToDelete } } })
    : { count: 0 };

  const totalDeleted = deleteWeird.count + deleteNonArabic.count;

  return NextResponse.json({
    message: 'تم حذف الأسئلة الغريبة بنجاح.',
    deletedCount: totalDeleted,
  });
}

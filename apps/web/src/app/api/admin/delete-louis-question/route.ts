import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requireAdminConsole } from '@/lib/auth/session';

export async function POST() {
  // Verify admin
  await requireAdminConsole();

  const prisma = getPrismaClient();

  // Delete any question whose prompt contains the Arabic phrase for Louis IX birth year
  const result = await prisma.question.deleteMany({
    where: {
      prompt: {
        contains: 'في أي عام ولد لاون التاسع',
        mode: 'insensitive',
      },
    },
  });

  return NextResponse.json({
    message: 'تم حذف سؤال لاون التاسع إذا كان موجودًا.',
    deletedCount: result.count,
  });
}

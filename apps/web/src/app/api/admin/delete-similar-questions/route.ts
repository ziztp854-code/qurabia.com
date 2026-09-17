import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requireAdminConsole } from '@/lib/auth/session';

export async function POST(request: Request) {
  await requireAdminConsole();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة.' }, { status: 400 });
  }
  const query = typeof payload === 'object' && payload !== null ? (payload as { query?: unknown }).query : undefined;
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  if (!normalizedQuery) {
    return NextResponse.json({ error: 'يجب إدخال عبارة بحث غير فارغة.' }, { status: 400 });
  }

  const prisma = getPrismaClient();
  const archivedAt = new Date();

  const result = await prisma.question.updateMany({
    where: {
      prompt: {
        contains: normalizedQuery,
        mode: 'insensitive',
      },
      status: { not: 'ARCHIVED' },
    },
    data: {
      status: 'ARCHIVED',
      archivedAt,
      lastEditedAt: archivedAt,
    },
  });

  return NextResponse.json({
    message: 'تمت أرشفة الأسئلة المطابقة لعبارة البحث بنجاح.',
    archivedCount: result.count,
  });
}

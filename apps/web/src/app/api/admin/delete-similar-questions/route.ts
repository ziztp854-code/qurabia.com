import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requireAdminConsole } from '@/lib/auth/session';

export async function POST(request: Request) {
  // Verify admin
  await requireAdminConsole();

  const { query } = await request.json();
  if (!query || typeof query !== 'string' || query.trim() === '') {
    return NextResponse.json({ error: 'Missing or empty "query" in request body.' }, { status: 400 });
  }

  const prisma = getPrismaClient();

  const result = await prisma.question.deleteMany({
    where: {
      prompt: {
        contains: query,
        mode: 'insensitive',
      },
    },
  });

  return NextResponse.json({
    message: `Deleted questions containing "${query}"`,
    deletedCount: result.count,
  });
}

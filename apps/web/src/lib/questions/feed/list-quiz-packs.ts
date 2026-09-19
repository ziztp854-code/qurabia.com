import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import type { QuestionFeedGameMode, QuizPackSummary } from './types';

export async function listQuizPacksForMode(args: {
  ownerId: string;
  gameMode: QuestionFeedGameMode;
  take?: number;
}): Promise<QuizPackSummary[]> {
  if (!hasDatabaseUrl()) return [];

  const packs = await getPrismaClient().quiz.findMany({
    where: {
      ownerId: args.ownerId,
      gameMode: args.gameMode,
      status: { not: 'ARCHIVED' },
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(40, Math.max(1, args.take ?? 12)),
    select: {
      id: true,
      title: true,
      roomCode: true,
      updatedAt: true,
      _count: { select: { questions: true } },
    },
  });

  return packs.map((pack) => ({
    id: pack.id,
    title: pack.title,
    roomCode: pack.roomCode,
    questionCount: pack._count.questions,
    updatedAt: pack.updatedAt.toISOString(),
  }));
}

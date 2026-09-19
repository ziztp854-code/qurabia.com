import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import type { QuestionFeedGameMode, QuestionFeedResult, QuestionFeedRow } from './types';
import { QuestionFeedError } from './types';

export async function loadBankTaggedQuestions(
  gameMode: QuestionFeedGameMode,
  options?: { take?: number; types?: Array<'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER'> },
): Promise<QuestionFeedResult> {
  if (!hasDatabaseUrl()) {
    throw new QuestionFeedError('قاعدة البيانات غير مهيأة.', 'UNAVAILABLE');
  }

  const take = Math.min(1_500, Math.max(1, options?.take ?? 400));
  const rows = await getPrismaClient().question.findMany({
    where: {
      status: 'PUBLISHED',
      gameTypes: { has: gameMode },
      ...(options?.types ? { type: { in: options.types } } : {}),
      category: { is: { isActive: true } },
    },
    orderBy: [{ lastEditedAt: 'desc' }, { id: 'asc' }],
    take,
    select: {
      id: true,
      prompt: true,
      type: true,
      expectedAnswer: true,
      difficulty: true,
      timeLimit: true,
      basePoints: true,
      keywords: true,
      explanation: true,
      category: { select: { id: true, name: true } },
      options: {
        orderBy: { position: 'asc' },
        select: { id: true, text: true, isCorrect: true, position: true },
      },
    },
  });

  const feedRows: QuestionFeedRow[] = rows.map((question, index) => ({
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    expectedAnswer: question.expectedAnswer,
    difficulty: question.difficulty,
    categoryId: question.category?.id ?? null,
    categoryName: question.category?.name ?? 'عام',
    timeLimit: question.timeLimit,
    basePoints: question.basePoints,
    keywords: question.keywords,
    explanation: question.explanation,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      isCorrect: option.isCorrect,
      position: option.position,
    })),
    position: index,
  }));

  return {
    source: 'bank-tags',
    gameMode,
    quizId: null,
    quizTitle: null,
    rows: feedRows,
  };
}

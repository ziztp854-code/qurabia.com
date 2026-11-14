import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import type { QuestionFeedGameMode, QuestionFeedResult, QuestionFeedRow } from './types';
import { QuestionFeedError } from './types';

type BankQuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
type BankPageOptions = { take: number; types?: BankQuestionType[]; afterId?: string | null };

async function loadBankQuestionPage(
  gameMode: QuestionFeedGameMode,
  { take, types, afterId }: BankPageOptions,
): Promise<QuestionFeedRow[]> {
  if (!hasDatabaseUrl()) {
    throw new QuestionFeedError('قاعدة البيانات غير مهيأة.', 'UNAVAILABLE');
  }

  const rows = await getPrismaClient().question.findMany({
    where: {
      status: 'PUBLISHED',
      gameTypes: { has: gameMode },
      ...(types ? { type: { in: types } } : {}),
      category: { is: { isActive: true } },
      ...(afterId ? { id: { gt: afterId } } : {}),
    },
    orderBy: afterId === undefined ? [{ lastEditedAt: 'desc' }, { id: 'asc' }] : [{ id: 'asc' }],
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

  return rows.map((question, index) => ({
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
}

export async function loadBankTaggedQuestions(
  gameMode: QuestionFeedGameMode,
  options?: { take?: number; types?: BankQuestionType[] },
): Promise<QuestionFeedResult> {
  const take = Math.min(1_500, Math.max(1, options?.take ?? 400));
  const rows = await loadBankQuestionPage(gameMode, { take, types: options?.types });

  return {
    source: 'bank-tags',
    gameMode,
    quizId: null,
    quizTitle: null,
    rows,
  };
}

/** Read every eligible row in stable keyset pages without retaining the whole bank. */
export async function* loadBankTaggedQuestionPages(
  gameMode: QuestionFeedGameMode,
  options?: { types?: BankQuestionType[] },
): AsyncGenerator<QuestionFeedRow[]> {
  const take = 500;
  let afterId: string | null = null;
  for (;;) {
    const rows = await loadBankQuestionPage(gameMode, { take, types: options?.types, afterId });
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < take) return;
    afterId = rows[rows.length - 1]!.id;
  }
}

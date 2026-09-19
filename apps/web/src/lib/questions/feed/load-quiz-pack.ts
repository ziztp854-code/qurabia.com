import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import type { QuestionFeedGameMode, QuestionFeedResult, QuestionFeedRow } from './types';
import { QuestionFeedError } from './types';

const PACK_SELECT = {
  id: true,
  title: true,
  gameMode: true,
  status: true,
  questions: {
    orderBy: { position: 'asc' as const },
    select: {
      position: true,
      durationOverride: true,
      pointsOverride: true,
      question: {
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
          status: true,
          gameTypes: true,
          category: { select: { id: true, name: true } },
          options: {
            orderBy: { position: 'asc' as const },
            select: { id: true, text: true, isCorrect: true, position: true },
          },
        },
      },
    },
  },
} as const;

function mapPackQuestion(
  position: number,
  durationOverride: number | null,
  pointsOverride: number | null,
  question: {
    id: string;
    prompt: string;
    type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
    expectedAnswer: string | null;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    timeLimit: number;
    basePoints: number;
    keywords: string[];
    explanation: string | null;
    category: { id: string; name: string } | null;
    options: Array<{ id: string; text: string; isCorrect: boolean; position: number }>;
  },
): QuestionFeedRow {
  return {
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    expectedAnswer: question.expectedAnswer,
    difficulty: question.difficulty,
    categoryId: question.category?.id ?? null,
    categoryName: question.category?.name ?? 'عام',
    timeLimit: durationOverride ?? question.timeLimit,
    basePoints: pointsOverride ?? question.basePoints,
    keywords: question.keywords,
    explanation: question.explanation,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      isCorrect: option.isCorrect,
      position: option.position,
    })),
    position,
  };
}

export async function loadQuizPackQuestions(
  quizId: string,
  expectedGameMode: QuestionFeedGameMode,
  options?: { ownerId?: string; allowDraftQuestions?: boolean },
): Promise<QuestionFeedResult> {
  if (!hasDatabaseUrl()) {
    throw new QuestionFeedError('قاعدة البيانات غير مهيأة.', 'UNAVAILABLE');
  }

  const quiz = await getPrismaClient().quiz.findFirst({
    where: {
      id: quizId,
      status: { not: 'ARCHIVED' },
      ...(options?.ownerId ? { ownerId: options.ownerId } : {}),
    },
    select: PACK_SELECT,
  });

  if (!quiz) {
    throw new QuestionFeedError('لم نجد هذه الحزمة.', 'NOT_FOUND');
  }

  if (quiz.gameMode !== expectedGameMode) {
    throw new QuestionFeedError('وضع الحزمة لا يطابق هذه اللعبة.', 'MODE_MISMATCH');
  }

  const allowDraft = options?.allowDraftQuestions ?? false;
  const rows = quiz.questions
    .filter((item) => {
      if (allowDraft) return item.question.status !== 'ARCHIVED';
      return item.question.status === 'PUBLISHED';
    })
    .map((item) =>
      mapPackQuestion(
        item.position,
        item.durationOverride,
        item.pointsOverride,
        item.question,
      ),
    );

  if (rows.length === 0) {
    throw new QuestionFeedError('الحزمة لا تحتوي أسئلة صالحة لهذا الوضع.', 'EMPTY');
  }

  return {
    source: 'quiz-pack',
    gameMode: expectedGameMode,
    quizId: quiz.id,
    quizTitle: quiz.title,
    rows,
  };
}

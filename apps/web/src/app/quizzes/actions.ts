'use server';

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@tahaddi/database';
import {
  quizBuilderQuestionPageSchema,
  quizBuilderRandomSelectionSchema,
  quizBuilderSchema,
  type QuizBuilderInput,
  type QuizBuilderQuestionPageInput,
  type QuizBuilderRandomSelectionInput,
} from '@tahaddi/contracts';
import { revalidatePath } from 'next/cache';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import {
  ROLE_LABELS,
  canManageQuestions,
  isAppRole,
  isManagerRole,
} from '@/lib/auth/authorization';
import { requireActiveUser } from '@/lib/auth/session';
import {
  generateUniqueActivityRoomCode,
  isRoomCode,
  normalizeRoomCode,
} from '@/lib/quiz/room-code';
import type {
  AvailableBankQuestion,
  QuizBuilderGameMode,
  QuizBuilderQuestionPage,
  QuizBuilderRandomSelectionResult,
} from '@/lib/quizzes/quiz-draft';
import {
  selectRandomQuestionIds,
  selectRandomQuestionsByDifficulty,
  selectCategoryBalancedQuestions,
  QUIZ_DRAW_POINTS,
} from '@/lib/questions/random-selection';

export type QuizActionResult =
  | { status: 'success'; quizId: string; roomCode: string }
  | { status: 'error'; message: string; unavailableQuestionIds?: string[] };

export type CreateQuizInput = QuizBuilderInput;

const QUIZ_BUILDER_PAGE_SIZE = 40;

function buildQuizBuilderQuestionWhere({
  userId,
  canManage,
  gameMode,
  query,
  categoryId,
  difficulty,
}: {
  userId: string;
  canManage: boolean;
  gameMode: QuizBuilderGameMode;
  query: string;
  categoryId: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
}): Prisma.QuestionWhereInput {
  return {
    gameTypes: { has: gameMode },
    options: { some: {} },
    ...(canManage
      ? { status: { in: ['PUBLISHED', 'DRAFT'] } }
      : {
          OR: [
            { ownerId: userId, status: { in: ['PUBLISHED', 'DRAFT'] } },
            { status: 'PUBLISHED' },
          ],
        }),
    ...(categoryId ? { categoryId } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(query
      ? {
          AND: [
            {
              OR: [
                { prompt: { contains: query, mode: 'insensitive' } },
                { category: { name: { contains: query, mode: 'insensitive' } } },
              ],
            },
          ],
        }
      : {}),
  };
}

function mapBuilderQuestion(question: {
  id: string;
  prompt: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  gameTypes: string[];
  category: { name: string } | null;
  timeLimit: number;
  basePoints: number;
  version: number;
}): AvailableBankQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    category: question.category?.name ?? '',
    duration: question.timeLimit,
    points: question.basePoints,
    questionVersion: question.version,
    difficulty: question.difficulty,
    status: question.status,
    gameTypes: question.gameTypes.filter((game): game is QuizBuilderGameMode =>
      ['QUIZ', 'LADDER', 'CATEGORY_BOARD', 'LETTER_CHALLENGE', 'MILLIONAIRE'].includes(game),
    ),
  };
}

export async function listQuizBuilderQuestions(
  input: QuizBuilderQuestionPageInput,
): Promise<QuizBuilderQuestionPage> {
  const parsed = quizBuilderQuestionPageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'عوامل التصفية غير صالحة.',
    };
  }
  if (!hasDatabaseUrl()) {
    return { status: 'success', questions: [], categories: [], page: 1, pageCount: 1, total: 0 };
  }

  const user = await requireActiveUser('/quizzes/new');
  const filters = parsed.data;
  const where = buildQuizBuilderQuestionWhere({
    userId: user.id,
    canManage: canManageQuestions(user.role),
    gameMode: filters.gameMode,
    query: filters.query,
    categoryId: filters.categoryId,
    difficulty: filters.difficulty === 'ALL' ? undefined : filters.difficulty,
  });
  const prisma = getPrismaClient();

  try {
    const [questions, total, categories] = await Promise.all([
      prisma.question.findMany({
        where,
        orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
        skip: (filters.page - 1) * QUIZ_BUILDER_PAGE_SIZE,
        take: QUIZ_BUILDER_PAGE_SIZE,
        select: {
          id: true,
          prompt: true,
          status: true,
          difficulty: true,
          gameTypes: true,
          category: { select: { name: true } },
          timeLimit: true,
          basePoints: true,
          version: true,
        },
      }),
      prisma.question.count({ where }),
      prisma.category.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
    const pageCount = Math.max(1, Math.ceil(total / QUIZ_BUILDER_PAGE_SIZE));
    return {
      status: 'success',
      questions: questions.map(mapBuilderQuestion),
      categories,
      page: Math.min(filters.page, pageCount),
      pageCount,
      total,
    };
  } catch {
    return { status: 'error', message: 'تعذّر تحميل بنك الأسئلة الآن.' };
  }
}

export async function pickRandomQuizBuilderQuestions(
  input: QuizBuilderRandomSelectionInput,
): Promise<QuizBuilderRandomSelectionResult> {
  const parsed = quizBuilderRandomSelectionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'إعدادات السحب غير صالحة.',
    };
  }
  if (!hasDatabaseUrl()) {
    return { status: 'success', questions: [] };
  }

  const user = await requireActiveUser('/quizzes/new');
  const filters = parsed.data;
  const prisma = getPrismaClient();
  const diverse = filters.preset === 'DIVERSE_20';
  const where = buildQuizBuilderQuestionWhere({
    userId: user.id,
    canManage: canManageQuestions(user.role),
    gameMode: filters.gameMode,
    query: diverse ? '' : filters.query,
    categoryId: diverse ? '' : filters.categoryId,
  });

  try {
    const candidates = await prisma.question.findMany({
      where: { ...where, id: { notIn: filters.excludeIds ?? [] } },
      select: { id: true, difficulty: true, categoryId: true },
    });
    const selectedIds = diverse
      ? selectCategoryBalancedQuestions(candidates, randomUUID(), 20)
      : selectRandomQuestionsByDifficulty(candidates, filters.counts, randomUUID());
    const selected = await prisma.question.findMany({
      where: { ...where, id: { in: selectedIds } },
      select: {
        id: true,
        prompt: true,
        status: true,
        difficulty: true,
        gameTypes: true,
        category: { select: { name: true } },
        timeLimit: true,
        basePoints: true,
        version: true,
      },
    });
    const byId = new Map(selected.map((question) => [question.id, question]));
    return {
      status: 'success',
      questions: selectedIds.flatMap((id) => {
        const question = byId.get(id);
        return question
          ? [
              {
                ...mapBuilderQuestion(question),
                ...(diverse ? { points: QUIZ_DRAW_POINTS[question.difficulty] } : {}),
              },
            ]
          : [];
      }),
    };
  } catch {
    return { status: 'error', message: 'تعذّر السحب العشوائي الآن.' };
  }
}

export type PublicQuiz = {
  id: string;
  title: string;
  description: string | null;
  roomCode: string;
  ownerName: string | null;
  ownerIsManager: boolean;
  ownerRoleLabel: string | null;
  questionCount: number;
  createdAt: string;
};

export type PublicQuizzesResult =
  { status: 'success'; quizzes: PublicQuiz[] } | { status: 'error'; message: string; quizzes: [] };

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export async function joinQuizByCode(value: string): Promise<QuizActionResult> {
  const roomCode = normalizeRoomCode(value);
  if (!isRoomCode(roomCode)) {
    return {
      status: 'error',
      message: 'الرمز يجب أن يتكوّن من 6 إلى 8 أحرف أو أرقام صالحة.',
    };
  }

  if (!hasDatabaseUrl()) {
    return { status: 'error', message: 'خدمة المسابقات غير متاحة حاليًا.' };
  }

  try {
    const quiz = await getPrismaClient().quiz.findUnique({
      where: { roomCode },
      select: { id: true, roomCode: true, status: true },
    });

    if (!quiz || quiz.status !== 'ACTIVE') {
      return { status: 'error', message: 'لم نجد مسابقة نشطة بهذا الرمز.' };
    }

    return { status: 'success', quizId: quiz.id, roomCode: quiz.roomCode };
  } catch {
    return { status: 'error', message: 'تعذّر التحقق من رمز المسابقة الآن.' };
  }
}

export async function createQuiz(input: CreateQuizInput): Promise<QuizActionResult> {
  const parsed = quizBuilderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'بيانات المسابقة غير صالحة.',
    };
  }

  if (!hasDatabaseUrl()) {
    return { status: 'error', message: 'قاعدة البيانات غير مهيأة بعد.' };
  }

  const user = await requireActiveUser('/quizzes/new');
  const quizInput = parsed.data;
  const questionIds = quizInput.questions.map((question) => question.id);

  const prisma = getPrismaClient();
  try {
    const availableQuestions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
        ...buildQuizBuilderQuestionWhere({
          userId: user.id,
          canManage: canManageQuestions(user.role),
          gameMode: quizInput.gameMode,
          query: '',
          categoryId: '',
        }),
      },
      select: { id: true, version: true },
    });

    if (availableQuestions.length !== questionIds.length) {
      const availableIds = new Set(availableQuestions.map((question) => question.id));
      return {
        status: 'error',
        message:
          'بعض الأسئلة المحددة غير متوافقة مع وضع اللعب، أو لم تعد متاحة بإجابات. راجع الأسئلة المشار إليها ثم أعد النشر.',
        unavailableQuestionIds: questionIds.filter((id) => !availableIds.has(id)),
      };
    }
    const questionVersions = new Map(
      availableQuestions.map((question) => [question.id, question.version]),
    );
    if (
      quizInput.questions.some(
        (question) =>
          question.questionVersion != null &&
          questionVersions.get(question.id) !== question.questionVersion,
      )
    ) {
      return {
        status: 'error',
        message: 'تغيّر أحد الأسئلة منذ إضافته. راجع الأسئلة المحددة قبل الحفظ.',
      };
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const roomCode = await generateUniqueActivityRoomCode(prisma);
      const orderedQuestions =
        quizInput.presentationMode === 'RANDOM'
          ? selectRandomQuestionIds(questionIds, roomCode, questionIds.length).map((id) =>
              quizInput.questions.find((question) => question.id === id)!,
            )
          : quizInput.questions;
      try {
        const quiz = await prisma.quiz.create({
          data: {
            title: quizInput.title,
            description: quizInput.description || undefined,
            roundName: quizInput.roundName || undefined,
            presentationMode: quizInput.presentationMode,
            ownerId: user.id,
            roomCode,
            status: 'ACTIVE',
            isPublic: quizInput.visibility === 'PUBLIC',
            gameMode: quizInput.gameMode,
            maxPlayers: quizInput.playerLimit,
            autoLockAnswers: quizInput.autoLockAnswers,
            autoAdvance: quizInput.autoAdvance,
            speedScoring: quizInput.speedScoring,
            questions: {
              create: orderedQuestions.map((question, position) => ({
                questionId: question.id,
                position,
                durationOverride: question.duration,
                pointsOverride: question.points,
                questionVersion: questionVersions.get(question.id)!,
              })),
            },
          },
          select: { id: true, roomCode: true },
        });

        revalidatePath('/quizzes');
        revalidatePath('/quizzes/new');
        revalidatePath('/');
        return { status: 'success', quizId: quiz.id, roomCode: quiz.roomCode };
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    return { status: 'error', message: 'تعذّر إنشاء رمز غرفة فريد. حاول مرة أخرى.' };
  } catch {
    return { status: 'error', message: 'تعذّر حفظ المسابقة الآن. حاول مرة أخرى.' };
  }
}

export async function getPublicQuizzes(limit = 6): Promise<PublicQuizzesResult> {
  if (!hasDatabaseUrl()) {
    return { status: 'success', quizzes: [] };
  }

  try {
    const take = Math.min(24, Math.max(1, Math.trunc(limit) || 6));
    const quizzes = await getPrismaClient().quiz.findMany({
      where: { isPublic: true, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        title: true,
        description: true,
        roomCode: true,
        createdAt: true,
        owner: { select: { name: true, role: true } },
        _count: { select: { questions: true } },
      },
    });

    return {
      status: 'success',
      quizzes: quizzes.map((quiz) => {
        const ownerIsManager = isManagerRole(quiz.owner.role);
        return {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          roomCode: quiz.roomCode,
          ownerName: quiz.owner.name,
          ownerIsManager,
          ownerRoleLabel:
            ownerIsManager && isAppRole(quiz.owner.role) ? ROLE_LABELS[quiz.owner.role] : null,
          questionCount: quiz._count.questions,
          createdAt: quiz.createdAt.toISOString(),
        };
      }),
    };
  } catch {
    return {
      status: 'error',
      message: 'تعذّر تحميل المسابقات العامة الآن.',
      quizzes: [],
    };
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'node:crypto';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requireActiveUser } from '@/lib/auth/session';
import {
  advanceLiveSessionManually,
  calculateTimedScore,
  scheduleAutoAdvanceIfComplete,
} from '@/lib/live/engine';
import { resolveQuizQuestion } from '@/lib/live/resolve-quiz-question';
import { isClassicLiveQuizMode } from '@/lib/live/classic-quiz-mode';
import { createPlayerLiveAccessToken } from '@/lib/live/access-token';
import { setMafiaAccessToken } from '@/lib/mafia/access-cookie';
import { isRoomCode, normalizeRoomCode } from '@/lib/quiz/room-code';
import {
  consumeQuota,
  getActivePlanCode,
  limitFor,
  planBypassesLimits,
  refundQuota,
  type QuotaConsumption,
} from '@/lib/subscription/entitlements';
import type { PlanCode } from '@tahaddi/domain';

const MAX_PLAYER_NAME_LENGTH = 40;

export type JoinLiveSessionResult =
  | {
      status: 'success';
      gameType: 'quiz';
      sessionId: string;
      participantId: string;
      participantToken: string;
      roomCode: string;
    }
  | {
      status: 'success';
      gameType: 'mafia';
      sessionId: string;
      participantId: string;
      roomCode: string;
    }
  | { status: 'error'; message: string };

function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_PLAYER_NAME_LENGTH);
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

function requireDatabaseReady() {
  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is required for live sessions.');
  }
}

export async function publishQuiz(formData: FormData) {
  requireDatabaseReady();
  const quizId = String(formData.get('quizId') ?? '');
  const user = await requireActiveUser('/quizzes');
  const prisma = getPrismaClient();

  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, ownerId: user.id, status: { not: 'ARCHIVED' } },
    select: { id: true, _count: { select: { questions: true } } },
  });

  if (!quiz || quiz._count.questions === 0) {
    redirect('/quizzes?liveError=publish');
  }

  await prisma.quiz.update({
    where: { id: quiz.id },
    data: { status: 'ACTIVE', isPublic: true },
  });

  revalidatePath('/quizzes');
  revalidatePath('/');
  redirect('/host');
}

export async function startLiveSession(formData: FormData) {
  requireDatabaseReady();
  const quizId = String(formData.get('quizId') ?? '');
  const user = await requireActiveUser('/host');
  const prisma = getPrismaClient();

  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, ownerId: user.id, status: { not: 'ARCHIVED' } },
    select: {
      id: true,
      roomCode: true,
      gameMode: true,
      maxPlayers: true,
      _count: { select: { questions: true } },
    },
  });

  if (!quiz || quiz._count.questions === 0) {
    redirect('/host?liveError=quiz');
  }

  if (!isClassicLiveQuizMode(quiz.gameMode)) {
    redirect('/host?liveError=gameMode');
  }

  const optionlessCount = await prisma.quizQuestion.count({
    where: { quizId: quiz.id, question: { options: { none: {} } } },
  });
  if (optionlessCount > 0) {
    redirect(`/host?liveError=quizOptions&count=${optionlessCount}`);
  }

  let planCode: PlanCode = 'SPECTATOR';
  let roomPlayerLimit = limitFor(planCode, 'maxRoomPlayers');
  try {
    planCode = await getActivePlanCode(prisma, user.id);
    roomPlayerLimit = limitFor(planCode, 'maxRoomPlayers');
  } catch (error) {
    console.error('[live] failed to resolve the active plan for quota checks', error);
    redirect('/host?liveError=quota');
  }

  // طاقم الإدارة يعمل بلا حدود: لا يخضع لسقف سعة الغرفة.
  if (!planBypassesLimits(user.role) && quiz.maxPlayers > roomPlayerLimit) {
    redirect(`/orders?roomLimit=${roomPlayerLimit}&quizMax=${quiz.maxPlayers}&plan=${planCode}`);
  }

  const ongoing = await prisma.liveSession.findFirst({
    where: { quizId: quiz.id, hostId: user.id, status: { in: ['WAITING', 'ACTIVE'] } },
    select: { id: true },
  });
  let quotaConsumed = false;
  if (!ongoing) {
    let roomsQuota: QuotaConsumption;
    try {
      roomsQuota = await consumeQuota(user.id, 'maxLiveRoomsPerMonth', user.role);
    } catch (error) {
      console.error('[live] failed to consume the live rooms quota', error);
      redirect('/host?liveError=quota');
    }
    if (!roomsQuota.ok) {
      redirect(
        `/orders?quotaReached=1&plan=${planCode}&used=${roomsQuota.used}&limit=${roomsQuota.limit}`,
      );
    }
    quotaConsumed = !roomsQuota.unlimited;
  }

  const { session, created } = await prisma.$transaction(async (tx) => {
    await tx.quiz.update({
      where: { id: quiz.id },
      data: { status: 'ACTIVE', isPublic: true },
    });

    const existing = await tx.liveSession.findFirst({
      where: {
        quizId: quiz.id,
        hostId: user.id,
        status: { in: ['WAITING', 'ACTIVE'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (existing) {
      return { session: existing, created: false };
    }

    return {
      session: await tx.liveSession.create({
        data: {
          quizId: quiz.id,
          hostId: user.id,
          roomCode: quiz.roomCode,
          status: 'WAITING',
        },
        select: { id: true },
      }),
      created: true,
    };
  })
    .catch(async (error: unknown) => {
      if (quotaConsumed) {
        await refundQuota(user.id, 'maxLiveRoomsPerMonth').catch(() => undefined);
      }
      throw error;
    });

  if (quotaConsumed && !created) {
    await refundQuota(user.id, 'maxLiveRoomsPerMonth');
  }

  revalidatePath('/host');
  revalidatePath('/broadcast');
  revalidatePath('/quizzes');
  revalidatePath('/');
  redirect(`/host?sessionId=${session.id}`);
}

export async function advanceLiveQuestion(formData: FormData) {
  requireDatabaseReady();
  const sessionId = String(formData.get('sessionId') ?? '');
  const user = await requireActiveUser('/host');
  await advanceLiveSessionManually(sessionId, user.id);

  revalidatePath('/host');
  revalidatePath('/broadcast');
  revalidatePath(`/live/${sessionId}/play`);
  redirect(`/host?sessionId=${sessionId}`);
}

export async function finishLiveSession(formData: FormData) {
  requireDatabaseReady();
  const sessionId = String(formData.get('sessionId') ?? '');
  const user = await requireActiveUser('/host');

  await getPrismaClient().liveSession.updateMany({
    where: { id: sessionId, hostId: user.id, status: { not: 'FINISHED' } },
    data: { status: 'FINISHED', endedAt: new Date() },
  });

  revalidatePath('/host');
  revalidatePath('/broadcast');
  redirect('/host');
}

export async function joinLiveSessionByCode(
  roomCodeValue: string,
  playerNameValue: string,
): Promise<JoinLiveSessionResult> {
  const roomCode = normalizeRoomCode(roomCodeValue);
  const displayName = normalizePlayerName(playerNameValue);

  if (!isRoomCode(roomCode)) {
    return { status: 'error', message: 'الرمز يجب أن يتكوّن من 6 إلى 8 أحرف أو أرقام صالحة.' };
  }
  if (displayName.length < 2) {
    return { status: 'error', message: 'اكتب اسمًا من حرفين على الأقل للانضمام.' };
  }
  if (!hasDatabaseUrl()) {
    return { status: 'error', message: 'خدمة الجلسات المباشرة غير متاحة حاليًا.' };
  }

  try {
    const prisma = getPrismaClient();
    const session = await prisma.liveSession.findFirst({
      where: { roomCode, status: { in: ['WAITING', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        roomCode: true,
        quiz: { select: { maxPlayers: true } },
        _count: { select: { participants: true } },
      },
    });

    if (session) {
      if (session._count.participants >= session.quiz.maxPlayers) {
        return { status: 'error', message: 'اكتمل عدد اللاعبين المسموح به في هذه الغرفة.' };
      }

      const participant = await prisma.liveParticipant.create({
        data: { sessionId: session.id, displayName },
        select: { id: true },
      });

      revalidatePath(`/live/${session.id}/play`);
      revalidatePath('/broadcast');
      return {
        status: 'success',
        gameType: 'quiz',
        sessionId: session.id,
        participantId: participant.id,
        participantToken: createPlayerLiveAccessToken(session.id, participant.id),
        roomCode: session.roomCode,
      };
    }

    const mafiaJoin = await prisma.$transaction(async (tx) => {
      const [mafiaGame] = await tx.$queryRaw<
        Array<{ id: string; roomCode: string; status: string; maxPlayers: number }>
      >`SELECT "id", "roomCode", "status"::text, "maxPlayers"
        FROM "MafiaGame"
        WHERE "roomCode" = ${roomCode}
        FOR UPDATE`;

      if (!mafiaGame || mafiaGame.status !== 'LOBBY') {
        return { status: 'closed' } as const;
      }

      const participantCount = await tx.mafiaParticipant.count({
        where: { gameId: mafiaGame.id },
      });
      if (participantCount >= mafiaGame.maxPlayers) {
        return { status: 'full' } as const;
      }

      const participant = await tx.mafiaParticipant.create({
        data: {
          gameId: mafiaGame.id,
          displayName,
          accessToken: randomBytes(24).toString('hex'),
        },
        select: { id: true, accessToken: true },
      });

      return { status: 'success', mafiaGame, participant } as const;
    });

    if (mafiaJoin.status === 'closed') {
      return { status: 'error', message: 'لم نجد غرفة مفتوحة بهذا الرمز.' };
    }
    if (mafiaJoin.status === 'full') {
      return { status: 'error', message: 'اكتمل عدد اللاعبين المسموح به في هذه الغرفة.' };
    }

    await setMafiaAccessToken(mafiaJoin.mafiaGame.id, mafiaJoin.participant.accessToken);
    revalidatePath(`/mafia/${mafiaJoin.mafiaGame.id}`);
    return {
      status: 'success',
      gameType: 'mafia',
      sessionId: mafiaJoin.mafiaGame.id,
      participantId: mafiaJoin.participant.id,
      roomCode: mafiaJoin.mafiaGame.roomCode,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: 'error', message: 'هذا الاسم مستخدم في الغرفة. اختر اسمًا آخر.' };
    }
    return { status: 'error', message: 'تعذّر الانضمام الآن. حاول مرة أخرى.' };
  }
}

export async function submitLiveAnswer(formData: FormData) {
  requireDatabaseReady();
  const sessionId = String(formData.get('sessionId') ?? '');
  const participantId = String(formData.get('participantId') ?? '');
  const questionId = String(formData.get('questionId') ?? '');
  const optionId = String(formData.get('optionId') ?? '');
  const prisma = getPrismaClient();

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      currentQuestionPosition: true,
      questionStartedAt: true,
      quiz: {
        select: {
          speedScoring: true,
          questions: {
            orderBy: { position: 'asc' },
            select: {
              durationOverride: true,
              pointsOverride: true,
              question: {
                select: {
                  id: true,
                  basePoints: true,
                  timeLimit: true,
                  options: { select: { id: true, isCorrect: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const quizQuestion = session?.quiz.questions[session.currentQuestionPosition];
  const currentQuestion = quizQuestion ? resolveQuizQuestion(quizQuestion) : null;
  if (!session || session.status === 'FINISHED' || currentQuestion?.id !== questionId) {
    redirect(`/live/${sessionId}/play?participantId=${participantId}&answer=closed`);
  }

  const option = currentQuestion.options.find((item) => item.id === optionId);
  if (!option) {
    redirect(`/live/${sessionId}/play?participantId=${participantId}&answer=invalid`);
  }

  const receivedAt = new Date();
  const earnedPoints = option.isCorrect
    ? calculateTimedScore({
        basePoints: currentQuestion.basePoints,
        timeLimitSeconds: currentQuestion.timeLimit,
        questionStartedAt: session.questionStartedAt,
        receivedAt,
        speedScoring: session.quiz.speedScoring,
      })
    : 0;

  try {
    await prisma.$transaction(async (tx) => {
      const participant = await tx.liveParticipant.findFirst({
        where: { id: participantId, sessionId },
        select: { id: true },
      });
      if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');

      await tx.liveAnswer.create({
        data: {
          sessionId,
          participantId,
          questionId,
          optionId,
          isCorrect: option.isCorrect,
          earnedPoints,
          receivedAt,
        },
      });

      await tx.liveParticipant.update({
        where: { id: participantId },
        data: {
          score: { increment: earnedPoints },
          correctCount: { increment: option.isCorrect ? 1 : 0 },
        },
      });
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      redirect(`/live/${sessionId}/play?participantId=${participantId}&answer=error`);
    }
  }

  await scheduleAutoAdvanceIfComplete(sessionId, questionId);
  revalidatePath(`/live/${sessionId}/play`);
  revalidatePath('/broadcast');
  redirect(`/live/${sessionId}/play?participantId=${participantId}&answer=saved`);
}

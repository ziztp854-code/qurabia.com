import { getPrismaClient } from '@/lib/auth/prisma';

export const LIVE_ACTIVE_WINDOW_MS = 15_000;
export const LIVE_REVEAL_DELAY_MS = 3_000;

export function getLiveActiveCutoff() {
  return new Date(Date.now() - LIVE_ACTIVE_WINDOW_MS);
}

export function calculateLiveQuestionProgress({
  participants,
  answers,
  questionId,
  questionStartedAt,
}: {
  participants: { id: string; joinedAt: Date }[];
  answers: { participantId: string; questionId: string }[];
  questionId: string | null | undefined;
  questionStartedAt: Date | null;
}) {
  if (!questionId) return { answeredCount: 0, participantCount: 0 };

  const participantIds = new Set(
    participants
      .filter((participant) => !questionStartedAt || participant.joinedAt <= questionStartedAt)
      .map((participant) => participant.id),
  );
  const answeredParticipantIds = new Set(
    answers
      .filter(
        (answer) => answer.questionId === questionId && participantIds.has(answer.participantId),
      )
      .map((answer) => answer.participantId),
  );

  return {
    answeredCount: answeredParticipantIds.size,
    participantCount: participantIds.size,
  };
}

export function calculateTimedScore({
  basePoints,
  timeLimitSeconds,
  questionStartedAt,
  receivedAt,
  speedScoring,
}: {
  basePoints: number;
  timeLimitSeconds: number;
  questionStartedAt: Date | null;
  receivedAt: Date;
  speedScoring: boolean;
}) {
  if (!speedScoring || !questionStartedAt) return basePoints;

  const durationMs = Math.max(1_000, timeLimitSeconds * 1_000);
  const elapsedMs = Math.max(0, receivedAt.getTime() - questionStartedAt.getTime());
  const remainingRatio = Math.max(0, Math.min(1, 1 - elapsedMs / durationMs));
  return Math.round(basePoints * (0.5 + remainingRatio * 0.5));
}

export async function markLiveParticipantSeen(sessionId: string, participantId: string) {
  if (!participantId) return;
  await getPrismaClient().liveParticipant.updateMany({
    where: { id: participantId, sessionId },
    data: { status: 'CONNECTED', lastSeenAt: new Date() },
  });
}

export async function scheduleAutoAdvanceIfComplete(sessionId: string, questionId: string) {
  const prisma = getPrismaClient();
  const now = new Date();
  const activeSince = new Date(now.getTime() - LIVE_ACTIVE_WINDOW_MS);
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      currentQuestionPosition: true,
      questionStartedAt: true,
      questionAdvanceAt: true,
      quiz: {
        select: {
          autoAdvance: true,
          questions: {
            orderBy: { position: 'asc' },
            select: { questionId: true },
          },
        },
      },
    },
  });

  const currentQuestionId =
    session?.quiz.questions[session.currentQuestionPosition]?.questionId ?? null;
  if (
    !session ||
    session.status !== 'ACTIVE' ||
    !session.quiz.autoAdvance ||
    session.questionAdvanceAt ||
    currentQuestionId !== questionId
  ) {
    return false;
  }

  const participantWhere = {
    sessionId,
    status: 'CONNECTED' as const,
    lastSeenAt: { gte: activeSince },
    ...(session.questionStartedAt ? { joinedAt: { lte: session.questionStartedAt } } : {}),
  };
  const [activeCount, answeredCount] = await Promise.all([
    prisma.liveParticipant.count({ where: participantWhere }),
    prisma.liveAnswer.count({
      where: {
        sessionId,
        questionId,
        participant: participantWhere,
      },
    }),
  ]);

  if (activeCount === 0 || answeredCount < activeCount) return false;

  const result = await prisma.liveSession.updateMany({
    where: {
      id: sessionId,
      status: 'ACTIVE',
      currentQuestionPosition: session.currentQuestionPosition,
      questionAdvanceAt: null,
    },
    data: { questionAdvanceAt: new Date(now.getTime() + LIVE_REVEAL_DELAY_MS) },
  });
  return result.count > 0;
}

export async function advanceLiveSessionIfDue(sessionId: string) {
  const prisma = getPrismaClient();
  const now = new Date();
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      currentQuestionPosition: true,
      questionAdvanceAt: true,
      quiz: {
        select: {
          autoAdvance: true,
          questions: {
            orderBy: { position: 'asc' },
            select: { questionId: true },
          },
          _count: { select: { questions: true } },
        },
      },
    },
  });

  if (!session || session.status !== 'ACTIVE' || !session.quiz.autoAdvance) {
    return false;
  }
  if (!session.questionAdvanceAt) {
    const currentQuestionId = session.quiz.questions[session.currentQuestionPosition]?.questionId;
    return currentQuestionId ? scheduleAutoAdvanceIfComplete(sessionId, currentQuestionId) : false;
  }
  if (session.questionAdvanceAt > now) return false;

  const isLastQuestion =
    session.currentQuestionPosition >= Math.max(0, session.quiz._count.questions - 1);
  const result = await prisma.liveSession.updateMany({
    where: {
      id: sessionId,
      status: 'ACTIVE',
      currentQuestionPosition: session.currentQuestionPosition,
      questionAdvanceAt: { lte: now },
    },
    data: isLastQuestion
      ? {
          status: 'FINISHED',
          endedAt: now,
          questionAdvanceAt: null,
        }
      : {
          currentQuestionPosition: { increment: 1 },
          questionStartedAt: now,
          questionAdvanceAt: null,
        },
  });
  return result.count > 0;
}

export async function advanceLiveSessionManually(sessionId: string, hostId: string) {
  const prisma = getPrismaClient();
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, hostId, status: 'ACTIVE' },
    select: {
      currentQuestionPosition: true,
      quiz: { select: { _count: { select: { questions: true } } } },
    },
  });
  if (!session) return false;

  const now = new Date();
  const isLastQuestion =
    session.currentQuestionPosition >= Math.max(0, session.quiz._count.questions - 1);
  const result = await prisma.liveSession.updateMany({
    where: {
      id: sessionId,
      hostId,
      status: 'ACTIVE',
      currentQuestionPosition: session.currentQuestionPosition,
    },
    data: isLastQuestion
      ? { status: 'FINISHED', endedAt: now, questionAdvanceAt: null }
      : {
          currentQuestionPosition: { increment: 1 },
          questionStartedAt: now,
          questionAdvanceAt: null,
        },
  });
  return result.count > 0;
}

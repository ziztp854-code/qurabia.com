import 'server-only';

import {
  ANSWER_ACCEPT_GRACE_MS,
  type AnswerRejectionReason,
  type GameSnapshot,
  type LiveRole,
  type PlayerInfo,
  type QuestionStatsPayload,
} from '@tahaddi/contracts';
import type { Prisma } from '@tahaddi/database';
import { getPrismaClient } from '@/lib/auth/prisma';
import {
  LIVE_ACTIVE_WINDOW_MS,
  LIVE_REVEAL_DELAY_MS,
  advanceLiveSessionIfDue,
  advanceLiveSessionManually,
  calculateLiveQuestionProgress,
  calculateTimedScore,
  markLiveParticipantSeen,
  scheduleAutoAdvanceIfComplete,
} from './engine';
import { deriveHttpGamePhase } from './http-phase';
import { resolveQuizQuestion } from './resolve-quiz-question';

export type HttpLiveIdentity = {
  sessionId: string;
  subjectId: string;
  role: LiveRole;
};

export type HttpLiveState = {
  snapshot: GameSnapshot;
  stats: QuestionStatsPayload | null;
};

const liveSessionSelect = {
  id: true,
  hostId: true,
  roomCode: true,
  status: true,
  currentQuestionPosition: true,
  questionStartedAt: true,
  questionAdvanceAt: true,
  quiz: {
    select: {
      autoAdvance: true,
      speedScoring: true,
      questions: {
        orderBy: { position: 'asc' as const },
        select: {
          durationOverride: true,
          pointsOverride: true,
          question: {
            select: {
              id: true,
              prompt: true,
              imageUrl: true,
              explanation: true,
              timeLimit: true,
              basePoints: true,
              options: {
                orderBy: { position: 'asc' as const },
                select: { id: true, text: true, position: true, isCorrect: true },
              },
            },
          },
        },
      },
    },
  },
  participants: {
    orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
    select: {
      id: true,
      displayName: true,
      score: true,
      correctCount: true,
      status: true,
      joinedAt: true,
      lastSeenAt: true,
    },
  },
  answers: {
    select: {
      participantId: true,
      questionId: true,
      optionId: true,
      isCorrect: true,
      earnedPoints: true,
      receivedAt: true,
    },
  },
} satisfies Prisma.LiveSessionSelect;

async function loadLiveSession(sessionId: string) {
  return getPrismaClient().liveSession.findUnique({
    where: { id: sessionId },
    select: liveSessionSelect,
  });
}

function isValidIdentity(
  session: NonNullable<Awaited<ReturnType<typeof loadLiveSession>>>,
  identity: HttpLiveIdentity,
) {
  if (identity.role === 'host') return session.hostId === identity.subjectId;
  return session.participants.some((participant) => participant.id === identity.subjectId);
}

function toLeaderboard(
  session: NonNullable<Awaited<ReturnType<typeof loadLiveSession>>>,
): PlayerInfo[] {
  return session.participants.map((participant, index) => ({
    id: participant.id,
    name: participant.displayName,
    score: participant.score,
    streak: 0,
    rank: index + 1,
    correctAnswers: participant.correctCount,
  }));
}

function buildStats(
  session: NonNullable<Awaited<ReturnType<typeof loadLiveSession>>>,
  question: NonNullable<
    NonNullable<Awaited<ReturnType<typeof loadLiveSession>>>['quiz']['questions'][number]
  >['question'],
): QuestionStatsPayload {
  const progress = calculateLiveQuestionProgress({
    participants: session.participants,
    answers: session.answers,
    questionId: question.id,
    questionStartedAt: session.questionStartedAt,
  });
  const optionCounts = new Map(question.options.map((option) => [option.id, 0]));
  for (const answer of session.answers) {
    if (answer.questionId === question.id && optionCounts.has(answer.optionId)) {
      optionCounts.set(answer.optionId, (optionCounts.get(answer.optionId) ?? 0) + 1);
    }
  }

  return {
    questionId: question.id,
    answeredCount: progress.answeredCount,
    participantCount: progress.participantCount,
    options: question.options.map((option) => {
      const count = optionCounts.get(option.id) ?? 0;
      return {
        optionId: option.id,
        count,
        percentage:
          progress.answeredCount > 0 ? Math.round((count / progress.answeredCount) * 100) : 0,
      };
    }),
  };
}

async function prepareLiveSession(sessionId: string) {
  await advanceLiveSessionIfDue(sessionId);
  let session = await loadLiveSession(sessionId);
  const quizQuestion = session?.quiz.questions[session.currentQuestionPosition];
  const question = quizQuestion ? resolveQuizQuestion(quizQuestion) : null;

  if (
    session?.status === 'ACTIVE' &&
    session.quiz.autoAdvance &&
    question &&
    session.questionStartedAt &&
    !session.questionAdvanceAt &&
    Date.now() >= session.questionStartedAt.getTime() + question.timeLimit * 1_000
  ) {
    await getPrismaClient().liveSession.updateMany({
      where: {
        id: session.id,
        status: 'ACTIVE',
        currentQuestionPosition: session.currentQuestionPosition,
        questionAdvanceAt: null,
      },
      data: { questionAdvanceAt: new Date(Date.now() + LIVE_REVEAL_DELAY_MS) },
    });
    session = await loadLiveSession(sessionId);
  }

  return session;
}

export async function getHttpLiveState(identity: HttpLiveIdentity): Promise<HttpLiveState | null> {
  if (identity.role === 'player') {
    await markLiveParticipantSeen(identity.sessionId, identity.subjectId);
  }
  const session = await prepareLiveSession(identity.sessionId);
  if (!session || !isValidIdentity(session, identity)) return null;

  const quizQuestion = session.quiz.questions[session.currentQuestionPosition];
  const question = quizQuestion ? resolveQuizQuestion(quizQuestion) : null;
  const questionStartedAt = session.questionStartedAt?.getTime() ?? null;
  const questionEndsAt =
    question && questionStartedAt ? questionStartedAt + question.timeLimit * 1_000 : null;
  const stats = question ? buildStats(session, question) : null;
  const allAnswered = Boolean(
    stats && stats.participantCount > 0 && stats.answeredCount >= stats.participantCount,
  );
  const phase = deriveHttpGamePhase({
    status: session.status,
    questionStartedAt,
    questionEndsAt,
    questionAdvanceAt: session.questionAdvanceAt?.getTime() ?? null,
    allAnswered,
    now: Date.now(),
  });
  const leaderboard = toLeaderboard(session);
  const playerAnswer =
    identity.role === 'player' && question
      ? session.answers.find(
          (answer) =>
            answer.participantId === identity.subjectId && answer.questionId === question.id,
        )
      : null;
  const playerRank = leaderboard.find((player) => player.id === identity.subjectId)?.rank ?? 0;
  const participant = session.participants.find((player) => player.id === identity.subjectId);
  const playerResult =
    playerAnswer && phase === 'REVEAL'
      ? {
          optionId: playerAnswer.optionId,
          correct: playerAnswer.isCorrect,
          earnedPoints: playerAnswer.earnedPoints,
          totalScore: participant?.score ?? 0,
          rank: playerRank,
        }
      : null;
  const reveal =
    question && phase === 'REVEAL'
      ? {
          questionId: question.id,
          correctOptionId: question.options.find((option) => option.isCorrect)?.id ?? '',
          explanation: question.explanation,
          stats: stats!,
          playerResult,
        }
      : null;
  const activeCutoff = Date.now() - LIVE_ACTIVE_WINDOW_MS;
  const participantCount = session.participants.filter(
    (player) => player.status === 'CONNECTED' && player.lastSeenAt.getTime() >= activeCutoff,
  ).length;

  return {
    snapshot: {
      sessionId: session.id,
      roomCode: session.roomCode,
      phase,
      serverTime: Date.now(),
      question:
        question && phase !== 'LOBBY' && phase !== 'FINISHED'
          ? {
              questionId: question.id,
              prompt: question.prompt,
              options: question.options.map((option) => ({
                id: option.id,
                text: option.text,
                position: option.position,
              })),
              media: question.imageUrl
                ? [{ type: 'image' as const, url: question.imageUrl, alt: question.prompt }]
                : [],
              questionStartedAt: questionStartedAt!,
              questionEndsAt: questionEndsAt!,
              questionNumber: session.currentQuestionPosition + 1,
              totalQuestions: session.quiz.questions.length,
            }
          : null,
      reveal,
      leaderboard: identity.role === 'host' || phase === 'FINISHED' ? leaderboard : [],
      participantCount,
      playerAnswer: playerAnswer
        ? { optionId: playerAnswer.optionId, receivedAt: playerAnswer.receivedAt.getTime() }
        : null,
      playerResult,
    },
    stats: identity.role === 'host' ? stats : (reveal?.stats ?? null),
  };
}

export async function startHttpLiveQuestion(identity: HttpLiveIdentity) {
  if (identity.role !== 'host') return false;
  const startedAt = new Date(Date.now() + 350);
  const result = await getPrismaClient().liveSession.updateMany({
    where: {
      id: identity.sessionId,
      hostId: identity.subjectId,
      status: 'WAITING',
    },
    data: {
      status: 'ACTIVE',
      startedAt,
      questionStartedAt: startedAt,
      questionAdvanceAt: null,
    },
  });
  return result.count > 0;
}

export async function nextHttpLiveQuestion(identity: HttpLiveIdentity) {
  if (identity.role !== 'host') return false;
  const state = await getHttpLiveState(identity);
  if (state?.snapshot.phase !== 'REVEAL') return false;
  return advanceLiveSessionManually(identity.sessionId, identity.subjectId);
}

export async function finishHttpLiveGame(identity: HttpLiveIdentity) {
  if (identity.role !== 'host') return false;
  const result = await getPrismaClient().liveSession.updateMany({
    where: {
      id: identity.sessionId,
      hostId: identity.subjectId,
      status: { not: 'FINISHED' },
    },
    data: {
      status: 'FINISHED',
      endedAt: new Date(),
      questionAdvanceAt: null,
    },
  });
  return result.count > 0;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export async function submitHttpLiveAnswer(
  identity: HttpLiveIdentity,
  input: { questionId: string; optionId: string; receivedAt?: Date },
): Promise<{ ok: true } | { ok: false; reason: AnswerRejectionReason }> {
  const receivedAt = input.receivedAt ?? new Date();
  if (identity.role !== 'player') return { ok: false, reason: 'INVALID_PLAYER' };
  const session = await prepareLiveSession(identity.sessionId);
  if (!session) return { ok: false, reason: 'INVALID_SESSION' };
  if (!isValidIdentity(session, identity)) return { ok: false, reason: 'INVALID_PLAYER' };

  const quizQuestion = session.quiz.questions[session.currentQuestionPosition];
  const question = quizQuestion ? resolveQuizQuestion(quizQuestion) : null;
  if (!question || question.id !== input.questionId) {
    return { ok: false, reason: 'QUESTION_MISMATCH' };
  }
  const stats = buildStats(session, question);
  const questionStartedAt = session.questionStartedAt?.getTime() ?? null;
  const questionEndsAt = questionStartedAt ? questionStartedAt + question.timeLimit * 1_000 : null;
  const phase = deriveHttpGamePhase({
    status: session.status,
    questionStartedAt,
    questionEndsAt,
    questionAdvanceAt: session.questionAdvanceAt?.getTime() ?? null,
    allAnswered: stats.participantCount > 0 && stats.answeredCount >= stats.participantCount,
    now: receivedAt.getTime(),
  });
  if (phase !== 'QUESTION') return { ok: false, reason: 'QUESTION_NOT_ACTIVE' };

  const option = question.options.find((item) => item.id === input.optionId);
  if (!option) return { ok: false, reason: 'INVALID_OPTION' };
  if (
    !questionStartedAt ||
    receivedAt.getTime() < questionStartedAt - ANSWER_ACCEPT_GRACE_MS
  ) {
    return { ok: false, reason: 'QUESTION_NOT_ACTIVE' };
  }
  if (!questionEndsAt || receivedAt.getTime() > questionEndsAt) {
    return { ok: false, reason: 'ANSWER_TOO_LATE' };
  }
  const earnedPoints = option.isCorrect
    ? calculateTimedScore({
        basePoints: question.basePoints,
        timeLimitSeconds: question.timeLimit,
        questionStartedAt: session.questionStartedAt,
        receivedAt,
        speedScoring: session.quiz.speedScoring,
      })
    : 0;

  try {
    await getPrismaClient().$transaction(async (transaction) => {
      await transaction.liveAnswer.create({
        data: {
          sessionId: session.id,
          participantId: identity.subjectId,
          questionId: question.id,
          optionId: option.id,
          isCorrect: option.isCorrect,
          earnedPoints,
          receivedAt,
        },
      });
      await transaction.liveParticipant.update({
        where: { id: identity.subjectId },
        data: {
          lastSeenAt: receivedAt,
          score: { increment: earnedPoints },
          correctCount: option.isCorrect ? { increment: 1 } : undefined,
        },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, reason: 'DUPLICATE_ANSWER' };
    }
    throw error;
  }

  await scheduleAutoAdvanceIfComplete(session.id, question.id);
  return { ok: true };
}

import { getPrismaClient } from '@/lib/auth/prisma';
import type { MobileRoomsRepository } from './service';

type PrismaClient = ReturnType<typeof getPrismaClient>;

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export function createPrismaMobileRoomsRepository(
  prisma: PrismaClient = getPrismaClient(),
): MobileRoomsRepository {
  return {
    async listHostQuizzes(userId) {
      const quizzes = await prisma.quiz.findMany({
        where: { ownerId: userId, status: { not: 'ARCHIVED' }, gameMode: 'QUIZ' },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          title: true,
          roomCode: true,
          maxPlayers: true,
          _count: { select: { questions: true } },
          liveSessions: {
            where: { status: { in: ['WAITING', 'ACTIVE'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true },
          },
        },
      });
      return quizzes.map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        roomCode: quiz.roomCode,
        maxPlayers: quiz.maxPlayers,
        questionCount: quiz._count.questions,
        activeRoom: quiz.liveSessions[0]
          ? { sessionId: quiz.liveSessions[0].id, status: quiz.liveSessions[0].status }
          : null,
      }));
    },

    async findHostQuiz(userId, quizId) {
      const quiz = await prisma.quiz.findFirst({
        where: { id: quizId, ownerId: userId, status: { not: 'ARCHIVED' } },
        select: {
          id: true,
          title: true,
          roomCode: true,
          gameMode: true,
          maxPlayers: true,
          _count: { select: { questions: true } },
        },
      });
      return quiz
        ? {
            id: quiz.id,
            title: quiz.title,
            roomCode: quiz.roomCode,
            gameMode: quiz.gameMode,
            maxPlayers: quiz.maxPlayers,
            questionCount: quiz._count.questions,
          }
        : null;
    },

    countOptionlessQuestions(quizId) {
      return prisma.quizQuestion.count({
        where: { quizId, question: { options: { none: {} } } },
      });
    },

    findOngoingSession(quizId, userId) {
      return prisma.liveSession.findFirst({
        where: { quizId, hostId: userId, status: { in: ['WAITING', 'ACTIVE'] } },
        select: { id: true },
      });
    },

    createOrReuseSession(quiz, userId) {
      return prisma.$transaction(async (tx) => {
        await tx.quiz.update({
          where: { id: quiz.id },
          data: { status: 'ACTIVE', isPublic: true },
        });
        const existing = await tx.liveSession.findFirst({
          where: { quizId: quiz.id, hostId: userId, status: { in: ['WAITING', 'ACTIVE'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, roomCode: true, status: true },
        });
        if (existing) return { session: existing, created: false };
        const session = await tx.liveSession.create({
          data: {
            quizId: quiz.id,
            hostId: userId,
            roomCode: quiz.roomCode,
            status: 'WAITING',
          },
          select: { id: true, roomCode: true, status: true },
        });
        return { session, created: true };
      });
    },

    async readRoom(roomCode) {
      const session = await prisma.liveSession.findFirst({
        where: { roomCode, status: { in: ['WAITING', 'ACTIVE'] } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          roomCode: true,
          status: true,
          quiz: { select: { title: true, maxPlayers: true } },
          participants: {
            orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
            select: { id: true, displayName: true, score: true, status: true },
          },
        },
      });
      return session
        ? {
            sessionId: session.id,
            roomCode: session.roomCode,
            status: session.status,
            title: session.quiz.title,
            maxPlayers: session.quiz.maxPlayers,
            participants: session.participants,
          }
        : null;
    },

    async joinRoomAtomically(sessionId, userId, displayName) {
      try {
        return await prisma.$transaction(async (tx) => {
          const [lockedSession] = await tx.$queryRaw<
            Array<{ id: string; status: string; maxPlayers: number }>
          >`SELECT s."id", s."status"::text, q."maxPlayers"
            FROM "LiveSession" s JOIN "Quiz" q ON q."id" = s."quizId"
            WHERE s."id" = ${sessionId}
            FOR UPDATE OF s`;
          if (!lockedSession || !['WAITING', 'ACTIVE'].includes(lockedSession.status)) {
            return { status: 'closed' as const };
          }
          const existing = userId
            ? await tx.liveParticipant.findUnique({
                where: { sessionId_userId: { sessionId, userId } },
                select: { id: true },
              })
            : null;
          if (existing) return { status: 'joined' as const, participantId: existing.id };
          const count = await tx.liveParticipant.count({ where: { sessionId } });
          if (count >= lockedSession.maxPlayers) return { status: 'full' as const };
          const participant = await tx.liveParticipant.create({
            data: { sessionId, displayName, userId },
            select: { id: true },
          });
          return { status: 'joined' as const, participantId: participant.id };
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) return { status: 'name_taken' as const };
        throw error;
      }
    },
  };
}

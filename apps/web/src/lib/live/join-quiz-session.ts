import { revalidatePath } from 'next/cache';
import { getPrismaClient } from '@/lib/auth/prisma';
import { createPlayerLiveAccessToken } from '@/lib/live/access-token';

const MAX_PLAYER_NAME_LENGTH = 40;

export type QuizJoinResult =
  | {
      status: 'success';
      sessionId: string;
      participantId: string;
      participantToken: string;
      roomCode: string;
    }
  | { status: 'not_found' }
  | { status: 'full' };

export function normalizePlayerName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_PLAYER_NAME_LENGTH);
}

export function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

/** Expects a normalized room code and display name; database errors propagate to the caller. */
export async function joinQuizSessionByCode(
  roomCode: string,
  displayName: string,
): Promise<QuizJoinResult> {
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

  if (!session) return { status: 'not_found' };
  if (session._count.participants >= session.quiz.maxPlayers) return { status: 'full' };

  const participant = await prisma.liveParticipant.create({
    data: { sessionId: session.id, displayName },
    select: { id: true },
  });

  revalidatePath(`/live/${session.id}/play`);
  revalidatePath('/broadcast');
  return {
    status: 'success',
    sessionId: session.id,
    participantId: participant.id,
    participantToken: createPlayerLiveAccessToken(session.id, participant.id),
    roomCode: session.roomCode,
  };
}

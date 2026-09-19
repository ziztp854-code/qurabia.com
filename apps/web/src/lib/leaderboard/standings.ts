import type { LeaderboardPayload, LeaderboardPlayer } from './types';

type LeaderboardSession = {
  id: string;
  endedAt: Date | null;
  createdAt: Date;
  participants: Array<{
    id: string;
    displayName: string;
    score: number;
    correctCount: number;
    joinedAt: Date;
  }>;
};

type LeaderboardPrismaClient = {
  liveSession: {
    findMany: (args: {
      where: { status: 'FINISHED' };
      orderBy: Array<{ endedAt: 'desc' } | { createdAt: 'desc' }>;
      take: number;
      select: {
        id: true;
        endedAt: true;
        createdAt: true;
        participants: {
          orderBy: Array<{ score: 'desc' } | { joinedAt: 'asc' }>;
          select: {
            id: true;
            displayName: true;
            score: true;
            correctCount: true;
            joinedAt: true;
          };
        };
      };
    }) => Promise<LeaderboardSession[]>;
  };
};

type WinnerAccumulator = {
  id: string;
  name: string;
  score: number;
  correctAnswers: number;
  wins: number;
  lastWonAt: Date;
};

function normalizeWinnerName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar-SA');
}

function toRankedPlayers(winners: WinnerAccumulator[], limit: number): LeaderboardPlayer[] {
  return winners
    .toSorted(
      (first, second) =>
        second.score - first.score ||
        second.wins - first.wins ||
        second.correctAnswers - first.correctAnswers ||
        second.lastWonAt.getTime() - first.lastWonAt.getTime() ||
        first.name.localeCompare(second.name, 'ar'),
    )
    .slice(0, limit)
    .map((winner, index) => ({
      id: winner.id,
      name: winner.name,
      score: winner.score,
      rank: index + 1,
      streak: winner.wins,
      correctAnswers: winner.correctAnswers,
    }));
}

export async function getLeaderboardPayload(
  prisma: LeaderboardPrismaClient,
  options: { sessionLimit?: number; playerLimit?: number } = {},
): Promise<LeaderboardPayload> {
  const sessionLimit = options.sessionLimit ?? 100;
  const playerLimit = options.playerLimit ?? 50;
  const sessions = await prisma.liveSession.findMany({
    where: { status: 'FINISHED' },
    orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
    take: sessionLimit,
    select: {
      id: true,
      endedAt: true,
      createdAt: true,
      participants: {
        orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
        select: {
          id: true,
          displayName: true,
          score: true,
          correctCount: true,
          joinedAt: true,
        },
      },
    },
  });

  const winnersByName = new Map<string, WinnerAccumulator>();

  for (const session of sessions) {
    const winningScore = session.participants[0]?.score;
    if (winningScore === undefined) continue;

    const wonAt = session.endedAt ?? session.createdAt;
    for (const participant of session.participants) {
      if (participant.score !== winningScore) break;

      const name = participant.displayName.trim() || 'لاعب تحدّي';
      const key = normalizeWinnerName(name);
      const current = winnersByName.get(key);
      winnersByName.set(key, {
        id: current?.id ?? participant.id,
        name: current?.name ?? name,
        score: (current?.score ?? 0) + participant.score,
        correctAnswers: (current?.correctAnswers ?? 0) + participant.correctCount,
        wins: (current?.wins ?? 0) + 1,
        lastWonAt:
          current && current.lastWonAt.getTime() > wonAt.getTime() ? current.lastWonAt : wonAt,
      });
    }
  }

  return {
    ok: true,
    players: toRankedPlayers([...winnersByName.values()], playerLimit),
    updatedAt: new Date().toISOString(),
    finishedSessions: sessions.length,
  };
}

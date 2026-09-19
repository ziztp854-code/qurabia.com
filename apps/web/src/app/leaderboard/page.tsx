import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { getLeaderboardPayload } from '@/lib/leaderboard/standings';
import { LeaderboardLive } from './leaderboard-live';

export const dynamic = 'force-dynamic';

async function loadInitialLeaderboard() {
  if (!hasDatabaseUrl()) return { players: [], loadError: false };

  try {
    const payload = await getLeaderboardPayload(getPrismaClient());
    return { players: payload.players, loadError: false };
  } catch {
    return { players: [], loadError: true };
  }
}

export default async function LeaderboardPage() {
  const { players, loadError } = await loadInitialLeaderboard();
  return <LeaderboardLive initialPlayers={players} initialLoadError={loadError} />;
}

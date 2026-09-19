import { NextResponse } from 'next/server';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { getLeaderboardPayload } from '@/lib/leaderboard/standings';
import type { LeaderboardPayload } from '@/lib/leaderboard/types';

const emptyPayload = (): LeaderboardPayload => ({
  ok: true,
  players: [],
  updatedAt: new Date().toISOString(),
  finishedSessions: 0,
});

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(emptyPayload(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const payload = await getLeaderboardPayload(getPrismaClient());
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

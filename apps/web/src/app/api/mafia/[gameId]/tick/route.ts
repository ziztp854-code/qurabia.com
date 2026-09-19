import { NextResponse } from 'next/server';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { getCurrentSession } from '@/lib/auth/session';
import { getMafiaAccessToken } from '@/lib/mafia/access-cookie';
import { advanceMafiaGame, markMafiaParticipantSeen } from '@/lib/mafia/engine';

export async function POST(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const { gameId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    participantId?: string;
  };

  let authorized = false;
  if (body.participantId) {
    const participantToken = await getMafiaAccessToken(gameId);
    authorized = Boolean(
      participantToken &&
      (await markMafiaParticipantSeen(gameId, body.participantId, participantToken)),
    );
  } else {
    const session = await getCurrentSession();
    authorized = Boolean(
      session?.user?.id &&
      (await getPrismaClient().mafiaGame.findFirst({
        where: { id: gameId, hostId: session.user.id },
        select: { id: true },
      })),
    );
  }

  if (!authorized) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await advanceMafiaGame(gameId);
  return NextResponse.json({ ok: true });
}

import { redirect } from 'next/navigation';
import { SiteLayout } from '@/components/layout';
import { MafiaPlayClient } from './mafia-play-client';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { getMafiaAccessToken } from '@/lib/mafia/access-cookie';
import {
  filterParticipantsForPlayer,
  filterMessagesForPlayer,
  filterNightTargets,
  filterVoteTargets,
} from '@/lib/mafia/security-filter';
import type { MafiaPhaseName } from '@/lib/mafia/guidance';
import type { MafiaRoleName } from '@/lib/mafia/rules';

export default async function MafiaPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ participantId?: string }>;
}) {
  if (!hasDatabaseUrl()) redirect('/join?error=unavailable');
  const [{ gameId }, query] = await Promise.all([params, searchParams]);
  const participantId = query.participantId ?? '';
  const participantToken = await getMafiaAccessToken(gameId);
  const prisma = getPrismaClient();
  const game = await prisma.mafiaGame.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      roomCode: true,
      status: true,
      winner: true,
      currentRound: true,
      phaseEndsAt: true,
      autoMode: true,
      daySeconds: true,
      nightSeconds: true,
      votingSeconds: true,
      chatEnabled: true,
      slowModeSeconds: true,
      participants: {
        orderBy: { joinedAt: 'asc' },
        select: {
          id: true,
          displayName: true,
          role: true,
          status: true,
          privateNote: true,
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          id: true,
          body: true,
          channel: true,
          createdAt: true,
          participant: { select: { displayName: true } },
        },
      },
    },
  });
  const player = await prisma.mafiaParticipant.findFirst({
    where: { id: participantId, gameId, accessToken: participantToken },
    select: {
      id: true,
      displayName: true,
      role: true,
      status: true,
      isMuted: true,
      privateNote: true,
    },
  });
  if (!game || !player) redirect(`/join/${game?.roomCode ?? ''}?error=player`);

  const role = (player.role as MafiaRoleName | null) ?? null;
  const investigations =
    role === 'DETECTIVE'
      ? await prisma.mafiaAction.findMany({
          where: { gameId, actorId: player.id, type: 'INVESTIGATE' },
          orderBy: [{ round: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            round: true,
            targetId: true,
            resultIsKiller: true,
            createdAt: true,
            target: { select: { displayName: true } },
          },
        })
      : [];
  const phase = game.status as MafiaPhaseName;
  const phaseDuration =
    game.status === 'NIGHT'
      ? game.nightSeconds
      : game.status === 'DAY'
        ? game.daySeconds
        : game.status === 'VOTING'
          ? game.votingSeconds
          : null;
  const alivePlayers = game.participants.filter((item) => item.status === 'ALIVE');

  const safeParticipants = filterParticipantsForPlayer(game.participants, player.id);
  const safeMessages = filterMessagesForPlayer(game.messages, role, player.status);
  const nightTargets = filterNightTargets(alivePlayers, role, player.id);
  const voteTargets = filterVoteTargets(alivePlayers, player.id, phase, player.status);

  return (
    <SiteLayout>
      <main className={`section mafia-page mafia-phase-${game.status.toLowerCase()}`}>
        <MafiaPlayClient
          game={{
            ...game,
            phaseEndsAt: game.phaseEndsAt?.toISOString() ?? null,
            messages: safeMessages,
            participants: safeParticipants,
          }}
          player={player}
          phase={phase}
          role={role}
          phaseDuration={phaseDuration}
          nightTargets={nightTargets}
          voteTargets={voteTargets}
          investigations={investigations.map((investigation) => ({
            id: investigation.id,
            round: investigation.round,
            targetId: investigation.targetId,
            targetName: investigation.target.displayName,
            resultIsKiller: investigation.resultIsKiller === true,
            createdAt: investigation.createdAt.toISOString(),
          }))}
        />
      </main>
    </SiteLayout>
  );
}

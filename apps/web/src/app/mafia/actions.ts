'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { verifyAiGameDraftToken } from '@tahaddi/contracts';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requireActiveUser } from '@/lib/auth/session';
import { getMafiaAccessToken } from '@/lib/mafia/access-cookie';
import { advanceMafiaGame } from '@/lib/mafia/engine';
import {
  buildMafiaRoles,
  resolveMafiaChatChannel,
  shuffled,
  type MafiaGameModeId,
} from '@/lib/mafia/rules';
import { buildNarrativeEvent, buildNarrative } from '@/lib/mafia/narrative';
import { MAFIA_GAME_MODES, applyModeMultipliers } from '@/lib/mafia/game-modes';
import { generateUniqueActivityRoomCode } from '@/lib/quiz/room-code';
import { mafiaAiContentSchema } from '@/lib/ai/game-content-generation';

function integerField(formData: FormData, key: string, fallback: number) {
  const value = Number(formData.get(key));
  return Number.isInteger(value) ? value : fallback;
}

function requireMafiaDatabase() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL is required for Mafia rooms.');
}

function refreshMafia(gameId: string) {
  revalidatePath('/mafia');
  revalidatePath(`/mafia/${gameId}`);
  revalidatePath(`/mafia/${gameId}/play`);
}

function parseMafiaScenario(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value || value.length > 8_192) return null;
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '';
  const signedDraft = verifyAiGameDraftToken(secret, value);
  if (signedDraft?.game !== 'mafia') return null;
  const parsed = mafiaAiContentSchema.safeParse(signedDraft.content);
  return parsed.success ? parsed.data : null;
}

export async function createMafiaGame(formData: FormData) {
  requireMafiaDatabase();
  const user = await requireActiveUser('/mafia');
  const prisma = getPrismaClient();
  const mode = (formData.get('modeId') as MafiaGameModeId | null) ?? 'CLASSIC';
  const modeObj = MAFIA_GAME_MODES[mode] ?? MAFIA_GAME_MODES.CLASSIC;
  const maxPlayers = Math.min(30, Math.max(5, integerField(formData, 'maxPlayers', 12)));
  const baseKiller = Math.min(3, Math.max(1, integerField(formData, 'killerCount', 1)));
  const roomCode = await generateUniqueActivityRoomCode(prisma);
  const baseTimers = {
    nightSeconds: Math.min(180, Math.max(20, integerField(formData, 'nightSeconds', 45))),
    daySeconds: Math.min(300, Math.max(30, integerField(formData, 'daySeconds', 90))),
    votingSeconds: Math.min(120, Math.max(20, integerField(formData, 'votingSeconds', 45))),
    killerCount: baseKiller,
    maxPlayers,
  };
  const adjusted = applyModeMultipliers(modeObj.id, baseTimers);
  const scenario = parseMafiaScenario(formData.get('aiScenario'));
  const scenarioMessages = scenario
    ? [
        `القضية: ${scenario.title} — ${scenario.intro}`,
        ...scenario.clues.map((clue, index) => `الدليل ${index + 1}: ${clue}`),
      ].map((body) => ({ channel: 'SYSTEM' as const, body: body.slice(0, 280) }))
    : [];
  const game = await prisma.mafiaGame.create({
    data: {
      hostId: user.id,
      roomCode,
      maxPlayers,
      killerCount: adjusted.killerCount,
      modeId: modeObj.id,
      autoMode: formData.get('autoMode') !== 'off',
      chatEnabled: formData.get('chatEnabled') !== 'off',
      slowModeSeconds: Math.min(30, Math.max(0, integerField(formData, 'slowModeSeconds', 2))),
      daySeconds: adjusted.daySeconds,
      nightSeconds: adjusted.nightSeconds,
      votingSeconds: adjusted.votingSeconds,
      ...(scenarioMessages.length ? { messages: { create: scenarioMessages } } : {}),
    },
    select: { id: true },
  });
  redirect(`/mafia/${game.id}`);
}

export async function startMafiaGame(formData: FormData) {
  requireMafiaDatabase();
  const gameId = String(formData.get('gameId') ?? '');
  const user = await requireActiveUser(`/mafia/${gameId}`);
  const prisma = getPrismaClient();
  const result = await prisma.$transaction(async (tx) => {
    const [game] = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
        killerCount: number;
        nightSeconds: number;
      }>
    >`SELECT "id", "status"::text, "killerCount", "nightSeconds"
      FROM "MafiaGame"
      WHERE "id" = ${gameId} AND "hostId" = ${user.id}
      FOR UPDATE`;
    if (!game || game.status !== 'LOBBY') return 'not-found' as const;

    const participants = await tx.mafiaParticipant.findMany({
      where: { gameId },
      orderBy: { joinedAt: 'asc' },
      select: { id: true },
    });
    if (participants.length < 5) return 'players' as const;

    const roles = shuffled(buildMafiaRoles(participants.length, game.killerCount));
    const now = new Date();
    const participantInfo = await tx.mafiaParticipant.findMany({
      where: { gameId },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, displayName: true, joinedAt: true },
    });
    const narratives = participantInfo.map((p, index) => {
      const seed = (p.id.charCodeAt(p.id.length - 1) + index * 7) % 1000;
      return buildNarrative(p.displayName, roles[index], seed);
    });
    for (const [index, participant] of participantInfo.entries()) {
      const persona = narratives[index];
      const intro = `أنت ${persona.title}. ${persona.backstory}. مهام دورك:\n${persona.roleFlavor}\nأفضل اقتباس لك: «${persona.quotes.intro}»`;
      await tx.mafiaParticipant.update({
        where: { id: participant.id },
        data: {
          role: roles[index],
          status: 'ALIVE',
          privateNote: intro,
          eliminatedAt: null,
        },
      });
    }
    await tx.mafiaGame.update({
      where: { id: game.id },
      data: {
        status: 'NIGHT',
        currentRound: 1,
        startedAt: now,
        phaseEndsAt: new Date(now.getTime() + game.nightSeconds * 1000),
      },
    });
    const startEvent = buildNarrativeEvent(
      'start',
      null,
      0,
      participantInfo.length,
      game.killerCount,
    );
    await tx.mafiaMessage.create({
      data: {
        gameId: game.id,
        channel: 'SYSTEM',
        body: `بدأت اللعبة. افتح بطاقة دورك سرًا، فالليل قد حل. ${startEvent.body}`,
      },
    });
    return 'started' as const;
  });

  if (result === 'not-found') redirect(`/mafia/${gameId}?error=not-found`);
  if (result === 'players') redirect(`/mafia/${gameId}?error=players`);
  refreshMafia(gameId);
  redirect(`/mafia/${gameId}`);
}

export async function advanceMafiaPhase(formData: FormData) {
  requireMafiaDatabase();
  const gameId = String(formData.get('gameId') ?? '');
  const user = await requireActiveUser(`/mafia/${gameId}`);
  const ownsGame = await getPrismaClient().mafiaGame.findFirst({
    where: { id: gameId, hostId: user.id },
    select: { id: true },
  });
  if (ownsGame) await advanceMafiaGame(gameId, true);
  refreshMafia(gameId);
}

export async function submitMafiaAction(formData: FormData) {
  requireMafiaDatabase();
  const gameId = String(formData.get('gameId') ?? '');
  const actorId = String(formData.get('participantId') ?? '');
  const participantToken = await getMafiaAccessToken(gameId);
  const targetId = String(formData.get('targetId') ?? '');
  const prisma = getPrismaClient();
  const accepted = await prisma.$transaction(async (tx) => {
    const [game] = await tx.$queryRaw<Array<{ id: string; status: string; currentRound: number }>>`
      SELECT "id", "status"::text, "currentRound"
      FROM "MafiaGame"
      WHERE "id" = ${gameId}
      FOR UPDATE`;
    if (!game || game.status !== 'NIGHT') return false;

    const actor = await tx.mafiaParticipant.findFirst({
      where: {
        id: actorId,
        gameId,
        accessToken: participantToken,
        status: 'ALIVE',
      },
      select: { id: true, role: true },
    });
    const target = await tx.mafiaParticipant.findFirst({
      where: { id: targetId, gameId, status: 'ALIVE' },
      select: { id: true, role: true, displayName: true },
    });
    if (!actor?.role || !target) return false;

    const type =
      actor.role === 'KILLER'
        ? 'KILL'
        : actor.role === 'DETECTIVE'
          ? 'INVESTIGATE'
          : actor.role === 'DOCTOR'
            ? 'HEAL'
            : actor.role === 'GUARD'
              ? 'PROTECT'
              : null;
    if (!type || (type === 'KILL' && target.role === 'KILLER')) return false;
    if ((type === 'PROTECT' || type === 'INVESTIGATE') && target.id === actor.id) {
      return false;
    }

    const resultIsKiller = type === 'INVESTIGATE' ? target.role === 'KILLER' : null;
    if (type === 'INVESTIGATE') {
      const previousInvestigation = await tx.mafiaAction.findFirst({
        where: {
          gameId,
          actorId,
          targetId,
          type: 'INVESTIGATE',
          round: { lt: game.currentRound },
        },
        select: { id: true },
      });
      if (previousInvestigation) return false;

      const created = await tx.mafiaAction.createMany({
        data: [
          {
            gameId,
            round: game.currentRound,
            actorId,
            targetId,
            type,
            resultIsKiller,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count === 0) return false;

      await tx.mafiaParticipant.update({
        where: { id: actor.id },
        data: {
          privateNote: `${target.displayName}: ${resultIsKiller ? 'هو القاتل' : 'ليس القاتل'}.`,
        },
      });
      return true;
    }

    await tx.mafiaAction.upsert({
      where: {
        gameId_round_type_actorId: {
          gameId,
          round: game.currentRound,
          type,
          actorId,
        },
      },
      update: { targetId, resultIsKiller },
      create: {
        gameId,
        round: game.currentRound,
        actorId,
        targetId,
        type,
        resultIsKiller,
      },
    });
    return true;
  });
  if (!accepted) return;
  refreshMafia(gameId);
  return true;
}

export async function submitMafiaVote(formData: FormData) {
  requireMafiaDatabase();
  const gameId = String(formData.get('gameId') ?? '');
  const voterId = String(formData.get('participantId') ?? '');
  const participantToken = await getMafiaAccessToken(gameId);
  const targetId = String(formData.get('targetId') ?? '');
  const prisma = getPrismaClient();
  const game = await prisma.mafiaGame.findUnique({
    where: { id: gameId },
    select: {
      status: true,
      currentRound: true,
      participants: {
        where: { id: { in: [voterId, targetId] }, status: 'ALIVE' },
        select: { id: true, role: true },
      },
    },
  });
  if (!game || game.status !== 'VOTING' || game.participants.length !== 2) return;
  const voter = game.participants.find((item) => item.id === voterId);
  const target = game.participants.find((item) => item.id === targetId);
  if (!voter || !target) return;
  if (voter.id === target.id) return;
  const authorizedVoter = await prisma.mafiaParticipant.findFirst({
    where: { id: voterId, gameId, accessToken: participantToken },
    select: { id: true },
  });
  if (!authorizedVoter) return;
  await prisma.mafiaVote.upsert({
    where: { gameId_round_voterId: { gameId, round: game.currentRound, voterId } },
    update: { targetId },
    create: { gameId, round: game.currentRound, voterId, targetId },
  });
  refreshMafia(gameId);
}

export async function sendMafiaMessage(formData: FormData) {
  requireMafiaDatabase();
  const gameId = String(formData.get('gameId') ?? '');
  const participantId = String(formData.get('participantId') ?? '');
  const participantToken = await getMafiaAccessToken(gameId);
  const body = String(formData.get('body') ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 280);
  if (!body) return;
  const prisma = getPrismaClient();
  const participant = await prisma.mafiaParticipant.findFirst({
    where: { id: participantId, gameId, accessToken: participantToken },
    select: {
      id: true,
      role: true,
      status: true,
      isMuted: true,
      lastMessageAt: true,
      game: {
        select: { status: true, chatEnabled: true, slowModeSeconds: true },
      },
    },
  });
  if (!participant || participant.isMuted || !participant.game.chatEnabled) return;
  const elapsed = participant.lastMessageAt
    ? Date.now() - participant.lastMessageAt.getTime()
    : Number.POSITIVE_INFINITY;
  if (elapsed < participant.game.slowModeSeconds * 1000) return;

  const channel = resolveMafiaChatChannel({
    gameStatus: participant.game.status,
    role: participant.role,
    playerStatus: participant.status,
  });
  if (!channel) return;
  const now = new Date();
  const cutoff = new Date(now.getTime() - participant.game.slowModeSeconds * 1000);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.mafiaParticipant.updateMany({
      where: {
        id: participantId,
        gameId,
        accessToken: participantToken,
        OR: [{ lastMessageAt: null }, { lastMessageAt: { lte: cutoff } }],
      },
      data: { lastMessageAt: now },
    });
    if (claimed.count === 0) return;
    await tx.mafiaMessage.create({ data: { gameId, participantId, channel, body } });
  });
  refreshMafia(gameId);
}

export async function moderateMafiaParticipant(formData: FormData) {
  requireMafiaDatabase();
  const gameId = String(formData.get('gameId') ?? '');
  const participantId = String(formData.get('participantId') ?? '');
  const user = await requireActiveUser(`/mafia/${gameId}`);
  const game = await getPrismaClient().mafiaGame.findFirst({
    where: { id: gameId, hostId: user.id },
    select: { id: true },
  });
  if (game) {
    await getPrismaClient().mafiaParticipant.updateMany({
      where: { id: participantId, gameId },
      data: { isMuted: formData.get('muted') === 'true' },
    });
  }
  refreshMafia(gameId);
}

export async function deleteMafiaMessage(formData: FormData) {
  requireMafiaDatabase();
  const gameId = String(formData.get('gameId') ?? '');
  const messageId = String(formData.get('messageId') ?? '');
  const user = await requireActiveUser(`/mafia/${gameId}`);
  const game = await getPrismaClient().mafiaGame.findFirst({
    where: { id: gameId, hostId: user.id },
    select: { id: true },
  });
  if (game) {
    await getPrismaClient().mafiaMessage.deleteMany({ where: { id: messageId, gameId } });
  }
  refreshMafia(gameId);
}

export async function toggleMafiaChat(formData: FormData) {
  requireMafiaDatabase();
  const gameId = String(formData.get('gameId') ?? '');
  const user = await requireActiveUser(`/mafia/${gameId}`);
  await getPrismaClient().mafiaGame.updateMany({
    where: { id: gameId, hostId: user.id },
    data: { chatEnabled: formData.get('enabled') === 'true' },
  });
  refreshMafia(gameId);
}

import type { MafiaRoleName } from './rules';

export interface SafeParticipant {
  id: string;
  displayName: string;
  status: string;
  role?: string;
  privateNote?: string;
}

export interface SafeMessage {
  id: string;
  body: string;
  channel: string;
  createdAt: Date;
  participant: { displayName: string } | null;
}

export interface NightTarget {
  id: string;
  displayName: string;
}

export interface VoteTarget {
  id: string;
  displayName: string;
}

export function filterParticipantsForPlayer(
  participants: Array<{
    id: string;
    displayName: string;
    role: string | null;
    status: string;
    privateNote: string | null;
  }>,
  playerId: string,
): SafeParticipant[] {
  return participants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    status: p.status,
    ...(p.id === playerId
      ? { role: p.role ?? undefined, privateNote: p.privateNote ?? undefined }
      : {}),
  }));
}

export function filterMessagesForPlayer(
  messages: Array<{
    id: string;
    body: string;
    channel: string;
    createdAt: Date;
    participant: { displayName: string } | null;
  }>,
  playerRole: MafiaRoleName | null,
  playerStatus: string,
): SafeMessage[] {
  return messages.filter((message) => {
    if (message.channel === 'SYSTEM') return true;
    if (message.channel === 'KILLERS') return playerRole === 'KILLER';
    if (message.channel === 'GHOSTS') return playerStatus === 'ELIMINATED';
    return message.channel === 'PUBLIC';
  });
}

export function filterMessagesForHost<T extends { channel: string }>(messages: T[]): T[] {
  return messages.filter((message) => message.channel === 'SYSTEM' || message.channel === 'PUBLIC');
}

export function filterNightTargets(
  alivePlayers: Array<{ id: string; displayName: string; role: string | null; status: string }>,
  playerRole: MafiaRoleName | null,
  playerId: string,
): NightTarget[] {
  if (!playerRole || !['KILLER', 'DETECTIVE', 'DOCTOR', 'GUARD'].includes(playerRole)) {
    return [];
  }
  const targets =
    playerRole === 'KILLER'
      ? alivePlayers.filter((p) => p.role !== 'KILLER')
      : playerRole === 'GUARD' || playerRole === 'DETECTIVE'
        ? alivePlayers.filter((p) => p.id !== playerId)
        : alivePlayers;
  return targets.map((p) => ({ id: p.id, displayName: p.displayName }));
}

export function filterVoteTargets(
  alivePlayers: Array<{ id: string; displayName: string; status: string }>,
  playerId: string,
  phase: string,
  playerStatus: string,
): VoteTarget[] {
  if (phase !== 'VOTING' || playerStatus !== 'ALIVE') {
    return [];
  }
  return alivePlayers
    .filter((p) => p.id !== playerId)
    .map((p) => ({ id: p.id, displayName: p.displayName }));
}

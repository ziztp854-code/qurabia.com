import type {
  VoiceCreateInput, VoiceParticipant, VoiceRoom, VoiceSnapshot,
} from '../api/contracts';

export const ROOM_COVERS = [
  'studio', 'friends', 'coffee', 'gaming', 'oud', 'discussion', 'quiz',
] as const;

export function createRoomDefaults(name = ''): VoiceCreateInput {
  return {
    name, description: '', category: 'مجالس', cover: '/voice/covers/friends.webp',
    seatCount: 8, isPrivate: false, allowMicRequests: true,
    chatEnabled: true, moderatorsCanManage: true,
  };
}

/** Apply only snapshots for the same room and never roll permissions backwards. */
export function nextSnapshot(
  current: VoiceSnapshot | null,
  incoming: VoiceSnapshot,
): VoiceSnapshot {
  if (!current) return incoming;
  if (current.room.id !== incoming.room.id || current.cursor > incoming.cursor) return current;
  return incoming;
}

export function canManageRoom(snapshot: VoiceSnapshot): boolean {
  return snapshot.me?.role === 'host' ||
    (snapshot.me?.role === 'moderator' && snapshot.room.moderatorsCanManage);
}

export function availableSeat(snapshot: VoiceSnapshot, preferred?: number): number | undefined {
  const available = (index: number) => index >= 0 && index < snapshot.room.seatCount &&
    !snapshot.room.lockedSeats.includes(index) &&
    !snapshot.participants.some((person) => person.seatIndex === index);
  if (preferred !== undefined && available(preferred)) return preferred;
  return Array.from({ length: snapshot.room.seatCount }, (_, index) => index).find(available);
}

export function canUseMicrophone(
  room: Pick<VoiceRoom, 'active'>,
  participant: VoiceParticipant | null,
): boolean {
  return room.active && participant !== null && participant.seatIndex !== null &&
    participant.role !== 'listener' && !participant.moderatorMuted;
}

export function isMembershipFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error &&
    [401, 403, 404, 410].includes(Number(error.status));
}

export function roomErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'تعذّر الاتصال بالغرفة. حاول مجددًا.';
}

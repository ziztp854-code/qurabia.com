import { isRoomCode, normalizeRoomCode } from '@tahaddi/domain';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Only documented room invitations may become in-app deep links. */
export function resolveNotificationJoinUrl(data: unknown) {
  if (!isRecord(data)) return null;
  const keys = Object.keys(data).sort();
  if (keys.length !== 2 || keys[0] !== 'roomCode' || keys[1] !== 'type') return null;
  if (data.type !== 'join_room' || typeof data.roomCode !== 'string') return null;
  const roomCode = normalizeRoomCode(data.roomCode);
  return isRoomCode(roomCode) ? `tahaddi://join/${roomCode}` : null;
}

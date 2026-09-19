import { isRoomCode, normalizeRoomCode } from '@tahaddi/domain';

const PUBLIC_SITE_URL = 'https://qurabia.com';

export function buildQuizJoinUrl(value: string) {
  const roomCode = normalizeRoomCode(value);
  return isRoomCode(roomCode) ? `${PUBLIC_SITE_URL}/join/${roomCode}` : null;
}

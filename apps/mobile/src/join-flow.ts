import { isRoomCode, normalizeRoomCode } from '@tahaddi/domain';

const PUBLIC_HOST = 'qurabia.com';

function roomCodeFromUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;

    const segments = url.pathname.split('/').filter(Boolean);
    if (url.protocol === 'https:' && url.hostname === PUBLIC_HOST) {
      return segments.length === 2 && segments[0] === 'join' ? segments[1] : null;
    }

    if (url.protocol !== 'tahaddi:') return null;

    if (url.hostname === 'join') {
      return segments.length === 1 ? segments[0] : null;
    }

    return url.hostname === '' && segments.length === 2 && segments[0] === 'join'
      ? segments[1]
      : null;
  } catch {
    return value.includes('://') || value.includes('/') ? null : value;
  }
}

export function resolveJoinIntent(value: string) {
  const roomCode = normalizeRoomCode(roomCodeFromUrl(value) ?? '');
  return isRoomCode(roomCode) ? { roomCode } : null;
}

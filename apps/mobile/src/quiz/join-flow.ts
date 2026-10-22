import { isRoomCode, normalizeRoomCode } from '@tahaddi/domain';

export const PUBLIC_SITE_URL = 'https://qurabia.com';

export function siteUrl(path: string) {
  return `${PUBLIC_SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Reads a room code from `tahaddi://join/CODE` or `https://qurabia.com/join/CODE` links. */
export function roomCodeFromLink(url: string | null | undefined) {
  if (!url) return null;
  const match = /^(?:tahaddi:\/\/|https:\/\/(?:www\.)?qurabia\.com\/)join\/([^/?#]+)/i.exec(
    url.trim(),
  );
  if (!match) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(match[1]); } catch { return null; }
  const roomCode = normalizeRoomCode(decoded);
  return isRoomCode(roomCode) ? roomCode : null;
}

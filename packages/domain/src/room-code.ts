export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_DEFAULT_LENGTH = 6;
export const ROOM_CODE_MIN_LENGTH = 6;
export const ROOM_CODE_MAX_LENGTH = 8;
export const ROOM_CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6,8}$/;

export function normalizeRoomCode(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

export function isRoomCode(value: string) {
  return ROOM_CODE_RE.test(normalizeRoomCode(value));
}

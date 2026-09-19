'use client';

const CHESS_ROOM_PIN_KEY = 'tahaddi-chess-room-pin';
const CHESS_SEAT_GUEST_ID_KEY = 'tahaddi-chess-seat-guest-id';
const CHESS_GUEST_ID_KEY = 'tahaddi-chess-guest-id';
const CHESS_GUEST_TOKEN_KEY = 'tahaddi-chess-guest-token';

function getSessionStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clearLegacyRoomStorage() {
  const storage = getLocalStorage();
  storage?.removeItem(CHESS_ROOM_PIN_KEY);
  storage?.removeItem(CHESS_SEAT_GUEST_ID_KEY);
}

export function getSavedChessPin() {
  const storage = getSessionStorage();
  const savedPin = storage?.getItem(CHESS_ROOM_PIN_KEY) ?? '';
  const savedSeatGuestId = storage?.getItem(CHESS_SEAT_GUEST_ID_KEY) ?? '';
  return /^\d{6}$/.test(savedPin) && savedSeatGuestId ? savedPin : '';
}

export function getSavedChessSeatGuestId() {
  return getSessionStorage()?.getItem(CHESS_SEAT_GUEST_ID_KEY) ?? '';
}

export function saveChessRoomPin(pin: string) {
  getSessionStorage()?.setItem(CHESS_ROOM_PIN_KEY, pin);
  clearLegacyRoomStorage();
}

export function saveChessSeatGuestId(guestId: string) {
  getSessionStorage()?.setItem(CHESS_SEAT_GUEST_ID_KEY, guestId);
  clearLegacyRoomStorage();
}

export function clearSavedChessRoom() {
  const storage = getSessionStorage();
  storage?.removeItem(CHESS_ROOM_PIN_KEY);
  storage?.removeItem(CHESS_SEAT_GUEST_ID_KEY);
  clearLegacyRoomStorage();
}

export function getOrCreateChessGuestId() {
  const storage = getSessionStorage();
  if (!storage) return '';
  let id = storage.getItem(CHESS_GUEST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    storage.setItem(CHESS_GUEST_ID_KEY, id);
  }
  return id;
}

export function getOrCreateChessGuestToken() {
  const storage = getSessionStorage();
  if (!storage) return '';
  let token = storage.getItem(CHESS_GUEST_TOKEN_KEY);
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    storage.setItem(CHESS_GUEST_TOKEN_KEY, token);
  }
  return token;
}

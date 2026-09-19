'use client';

const LADDER_GUEST_ID_KEY = 'tahaddi-ladder-guest-id';
const LADDER_GUEST_TOKEN_KEY = 'tahaddi-ladder-guest-token';
const LADDER_LAST_ROOM_KEY = 'tahaddi-ladder-last-room';

function probeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  let candidate: Storage;
  try {
    candidate = window.sessionStorage;
  } catch {
    return null;
  }
  if (!candidate) return null;
  // Probe with a single getItem call; some browsers (Safari private mode,
  // some hardened enterprise policies) hand out a sessionStorage object
  // that throws on every operation.
  const probeKey = '__tahaddi_ladder_probe__';
  try {
    candidate.getItem(probeKey);
    return candidate;
  } catch {
    return null;
  }
}

function getSessionStorage() {
  return probeSessionStorage();
}

function getLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getCrypto(): Crypto | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { crypto?: Crypto }).crypto;
  if (!candidate || typeof candidate.getRandomValues !== 'function') return null;
  return candidate;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const secure = getCrypto();
  if (secure) {
    secure.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateGuestId() {
  const secure = getCrypto();
  if (secure && typeof secure.randomUUID === 'function') {
    return secure.randomUUID().replace(/-/g, '').slice(0, 24);
  }
  return bytesToHex(randomBytes(12));
}

function generateGuestToken() {
  return bytesToHex(randomBytes(32));
}

/**
 * Returns a stable guest id for the ladder game, creating one if missing.
 * Persisted in sessionStorage so it survives page reloads within a tab,
 * but is cleared when the user closes the browser (preventing cross-tab
 * collisions and identity leaks).
 */
export function getOrCreateLadderGuestId() {
  const storage = getSessionStorage();
  if (!storage) return '';
  let id = storage.getItem(LADDER_GUEST_ID_KEY);
  if (!id || id.length < 8) {
    id = generateGuestId();
    try {
      storage.setItem(LADDER_GUEST_ID_KEY, id);
    } catch {
      return id;
    }
  }
  return id;
}

/**
 * Returns a stable guest token for the ladder game, creating one if missing.
 * The token is sent to the realtime server alongside the guest id to prove
 * possession of the identity (mitigates trivial id spoofing).
 */
export function getOrCreateLadderGuestToken() {
  const storage = getSessionStorage();
  if (!storage) return '';
  let token = storage.getItem(LADDER_GUEST_TOKEN_KEY);
  if (!token || token.length < 32) {
    token = generateGuestToken();
    try {
      storage.setItem(LADDER_GUEST_TOKEN_KEY, token);
    } catch {
      return token;
    }
  }
  return token;
}

export function saveLastLadderRoomCode(roomCode: string) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    if (roomCode) {
      storage.setItem(LADDER_LAST_ROOM_KEY, roomCode);
    } else {
      storage.removeItem(LADDER_LAST_ROOM_KEY);
    }
  } catch {
    // ignore quota / disabled storage
  }
}

export function getLastLadderRoomCode() {
  const storage = getLocalStorage();
  if (!storage) return '';
  try {
    return storage.getItem(LADDER_LAST_ROOM_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Clears the persisted guest identity. Call this when the server reports
 * INVALID_GUEST so the next attempt generates a fresh pair (id + token).
 */
export function clearLadderGuestIdentity() {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(LADDER_GUEST_ID_KEY);
    storage.removeItem(LADDER_GUEST_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Returns true when the current device exposes a working, persistent
 * session storage. The ladder relies on it to keep a stable guest id;
 * a private/incognito window may still pass `getSessionStorage` but quotas
 * can differ, so we treat any non-null handle as "available".
 */
export function isLadderSessionStorageAvailable() {
  return getSessionStorage() !== null;
}

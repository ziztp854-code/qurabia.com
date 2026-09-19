'use client';

const SW_GUEST_ID_KEY = 'tahaddi-sw-guest-id';
const SW_GUEST_TOKEN_KEY = 'tahaddi-sw-guest-token';

function probeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  let candidate: Storage;
  try {
    candidate = window.sessionStorage;
  } catch {
    return null;
  }
  if (!candidate) return null;
  const probeKey = '__tahaddi_sw_probe__';
  try {
    candidate.getItem(probeKey);
    return candidate;
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

export function getOrCreateScrambledWordsGuestId() {
  const storage = probeSessionStorage();
  if (!storage) return '';
  let id = storage.getItem(SW_GUEST_ID_KEY);
  if (!id || id.length < 8) {
    id = generateGuestId();
    try {
      storage.setItem(SW_GUEST_ID_KEY, id);
    } catch {
      return id;
    }
  }
  return id;
}

export function getOrCreateScrambledWordsGuestToken() {
  const storage = probeSessionStorage();
  if (!storage) return '';
  let token = storage.getItem(SW_GUEST_TOKEN_KEY);
  if (!token || token.length < 32) {
    token = generateGuestToken();
    try {
      storage.setItem(SW_GUEST_TOKEN_KEY, token);
    } catch {
      return token;
    }
  }
  return token;
}

export function clearScrambledWordsGuestIdentity() {
  const storage = probeSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(SW_GUEST_ID_KEY);
    storage.removeItem(SW_GUEST_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function isScrambledWordsSessionStorageAvailable() {
  return probeSessionStorage() !== null;
}

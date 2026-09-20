import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LiveRole } from './live';

const TOKEN_VERSION = 'v2';
export const LIVE_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1_000;

type LiveAccessIdentity = {
  sessionId: string;
  subjectId: string;
  role: LiveRole;
  subjectVersion?: number;
};

function tokenMessage(input: LiveAccessIdentity, expiresAt: number) {
  return [
    TOKEN_VERSION,
    input.role,
    input.sessionId,
    input.subjectId,
    input.subjectVersion ?? '-',
    expiresAt,
  ].join(':');
}

function parseToken(token: string) {
  const [version, expiresAtValue, signature, ...extra] = token.split('.');
  if (version !== TOKEN_VERSION || !expiresAtValue || !signature || extra.length > 0) return null;
  if (!/^\d{13}$/.test(expiresAtValue)) return null;
  const expiresAt = Number(expiresAtValue);
  return Number.isSafeInteger(expiresAt) ? { expiresAt, signature } : null;
}

export function createLiveAccessToken(
  secret: string,
  input: LiveAccessIdentity,
  options: { expiresAt?: number; now?: number } = {},
) {
  if (secret.length < 16) {
    throw new Error('Live access token secret must contain at least 16 characters.');
  }
  const now = options.now ?? Date.now();
  const expiresAt = options.expiresAt ?? now + LIVE_ACCESS_TOKEN_TTL_MS;
  if (!Number.isSafeInteger(expiresAt)) {
    throw new Error('Live access token expiry must be a safe integer timestamp.');
  }
  const signature = createHmac('sha256', secret)
    .update(tokenMessage(input, expiresAt))
    .digest('base64url');
  return `${TOKEN_VERSION}.${expiresAt}.${signature}`;
}

export function createLiveAccessCredential(
  secret: string,
  input: LiveAccessIdentity,
  options: { expiresAt?: number; now?: number } = {},
) {
  const accessToken = createLiveAccessToken(secret, input, options);
  const expiresAt = readLiveAccessTokenExpiresAt(accessToken);
  if (!expiresAt) throw new Error('Failed to encode live access token expiry.');
  return { accessToken, expiresAt };
}

export function readLiveAccessTokenExpiresAt(token: string) {
  return parseToken(token)?.expiresAt ?? null;
}

export function verifyLiveAccessToken(
  secret: string,
  input: {
    sessionId: string;
    subjectId: string;
    role: LiveRole;
    token: string;
    expiresAt?: number;
    subjectVersion?: number;
  },
  now = Date.now(),
) {
  if (!input.token || secret.length < 16) return false;
  const parsed = parseToken(input.token);
  if (!parsed || parsed.expiresAt <= now) return false;
  if (input.expiresAt !== undefined && input.expiresAt !== parsed.expiresAt) return false;
  const expected = createLiveAccessToken(secret, input, { expiresAt: parsed.expiresAt });
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(input.token);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

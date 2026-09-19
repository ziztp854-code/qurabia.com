import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LiveRole } from './index';

const TOKEN_VERSION = 'v1';

function tokenMessage(input: { sessionId: string; subjectId: string; role: LiveRole }) {
  return `${TOKEN_VERSION}:${input.role}:${input.sessionId}:${input.subjectId}`;
}

export function createLiveAccessToken(
  secret: string,
  input: { sessionId: string; subjectId: string; role: LiveRole },
) {
  if (secret.length < 16) {
    throw new Error('Live access token secret must contain at least 16 characters.');
  }
  return createHmac('sha256', secret).update(tokenMessage(input)).digest('base64url');
}

export function verifyLiveAccessToken(
  secret: string,
  input: {
    sessionId: string;
    subjectId: string;
    role: LiveRole;
    token: string;
  },
) {
  if (!input.token || secret.length < 16) return false;
  const expected = createLiveAccessToken(secret, input);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(input.token);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

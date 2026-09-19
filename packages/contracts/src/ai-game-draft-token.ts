import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'v1';
const MAX_TOKEN_LENGTH = 65_536;
const MAX_FUTURE_MS = 15 * 60_000;

export type AiGameDraftPayload = {
  game: string;
  content: unknown;
  expiresAt: number;
};

function signature(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createAiGameDraftToken(secret: string, payload: AiGameDraftPayload) {
  if (secret.length < 16) throw new Error('AI draft token secret must contain at least 16 characters.');
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const message = `${TOKEN_VERSION}.${encoded}`;
  return `${message}.${signature(secret, message)}`;
}

export function verifyAiGameDraftToken(
  secret: string,
  token: string,
  now = Date.now(),
): AiGameDraftPayload | null {
  if (secret.length < 16 || !token || token.length > MAX_TOKEN_LENGTH) return null;
  const [version, encoded, actualSignature, extra] = token.split('.');
  if (version !== TOKEN_VERSION || !encoded || !actualSignature || extra) return null;
  const message = `${version}.${encoded}`;
  const expectedSignature = signature(secret, message);
  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(actualSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<AiGameDraftPayload>;
    if (
      typeof payload.game !== 'string' ||
      payload.content === undefined ||
      typeof payload.expiresAt !== 'number' ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= now ||
      payload.expiresAt > now + MAX_FUTURE_MS
    ) {
      return null;
    }
    return payload as AiGameDraftPayload;
  } catch {
    return null;
  }
}

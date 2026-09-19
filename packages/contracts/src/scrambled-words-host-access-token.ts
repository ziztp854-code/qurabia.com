import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'v1';
const MAX_TOKEN_LENGTH = 2_048;
const MAX_FUTURE_MS = 3 * 60 * 60_000;

export type ScrambledWordsHostAccessPayload = {
  hostId: string;
  expiresAt: number;
};

function signature(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createScrambledWordsHostAccessToken(
  secret: string,
  payload: ScrambledWordsHostAccessPayload,
) {
  if (secret.length < 16) {
    throw new Error(
      'Scrambled words host token secret must contain at least 16 characters.',
    );
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const message = `${TOKEN_VERSION}.${encoded}`;
  return `${message}.${signature(secret, message)}`;
}

export function verifyScrambledWordsHostAccessToken(
  secret: string,
  token: string,
  now = Date.now(),
): ScrambledWordsHostAccessPayload | null {
  if (secret.length < 16 || !token || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  const [version, encoded, actualSignature, extra] = token.split('.');
  if (version !== TOKEN_VERSION || !encoded || !actualSignature || extra) {
    return null;
  }

  const message = `${version}.${encoded}`;
  const expected = Buffer.from(signature(secret, message));
  const actual = Buffer.from(actualSignature);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<ScrambledWordsHostAccessPayload>;
    if (
      typeof payload.hostId !== 'string' ||
      payload.hostId.length < 1 ||
      payload.hostId.length > 191 ||
      typeof payload.expiresAt !== 'number' ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= now ||
      payload.expiresAt > now + MAX_FUTURE_MS
    ) {
      return null;
    }
    return payload as ScrambledWordsHostAccessPayload;
  } catch {
    return null;
  }
}

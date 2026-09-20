import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const MOBILE_ACCESS_TOKEN_TTL_MS = 15 * 60_000;
export const MOBILE_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;

type AccessTokenPayload = {
  typ: 'tahaddi-mobile-access';
  sub: string;
  role: string;
  ver: number;
  iat: number;
  exp: number;
};

export type VerifiedMobileAccessToken = {
  userId: string;
  role: string;
  tokenVersion: number;
  expiresAt: number;
};

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signature(secret: string, encodedPayload: string) {
  return createHmac('sha256', secret).update(`v1.${encodedPayload}`).digest('base64url');
}

function validSecret(secret: string) {
  if (secret.length < 32)
    throw new Error('Mobile auth secret must contain at least 32 characters.');
  return secret;
}

export function resolveMobileAuthSecret(
  env: Partial<
    Pick<NodeJS.ProcessEnv, 'MOBILE_AUTH_SECRET' | 'AUTH_SECRET' | 'NEXTAUTH_SECRET'>
  > = process.env,
) {
  const secret =
    env.MOBILE_AUTH_SECRET?.trim() || env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error('MOBILE_AUTH_SECRET or AUTH_SECRET is required.');
  return validSecret(secret);
}

export function createMobileAccessToken(
  secret: string,
  user: { userId: string; role: string; tokenVersion: number },
  now = Date.now(),
) {
  validSecret(secret);
  const payload: AccessTokenPayload = {
    typ: 'tahaddi-mobile-access',
    sub: user.userId,
    role: user.role,
    ver: user.tokenVersion,
    iat: now,
    exp: now + MOBILE_ACCESS_TOKEN_TTL_MS,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `v1.${encodedPayload}.${signature(secret, encodedPayload)}`;
}

export function verifyMobileAccessToken(
  secret: string,
  token: string,
  now = Date.now(),
): VerifiedMobileAccessToken | null {
  try {
    validSecret(secret);
    const [version, encodedPayload, suppliedSignature, extra] = token.split('.');
    if (version !== 'v1' || !encodedPayload || !suppliedSignature || extra) return null;
    const expectedSignature = signature(secret, encodedPayload);
    const expected = Buffer.from(expectedSignature);
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<AccessTokenPayload>;
    if (
      payload.typ !== 'tahaddi-mobile-access' ||
      typeof payload.sub !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.ver !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now
    ) {
      return null;
    }
    return {
      userId: payload.sub,
      role: payload.role,
      tokenVersion: payload.ver,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export function createMobileRefreshToken(tokenVersion: number) {
  return `m1.${tokenVersion}.${randomBytes(32).toString('base64url')}`;
}

export function mobileRefreshTokenVersion(rawToken: string) {
  const match = rawToken.match(/^m1\.(\d+)\.[A-Za-z0-9_-]{43}$/);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

export function hashMobileRefreshToken(rawToken: string) {
  return `mobile:v1:${createHash('sha256').update(rawToken).digest('hex')}`;
}

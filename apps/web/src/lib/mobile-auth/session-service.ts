import {
  createMobileAccessToken,
  createMobileRefreshToken,
  hashMobileRefreshToken,
  mobileRefreshTokenVersion,
  MOBILE_ACCESS_TOKEN_TTL_MS,
  MOBILE_REFRESH_TOKEN_TTL_MS,
} from './tokens';
import { hashInstallationSecret } from '@/lib/mobile-notifications/installation-capability';

export type MobileAuthUserRecord = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  status: string;
  tokenVersion: number;
};

export type MobileSessionRepository = {
  create(input: {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
    mobileInstallationId?: string;
    mobileInstallationSecretHash?: string;
  }): Promise<{ id: string }>;
  find(tokenHash: string): Promise<{
    id: string;
    tokenHash: string;
    expiresAt: Date;
    mobileInstallationId: string | null;
    user: MobileAuthUserRecord;
  } | null>;
  rotate(
    id: string,
    expectedHash: string,
    replacementHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<boolean>;
  revoke(tokenHash: string): Promise<void>;
};

export type MobileLogoutRepository = Pick<MobileSessionRepository, 'revoke'> & {
  revokeWithPushDevice(
    tokenHash: string,
    cleanup:
      | {
          expoPushToken: string;
          sessionId?: never;
          installationId?: never;
          installationSecret?: never;
          registrationRevision?: never;
        }
      | {
          sessionId: string;
          installationId: string;
          installationSecret: string;
          expoPushToken?: string;
          registrationRevision?: string;
        },
  ): Promise<boolean>;
};

export type IssuedMobileSession = {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
  user: { id: string; name: string; email: string; image: string | null };
};

function publicUser(user: MobileAuthUserRecord) {
  if (!user.email) throw new Error('Mobile authentication requires an email address.');
  return {
    id: user.id,
    name: user.name || user.email.split('@')[0] || 'لاعب',
    email: user.email,
    image: user.image,
  };
}

function issue(
  secret: string,
  user: MobileAuthUserRecord,
  sessionId: string,
  refreshToken: string,
  now: number,
): IssuedMobileSession {
  return {
    sessionId,
    accessToken: createMobileAccessToken(
      secret,
      { userId: user.id, role: user.role, tokenVersion: user.tokenVersion },
      now,
    ),
    refreshToken,
    expiresAt: now + MOBILE_ACCESS_TOKEN_TTL_MS,
    refreshExpiresAt: now + MOBILE_REFRESH_TOKEN_TTL_MS,
    user: publicUser(user),
  };
}

export async function createMobileSession(
  repository: MobileSessionRepository,
  secret: string,
  user: MobileAuthUserRecord,
  now = Date.now(),
  installation?: { installationId: string; installationSecret: string },
) {
  const refreshToken = createMobileRefreshToken(user.tokenVersion);
  const refreshExpiresAt = now + MOBILE_REFRESH_TOKEN_TTL_MS;
  const created = await repository.create({
    tokenHash: hashMobileRefreshToken(refreshToken),
    userId: user.id,
    expiresAt: new Date(refreshExpiresAt),
    mobileInstallationId: installation?.installationId,
    mobileInstallationSecretHash: installation
      ? hashInstallationSecret(installation.installationSecret)
      : undefined,
  });
  return issue(secret, user, created.id, refreshToken, now);
}

export async function rotateMobileSession(
  repository: MobileSessionRepository,
  secret: string,
  refreshToken: string,
  now = Date.now(),
) {
  const tokenHash = hashMobileRefreshToken(refreshToken);
  const issuedTokenVersion = mobileRefreshTokenVersion(refreshToken);
  if (issuedTokenVersion === null) return null;
  const existing = await repository.find(tokenHash);
  if (
    !existing ||
    existing.expiresAt.getTime() <= now ||
    existing.user.status !== 'ACTIVE' ||
    existing.user.tokenVersion !== issuedTokenVersion
  )
    return null;

  const replacement = createMobileRefreshToken(existing.user.tokenVersion);
  const refreshExpiresAt = now + MOBILE_REFRESH_TOKEN_TTL_MS;
  const rotated = await repository.rotate(
    existing.id,
    tokenHash,
    hashMobileRefreshToken(replacement),
    new Date(refreshExpiresAt),
    new Date(now),
  );
  return rotated ? issue(secret, existing.user, existing.id, replacement, now) : null;
}

export async function revokeMobileSession(
  repository: MobileSessionRepository,
  refreshToken: string,
) {
  await repository.revoke(hashMobileRefreshToken(refreshToken));
}

export async function revokeMobileSessionWithPushDevice(
  repository: MobileLogoutRepository,
  refreshToken: string,
  cleanup?:
    | {
        expoPushToken: string;
        sessionId?: never;
        installationId?: never;
        installationSecret?: never;
        registrationRevision?: never;
      }
    | {
        sessionId: string;
        installationId: string;
        installationSecret: string;
        expoPushToken?: string;
        registrationRevision?: string;
      },
) {
  const tokenHash = hashMobileRefreshToken(refreshToken);
  if (!cleanup) {
    await repository.revoke(tokenHash);
    return true;
  }
  return repository.revokeWithPushDevice(tokenHash, cleanup);
}

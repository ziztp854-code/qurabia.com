import { getPrismaClient } from '@/lib/auth/prisma';
import { installationSecretMatches } from '@/lib/mobile-notifications/installation-capability';
import type { MobileLogoutRepository, MobileSessionRepository } from './session-service';

export function createPrismaMobileSessionRepository(): MobileSessionRepository &
  MobileLogoutRepository {
  const prisma = getPrismaClient();
  return {
    async create({
      tokenHash,
      userId,
      expiresAt,
      mobileInstallationId,
      mobileInstallationSecretHash,
    }) {
      return prisma.session.create({
        data: {
          sessionToken: tokenHash,
          userId,
          expires: expiresAt,
          mobileInstallationId: mobileInstallationId ?? null,
          mobileInstallationSecretHash: mobileInstallationSecretHash ?? null,
        },
        select: { id: true },
      });
    },
    async find(tokenHash) {
      const session = await prisma.session.findUnique({
        where: { sessionToken: tokenHash },
        select: {
          id: true,
          sessionToken: true,
          expires: true,
          mobileInstallationId: true,
          mobileInstallationSecretHash: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
              status: true,
              tokenVersion: true,
            },
          },
        },
      });
      return session
        ? {
            id: session.id,
            tokenHash: session.sessionToken,
            expiresAt: session.expires,
            mobileInstallationId: session.mobileInstallationId,
            user: session.user,
          }
        : null;
    },
    async rotate(id, expectedHash, replacementHash, expiresAt, now) {
      const result = await prisma.session.updateMany({
        where: { id, sessionToken: expectedHash, expires: { gt: now } },
        data: { sessionToken: replacementHash, expires: expiresAt },
      });
      return result.count === 1;
    },
    async revoke(tokenHash) {
      await prisma.session.deleteMany({ where: { sessionToken: tokenHash } });
    },
    async revokeWithPushDevice(tokenHash, cleanup) {
      try {
        return await prisma.$transaction(async (transaction) => {
          if (!cleanup.sessionId) {
            const session = await transaction.session.findUnique({
              where: { sessionToken: tokenHash },
              select: { userId: true },
            });
            const device = await transaction.mobilePushDevice.findUnique({
              where: { expoPushToken: cleanup.expoPushToken },
              select: {
                userId: true,
                enabled: true,
                installationId: true,
                registrationRevision: true,
              },
            });
            await transaction.session.deleteMany({ where: { sessionToken: tokenHash } });
            if (device?.installationId || device?.registrationRevision) return true;
            if (!session) return !device?.enabled;
            await transaction.mobilePushDevice.updateMany({
              where: {
                userId: session.userId,
                expoPushToken: cleanup.expoPushToken,
                installationId: null,
                registrationRevision: null,
                enabled: true,
              },
              data: { enabled: false, lastSeenAt: new Date() },
            });
            return true;
          }
          const hasPushCleanup = Boolean(cleanup.expoPushToken && cleanup.registrationRevision);
          if (Boolean(cleanup.expoPushToken) !== Boolean(cleanup.registrationRevision)) return false;
          const [session, device] = await Promise.all([
            transaction.session.findUnique({
              where: { id: cleanup.sessionId },
              select: {
                id: true,
                mobileInstallationId: true,
                mobileInstallationSecretHash: true,
              },
            }),
            hasPushCleanup
              ? transaction.mobilePushDevice.findUnique({
                  where: { installationId: cleanup.installationId },
                  select: {
                    id: true,
                    expoPushToken: true,
                    enabled: true,
                    installationSecretHash: true,
                    registrationRevision: true,
                  },
                })
              : Promise.resolve(null),
          ]);
          const sessionAuthorized = Boolean(
            session &&
              session.mobileInstallationId === cleanup.installationId &&
              installationSecretMatches(
                cleanup.installationSecret,
                session.mobileInstallationSecretHash,
              ),
          );
          const deviceAuthorized = Boolean(
            device &&
              installationSecretMatches(cleanup.installationSecret, device.installationSecretHash),
          );

          // Always invalidate a refresh token the caller knows, but require a capability
          // before touching the stable session id or device registration.
          await transaction.session.deleteMany({ where: { sessionToken: tokenHash } });
          if (!sessionAuthorized && !deviceAuthorized) {
            if (!session && !device) return true;
            return false;
          }

          if (sessionAuthorized) {
            await transaction.session.deleteMany({
              where: { id: cleanup.sessionId, mobileInstallationId: cleanup.installationId },
            });
          }
          if (!hasPushCleanup || !device) return true;
          if (
            device.expoPushToken !== cleanup.expoPushToken! ||
            device.registrationRevision !== cleanup.registrationRevision!
          ) {
            // A newer registration superseded this logout tombstone.
            return true;
          }

          if (device.enabled) {
            const disabled = await transaction.mobilePushDevice.updateMany({
              where: {
                id: device.id,
                installationId: cleanup.installationId,
                installationSecretHash: device.installationSecretHash,
                registrationRevision: cleanup.registrationRevision!,
                enabled: true,
              },
              data: { enabled: false, lastSeenAt: new Date() },
            });
            if (disabled.count !== 1) return true;
          }
          return true;
        });
      } catch {
        // Expire the supplied identity while retaining it for a retry after transient storage failure.
        await prisma.session.updateMany({
          where: { sessionToken: tokenHash },
          data: { expires: new Date(0) },
        });
        return false;
      }
    },
  };
}

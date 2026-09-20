import { getPrismaClient } from '@/lib/auth/prisma';
import type { MobilePushDeviceRepository } from './device-registration';
import { installationSecretHashMatches } from './installation-capability';

export class PushRegistrationConflictError extends Error {
  constructor() {
    super('The push token is already bound to another active installation.');
    this.name = 'PushRegistrationConflictError';
  }
}

export class InvalidInstallationCapabilityError extends Error {
  constructor() {
    super('The installation capability does not match the registered installation.');
    this.name = 'InvalidInstallationCapabilityError';
  }
}

export function createPrismaMobilePushDeviceRepository(): MobilePushDeviceRepository {
  const prisma = getPrismaClient();
  return {
    async upsert(input, previousExpoPushToken, previousRegistrationRevision) {
      const now = new Date();
      return prisma.$transaction(async (transaction) => {
        const [tokenRecord, installationRecord] = await Promise.all([
          transaction.mobilePushDevice.findUnique({
            where: { expoPushToken: input.expoPushToken },
            select: {
              id: true,
              expoPushToken: true,
              userId: true,
              enabled: true,
              installationId: true,
              installationSecretHash: true,
              registrationRevision: true,
            },
          }),
          transaction.mobilePushDevice.findUnique({
            where: { installationId: input.installationId },
            select: {
              id: true,
              expoPushToken: true,
              userId: true,
              enabled: true,
              installationId: true,
              installationSecretHash: true,
              registrationRevision: true,
            },
          }),
        ]);

        const boundRecord = installationRecord ?? tokenRecord;
        if (boundRecord?.installationId === input.installationId) {
          if (
            !installationSecretHashMatches(
              input.installationSecretHash,
              boundRecord.installationSecretHash,
            )
          ) {
            throw new InvalidInstallationCapabilityError();
          }
        } else if (tokenRecord?.enabled) {
          if (!tokenRecord.installationId && tokenRecord.userId === input.userId) {
            // One-time upgrade of a legacy row by its existing authenticated owner.
          } else {
            throw new PushRegistrationConflictError();
          }
        }

        const isExactRegistration = (record: typeof boundRecord) =>
          Boolean(
            record &&
              record.installationId === input.installationId &&
              record.registrationRevision === input.registrationRevision &&
              record.userId === input.userId &&
              record.expoPushToken === input.expoPushToken &&
              installationSecretHashMatches(
                input.installationSecretHash,
                record.installationSecretHash,
              ),
          );

        const alreadyRegistered = isExactRegistration(boundRecord);
        if (previousRegistrationRevision === input.registrationRevision) {
          throw new PushRegistrationConflictError();
        }
        if (
          boundRecord?.installationId === input.installationId &&
          !alreadyRegistered &&
          boundRecord.registrationRevision !== previousRegistrationRevision
        ) {
          throw new PushRegistrationConflictError();
        }
        if (!boundRecord && previousRegistrationRevision) {
          throw new PushRegistrationConflictError();
        }
        if (
          boundRecord &&
          boundRecord.installationId !== input.installationId &&
          previousRegistrationRevision
        ) {
          throw new PushRegistrationConflictError();
        }

        if (tokenRecord && installationRecord && tokenRecord.id !== installationRecord.id) {
          if (tokenRecord.enabled) throw new PushRegistrationConflictError();
          if (
            tokenRecord.installationId &&
            tokenRecord.installationId !== input.installationId
          ) {
            await transaction.session.deleteMany({
              where: { mobileInstallationId: tokenRecord.installationId },
            });
          }
          const removed = await transaction.mobilePushDevice.deleteMany({
            where: {
              id: tokenRecord.id,
              userId: tokenRecord.userId,
              enabled: false,
              installationId: tokenRecord.installationId,
              registrationRevision: tokenRecord.registrationRevision,
            },
          });
          if (removed.count !== 1) throw new PushRegistrationConflictError();
        }

        const data = {
          userId: input.userId,
          expoPushToken: input.expoPushToken,
          installationId: input.installationId,
          installationSecretHash: input.installationSecretHash,
          registrationRevision: input.registrationRevision,
          platform: input.platform,
          deviceName: input.deviceName,
          deviceModel: input.deviceModel,
          osVersion: input.osVersion,
          appVersion: input.appVersion,
          enabled: true,
          lastSeenAt: now,
        };
        if (
          boundRecord &&
          !boundRecord.enabled &&
          boundRecord.installationId &&
          boundRecord.installationId !== input.installationId
        ) {
          // The Expo token may legitimately be reassigned by the provider. Revoke sessions
          // tied to the retired capability in the same transaction before replacing its verifier.
          await transaction.session.deleteMany({
            where: { mobileInstallationId: boundRecord.installationId },
          });
        }
        let registered: { id: string; registrationRevision: string } | null = alreadyRegistered
          ? { id: boundRecord!.id, registrationRevision: input.registrationRevision }
          : null;
        if (!registered && boundRecord) {
          const expectedWhere =
            boundRecord.installationId === input.installationId
              ? {
                  id: boundRecord.id,
                  userId: boundRecord.userId,
                  installationId: input.installationId,
                  installationSecretHash: boundRecord.installationSecretHash,
                  registrationRevision: previousRegistrationRevision,
                }
              : {
                  id: boundRecord.id,
                  userId: boundRecord.userId,
                  enabled: boundRecord.enabled,
                  installationId: boundRecord.installationId,
                  registrationRevision: boundRecord.registrationRevision,
                };
          const updated = await transaction.mobilePushDevice.updateMany({
            where: expectedWhere,
            data,
          });
          if (updated.count !== 1) {
            const current = await transaction.mobilePushDevice.findUnique({
              where: { installationId: input.installationId },
              select: {
                id: true,
                expoPushToken: true,
                userId: true,
                enabled: true,
                installationId: true,
                installationSecretHash: true,
                registrationRevision: true,
              },
            });
            if (!isExactRegistration(current)) throw new PushRegistrationConflictError();
            registered = { id: current!.id, registrationRevision: input.registrationRevision };
          } else {
            registered = { id: boundRecord.id, registrationRevision: input.registrationRevision };
          }
        }
        if (!registered) {
          const created = await transaction.mobilePushDevice.create({
            data,
            select: { id: true, registrationRevision: true },
          });
          if (!created.registrationRevision)
            throw new Error('Push registration revision was not saved.');
          registered = {
            id: created.id,
            registrationRevision: created.registrationRevision,
          };
        }

        if (previousExpoPushToken && previousExpoPushToken !== input.expoPushToken) {
          await transaction.mobilePushDevice.updateMany({
            where: {
              userId: input.userId,
              expoPushToken: previousExpoPushToken,
              installationId: input.installationId,
              enabled: true,
            },
            data: { enabled: false, lastSeenAt: now },
          });
        }
        const boundSession = await transaction.session.updateMany({
          where: {
            id: input.sessionId,
            userId: input.userId,
            OR: [
              { mobileInstallationId: null, mobileInstallationSecretHash: null },
              {
                mobileInstallationId: input.installationId,
                mobileInstallationSecretHash: input.installationSecretHash,
              },
            ],
          },
          data: {
            mobileInstallationId: input.installationId,
            mobileInstallationSecretHash: input.installationSecretHash,
          },
        });
        if (boundSession.count !== 1) {
          throw new InvalidInstallationCapabilityError();
        }
        return {
          id: registered.id,
          registrationRevision: registered.registrationRevision,
        };
      });
    },
    async disable(userId, input) {
      if (!('installationId' in input)) {
        const result = await prisma.mobilePushDevice.updateMany({
          where: {
            userId,
            expoPushToken: input.expoPushToken,
            installationId: null,
            registrationRevision: null,
            enabled: true,
          },
          data: { enabled: false, lastSeenAt: new Date() },
        });
        return result.count > 0;
      }
      const result = await prisma.mobilePushDevice.updateMany({
        where: {
          userId,
          expoPushToken: input.expoPushToken,
          installationId: input.installationId,
          installationSecretHash: input.installationSecretHash,
          registrationRevision: input.registrationRevision,
          enabled: true,
        },
        data: { enabled: false, lastSeenAt: new Date() },
      });
      return result.count > 0;
    },
  };
}

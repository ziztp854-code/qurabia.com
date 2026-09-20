import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashInstallationSecret } from '@/lib/mobile-notifications/installation-capability';

const mocks = vi.hoisted(() => {
  const transaction = {
    session: { findUnique: vi.fn(), deleteMany: vi.fn() },
    mobilePushDevice: { findUnique: vi.fn(), updateMany: vi.fn() },
  };
  return {
    prisma: {
      $transaction: vi.fn(),
      session: { updateMany: vi.fn() },
    },
    transaction,
  };
});

vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => mocks.prisma }));

import { createPrismaMobileSessionRepository } from './prisma-session-repository';

const cleanup = {
  sessionId: 'session-1',
  expoPushToken: `ExponentPushToken[${'a'.repeat(32)}]`,
  installationId: '11111111-1111-4111-8111-111111111111',
  installationSecret: 'a'.repeat(64),
  registrationRevision: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

describe('Prisma mobile logout repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
    mocks.transaction.mobilePushDevice.findUnique.mockResolvedValue({
      id: 'device-1',
      expoPushToken: cleanup.expoPushToken,
      enabled: true,
      installationSecretHash: hashInstallationSecret(cleanup.installationSecret),
      registrationRevision: cleanup.registrationRevision,
    });
    mocks.transaction.session.findUnique.mockResolvedValue({
      id: cleanup.sessionId,
      mobileInstallationId: cleanup.installationId,
      mobileInstallationSecretHash: hashInstallationSecret(cleanup.installationSecret),
    });
    mocks.transaction.mobilePushDevice.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.session.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.session.updateMany.mockResolvedValue({ count: 1 });
  });

  it('cleans up by installation capability even after refresh rotation lost the old hash', async () => {
    await expect(
      createPrismaMobileSessionRepository().revokeWithPushDevice('missing-old-refresh', cleanup),
    ).resolves.toBe(true);
    expect(mocks.transaction.mobilePushDevice.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'device-1',
        installationId: cleanup.installationId,
        installationSecretHash: hashInstallationSecret(cleanup.installationSecret),
        registrationRevision: cleanup.registrationRevision,
        enabled: true,
      },
      data: { enabled: false, lastSeenAt: expect.any(Date) },
    });
    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({
      where: { id: cleanup.sessionId, mobileInstallationId: cleanup.installationId },
    });
  });

  it('revokes a rotated session by capability when no push registration exists', async () => {
    mocks.transaction.mobilePushDevice.findUnique.mockResolvedValue(null);

    await expect(
      createPrismaMobileSessionRepository().revokeWithPushDevice('missing-old-refresh', {
        sessionId: cleanup.sessionId,
        installationId: cleanup.installationId,
        installationSecret: cleanup.installationSecret,
      }),
    ).resolves.toBe(true);

    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({
      where: { id: cleanup.sessionId, mobileInstallationId: cleanup.installationId },
    });
    expect(mocks.transaction.mobilePushDevice.updateMany).not.toHaveBeenCalled();
  });

  it('treats a stale same-user logout as obsolete without disabling a newer revision', async () => {
    mocks.transaction.mobilePushDevice.findUnique.mockResolvedValue({
      id: 'device-1',
      expoPushToken: cleanup.expoPushToken,
      enabled: true,
      installationSecretHash: hashInstallationSecret(cleanup.installationSecret),
      registrationRevision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    await expect(
      createPrismaMobileSessionRepository().revokeWithPushDevice('old-refresh', cleanup),
    ).resolves.toBe(true);
    expect(mocks.transaction.mobilePushDevice.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({
      where: { id: cleanup.sessionId, mobileInstallationId: cleanup.installationId },
    });
  });

  it('does not authorize cleanup with a mismatched installation secret', async () => {
    await expect(
      createPrismaMobileSessionRepository().revokeWithPushDevice('refresh-hash', {
        ...cleanup,
        installationSecret: 'b'.repeat(64),
      }),
    ).resolves.toBe(false);
    expect(mocks.transaction.mobilePushDevice.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({
      where: { sessionToken: 'refresh-hash' },
    });
  });

  it('does not revoke a relogged-in session when CAS loses to a newer registration', async () => {
    mocks.transaction.mobilePushDevice.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      createPrismaMobileSessionRepository().revokeWithPushDevice('old-refresh', cleanup),
    ).resolves.toBe(true);

    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({
      where: { id: cleanup.sessionId, mobileInstallationId: cleanup.installationId },
    });
  });
});

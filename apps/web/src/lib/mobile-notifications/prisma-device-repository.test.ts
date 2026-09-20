import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mobilePushDevice = {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  return {
    transaction: {
      mobilePushDevice,
      session: { updateMany: vi.fn(), deleteMany: vi.fn() },
    },
    prisma: {
      $transaction: vi.fn(),
      mobilePushDevice: { updateMany: vi.fn() },
    },
  };
});

vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => mocks.prisma }));

import {
  createPrismaMobilePushDeviceRepository,
  PushRegistrationConflictError,
} from './prisma-device-repository';

const token = `ExponentPushToken[${'a'.repeat(32)}]`;
const input = {
  userId: 'user-1',
  expoPushToken: token,
  sessionId: 'session-1',
  installationId: '11111111-1111-4111-8111-111111111111',
  installationSecretHash: 'a'.repeat(64),
  registrationRevision: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  platform: 'ios' as const,
  deviceName: null,
  deviceModel: null,
  osVersion: null,
  appVersion: null,
};

describe('Prisma mobile push device repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
    mocks.transaction.mobilePushDevice.findUnique.mockResolvedValue(null);
    mocks.transaction.mobilePushDevice.create.mockResolvedValue({
      id: 'device-1',
      registrationRevision: input.registrationRevision,
    });
    mocks.transaction.session.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.session.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('creates the capability-bound registration without storing the plaintext secret', async () => {
    await expect(
      createPrismaMobilePushDeviceRepository().upsert(input, null, null),
    ).resolves.toEqual({
      id: 'device-1',
      registrationRevision: input.registrationRevision,
    });
    expect(mocks.transaction.mobilePushDevice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationId: input.installationId,
        installationSecretHash: input.installationSecretHash,
        registrationRevision: input.registrationRevision,
      }),
      select: { id: true, registrationRevision: true },
    });
    expect(JSON.stringify(mocks.transaction.mobilePushDevice.create.mock.calls)).not.toContain(
      'installationSecret"',
    );
    expect(mocks.transaction.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        userId: 'user-1',
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
  });

  it('rejects takeover of an enabled token by another installation', async () => {
    mocks.transaction.mobilePushDevice.findUnique
      .mockResolvedValueOnce({
        id: 'victim-device',
        userId: 'victim',
        enabled: true,
        installationId: '22222222-2222-4222-8222-222222222222',
        installationSecretHash: 'b'.repeat(64),
        registrationRevision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      })
      .mockResolvedValueOnce(null);

    await expect(
      createPrismaMobilePushDeviceRepository().upsert(input, null, null),
    ).rejects.toBeInstanceOf(PushRegistrationConflictError);
    expect(mocks.transaction.mobilePushDevice.updateMany).not.toHaveBeenCalled();
  });

  it('allows a disabled token to be recovered under a fresh capability', async () => {
    mocks.transaction.mobilePushDevice.findUnique
      .mockResolvedValueOnce({
        id: 'disabled-device',
        userId: 'old-user',
        enabled: false,
        installationId: '22222222-2222-4222-8222-222222222222',
        installationSecretHash: 'b'.repeat(64),
        registrationRevision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      })
      .mockResolvedValueOnce(null);
    mocks.transaction.mobilePushDevice.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      createPrismaMobilePushDeviceRepository().upsert(input, null, null),
    ).resolves.toEqual({ id: 'disabled-device', registrationRevision: input.registrationRevision });
    expect(mocks.transaction.mobilePushDevice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'disabled-device', enabled: false }),
      }),
    );
    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({
      where: { mobileInstallationId: '22222222-2222-4222-8222-222222222222' },
    });
  });

  it('rejects a delayed registration whose expected revision is stale', async () => {
    const currentRevision = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    mocks.transaction.mobilePushDevice.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'device-1',
        expoPushToken: token,
        userId: input.userId,
        enabled: true,
        installationId: input.installationId,
        installationSecretHash: input.installationSecretHash,
        registrationRevision: currentRevision,
      });

    await expect(
      createPrismaMobilePushDeviceRepository().upsert(
        input,
        token,
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ),
    ).rejects.toBeInstanceOf(PushRegistrationConflictError);
    expect(mocks.transaction.mobilePushDevice.updateMany).not.toHaveBeenCalled();
  });

  it('treats a retried committed revision as idempotent after the response was lost', async () => {
    const committed = {
      id: 'device-1',
      expoPushToken: token,
      userId: input.userId,
      enabled: true,
      installationId: input.installationId,
      installationSecretHash: input.installationSecretHash,
      registrationRevision: input.registrationRevision,
    };
    mocks.transaction.mobilePushDevice.findUnique.mockResolvedValue(committed);

    await expect(
      createPrismaMobilePushDeviceRepository().upsert(
        input,
        token,
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ),
    ).resolves.toEqual({
      id: committed.id,
      registrationRevision: input.registrationRevision,
    });

    expect(mocks.transaction.mobilePushDevice.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.mobilePushDevice.create).not.toHaveBeenCalled();
    expect(mocks.transaction.session.updateMany).toHaveBeenCalledTimes(1);
  });

  it('does not disable a newer registration with a stale DELETE revision', async () => {
    mocks.prisma.mobilePushDevice.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      createPrismaMobilePushDeviceRepository().disable(input.userId, {
        expoPushToken: input.expoPushToken,
        installationId: input.installationId,
        installationSecretHash: input.installationSecretHash,
        registrationRevision: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    ).resolves.toBe(false);

    expect(mocks.prisma.mobilePushDevice.updateMany).toHaveBeenCalledWith({
      where: {
        userId: input.userId,
        expoPushToken: input.expoPushToken,
        installationId: input.installationId,
        installationSecretHash: input.installationSecretHash,
        registrationRevision: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        enabled: true,
      },
      data: { enabled: false, lastSeenAt: expect.any(Date) },
    });
  });

  it('revokes sessions for a retired disabled token capability before deleting its verifier', async () => {
    const retiredInstallationId = '22222222-2222-4222-8222-222222222222';
    const currentRevision = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    mocks.transaction.mobilePushDevice.findUnique
      .mockResolvedValueOnce({
        id: 'retired-token-row',
        expoPushToken: token,
        userId: 'old-user',
        enabled: false,
        installationId: retiredInstallationId,
        installationSecretHash: 'b'.repeat(64),
        registrationRevision: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      })
      .mockResolvedValueOnce({
        id: 'current-installation-row',
        expoPushToken: `ExponentPushToken[${'d'.repeat(32)}]`,
        userId: input.userId,
        enabled: true,
        installationId: input.installationId,
        installationSecretHash: input.installationSecretHash,
        registrationRevision: currentRevision,
      });
    mocks.transaction.mobilePushDevice.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mobilePushDevice.updateMany.mockResolvedValue({ count: 1 });

    await createPrismaMobilePushDeviceRepository().upsert(input, null, currentRevision);

    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({
      where: { mobileInstallationId: retiredInstallationId },
    });
    expect(mocks.transaction.mobilePushDevice.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'retired-token-row', enabled: false }),
    });
  });
});

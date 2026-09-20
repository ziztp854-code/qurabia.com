import { describe, expect, it, vi } from 'vitest';
import {
  registerMobilePushDevice,
  unregisterMobilePushDevice,
  type MobilePushDeviceRepository,
} from './device-registration';

const token = `ExponentPushToken[${'a'.repeat(32)}]`;
const capability = {
  installationId: '11111111-1111-4111-8111-111111111111',
  installationSecret: 'a'.repeat(64),
  registrationRevision: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

describe('mobile push device registration', () => {
  it('upserts the token for the authenticated user with bounded metadata', async () => {
    const upsert = vi
      .fn()
      .mockResolvedValue({ id: 'device-1', registrationRevision: capability.registrationRevision });
    const repository: MobilePushDeviceRepository = {
      upsert,
      disable: vi.fn(),
    };

    await registerMobilePushDevice(repository, 'user-1', {
      expoPushToken: token,
      sessionId: 'session-1',
      platform: 'ios',
      deviceName: ' iPhone ',
      deviceModel: null,
      osVersion: '18.4',
      appVersion: '0.1.0',
      previousExpoPushToken: null,
      previousRegistrationRevision: null,
      ...capability,
    });

    expect(upsert).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        expoPushToken: token,
        sessionId: 'session-1',
        platform: 'ios',
        deviceName: 'iPhone',
        deviceModel: null,
        osVersion: '18.4',
        appVersion: '0.1.0',
        installationId: capability.installationId,
        registrationRevision: capability.registrationRevision,
        installationSecretHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      null,
      null,
    );
  });

  it('passes a validated previous token to the repository for safe rotation', async () => {
    const upsert = vi
      .fn()
      .mockResolvedValue({ id: 'device-2', registrationRevision: capability.registrationRevision });
    const repository: MobilePushDeviceRepository = { upsert, disable: vi.fn() };
    const previousExpoPushToken = `ExponentPushToken[${'b'.repeat(32)}]`;
    const previousRegistrationRevision = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    await registerMobilePushDevice(repository, 'user-1', {
      expoPushToken: token,
      sessionId: 'session-1',
      previousExpoPushToken,
      previousRegistrationRevision,
      platform: 'ios',
      deviceName: null,
      deviceModel: null,
      osVersion: null,
      appVersion: null,
      ...capability,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      previousExpoPushToken,
      previousRegistrationRevision,
    );
  });

  it('disables only the authenticated user registration', async () => {
    const disable = vi.fn().mockResolvedValue(true);
    const repository: MobilePushDeviceRepository = { upsert: vi.fn(), disable };

    await expect(
      unregisterMobilePushDevice(repository, 'user-2', { expoPushToken: token }),
    ).resolves.toBe(true);
    expect(disable).toHaveBeenCalledWith('user-2', { expoPushToken: token });
  });

  it('hashes the installation secret for a revision-guarded removal', async () => {
    const disable = vi.fn().mockResolvedValue(true);
    const repository: MobilePushDeviceRepository = { upsert: vi.fn(), disable };

    await unregisterMobilePushDevice(repository, 'user-2', {
      expoPushToken: token,
      ...capability,
    });

    expect(disable).toHaveBeenCalledWith('user-2', {
      expoPushToken: token,
      installationId: capability.installationId,
      installationSecretHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      registrationRevision: capability.registrationRevision,
    });
  });
});

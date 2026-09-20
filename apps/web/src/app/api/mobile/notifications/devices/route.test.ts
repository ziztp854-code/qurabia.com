import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  register: vi.fn(),
  requireMobileUser: vi.fn(),
  unregister: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/mobile-auth/authorization', () => ({
  requireMobileUser: mocks.requireMobileUser,
}));
vi.mock('@/lib/mobile-notifications/device-registration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mobile-notifications/device-registration')>()),
  registerMobilePushDevice: mocks.register,
  unregisterMobilePushDevice: mocks.unregister,
}));
vi.mock('@/lib/mobile-notifications/prisma-device-repository', () => ({
  createPrismaMobilePushDeviceRepository: () => ({ repository: true }),
}));

import { DELETE, POST } from './route';

const token = `ExponentPushToken[${'a'.repeat(32)}]`;
const capability = {
  sessionId: 'session-1',
  installationId: '11111111-1111-4111-8111-111111111111',
  installationSecret: 'a'.repeat(64),
  registrationRevision: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};
function request(method: 'POST' | 'DELETE', body: unknown) {
  return new Request('https://qurabia.com/api/mobile/notifications/devices', {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer access-token' },
    body: JSON.stringify(body),
  });
}

describe('/api/mobile/notifications/devices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMobileUser.mockResolvedValue({ id: 'user-1' });
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.register.mockResolvedValue({
      id: 'device-1',
      registrationRevision: capability.registrationRevision,
    });
    mocks.unregister.mockResolvedValue(true);
  });

  it('requires mobile authentication', async () => {
    mocks.requireMobileUser.mockResolvedValue(null);
    const response = await POST(
      request('POST', { expoPushToken: token, platform: 'ios', ...capability }),
    );
    expect(response.status).toBe(401);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('registers a validated Expo push token', async () => {
    const response = await POST(
      request('POST', { expoPushToken: token, platform: 'ios', ...capability }),
    );
    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith(
      { repository: true },
      'user-1',
      expect.objectContaining({ expoPushToken: token, platform: 'ios', ...capability }),
    );
  });

  it('rejects arbitrary device tokens', async () => {
    const response = await POST(
      request('POST', { expoPushToken: 'apns-secret', platform: 'ios', ...capability }),
    );
    expect(response.status).toBe(400);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('unregisters only through the authenticated-user service boundary', async () => {
    const response = await DELETE(request('DELETE', { expoPushToken: token }));
    expect(response.status).toBe(200);
    expect(mocks.unregister).toHaveBeenCalledWith(
      { repository: true },
      'user-1',
      { expoPushToken: token },
    );
  });

  it('passes the installation revision guard to device removal', async () => {
    const removal = {
      expoPushToken: token,
      installationId: capability.installationId,
      installationSecret: capability.installationSecret,
      registrationRevision: capability.registrationRevision,
    };
    const response = await DELETE(request('DELETE', removal));

    expect(response.status).toBe(200);
    expect(mocks.unregister).toHaveBeenCalledWith({ repository: true }, 'user-1', removal);
  });

  it('returns a conflict when a capability removal loses the revision CAS', async () => {
    mocks.unregister.mockResolvedValue(false);
    const removal = {
      expoPushToken: token,
      installationId: capability.installationId,
      installationSecret: capability.installationSecret,
      registrationRevision: capability.registrationRevision,
    };

    const response = await DELETE(request('DELETE', removal));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'STALE_REGISTRATION' },
    });
  });
});

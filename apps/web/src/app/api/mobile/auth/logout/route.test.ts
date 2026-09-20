import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasDatabaseUrl: vi.fn(),
  revokeMobileSessionWithPushDevice: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({ hasDatabaseUrl: mocks.hasDatabaseUrl }));
vi.mock('@/lib/mobile-auth/prisma-session-repository', () => ({
  createPrismaMobileSessionRepository: () => ({ repository: true }),
}));
vi.mock('@/lib/mobile-auth/session-service', () => ({
  revokeMobileSessionWithPushDevice: mocks.revokeMobileSessionWithPushDevice,
}));

import { POST } from './route';

const refreshToken = `m1.0.${'a'.repeat(43)}`;
const expoPushToken = `ExponentPushToken[${'b'.repeat(32)}]`;
const cleanup = {
  sessionId: 'session-1',
  expoPushToken,
  installationId: '11111111-1111-4111-8111-111111111111',
  installationSecret: 'a'.repeat(64),
  registrationRevision: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};
function request(body: unknown) {
  return new Request('https://qurabia.com/api/mobile/auth/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/mobile/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.revokeMobileSessionWithPushDevice.mockResolvedValue(true);
  });

  it('atomically revokes the supplied refresh session and its owned push registration', async () => {
    const response = await POST(request({ refreshToken, ...cleanup }));
    expect(response.status).toBe(200);
    expect(mocks.revokeMobileSessionWithPushDevice).toHaveBeenCalledWith(
      { repository: true },
      refreshToken,
      cleanup,
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { signedOut: true, pushRegistrationDisabled: true },
    });
  });

  it('keeps logout successful while reporting a retryable push cleanup tombstone', async () => {
    mocks.revokeMobileSessionWithPushDevice.mockResolvedValue(false);

    const response = await POST(request({ refreshToken, ...cleanup }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { signedOut: true, pushRegistrationDisabled: false },
    });
  });

  it('accepts installation cleanup without a push registration after a lost refresh response', async () => {
    const capabilityOnly = {
      sessionId: cleanup.sessionId,
      installationId: cleanup.installationId,
      installationSecret: cleanup.installationSecret,
    };
    const response = await POST(request({ refreshToken, ...capabilityOnly }));

    expect(response.status).toBe(200);
    expect(mocks.revokeMobileSessionWithPushDevice).toHaveBeenCalledWith(
      { repository: true },
      refreshToken,
      capabilityOnly,
    );
  });

  it('rejects malformed logout bodies before touching the session repository', async () => {
    const response = await POST(request({ refreshToken: 'short' }));
    expect(response.status).toBe(400);
    expect(mocks.revokeMobileSessionWithPushDevice).not.toHaveBeenCalled();
  });

  it('rejects malformed push tokens before touching the session repository', async () => {
    const response = await POST(request({ refreshToken, expoPushToken: 'not-an-expo-token' }));
    expect(response.status).toBe(400);
    expect(mocks.revokeMobileSessionWithPushDevice).not.toHaveBeenCalled();
  });
});

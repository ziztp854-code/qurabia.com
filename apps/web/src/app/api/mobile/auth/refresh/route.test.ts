import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  rotateMobileSession: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({ hasDatabaseUrl: mocks.hasDatabaseUrl }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/mobile-auth/prisma-session-repository', () => ({
  createPrismaMobileSessionRepository: () => ({ repository: true }),
}));
vi.mock('@/lib/mobile-auth/session-service', () => ({
  rotateMobileSession: mocks.rotateMobileSession,
}));
vi.mock('@/lib/mobile-auth/tokens', () => ({
  hashMobileRefreshToken: () => `mobile:v1:${'a'.repeat(64)}`,
  resolveMobileAuthSecret: () => 'secret',
}));

import { POST } from './route';

const refreshToken = `m1.0.${'a'.repeat(43)}`;
function request(body: unknown) {
  return new Request('https://qurabia.com/api/mobile/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/mobile/auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.checkRateLimit.mockResolvedValue(true);
  });

  it('returns 401 after a refresh token is expired or consumed', async () => {
    mocks.rotateMobileSession.mockResolvedValue(null);
    const response = await POST(request({ refreshToken }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('SESSION_EXPIRED');
  });

  it('returns the rotated session', async () => {
    mocks.rotateMobileSession.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    const response = await POST(request({ refreshToken }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { accessToken: 'new-access' } });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createMobileSession: vi.fn(),
  createUser: vi.fn(),
  findUnique: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: mocks.hasDatabaseUrl,
  getPrismaClient: () => ({
    user: { findUnique: mocks.findUnique, create: mocks.createUser },
  }),
}));
vi.mock('@/lib/auth/password', () => ({ hashPassword: mocks.hashPassword }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/mobile-auth/prisma-session-repository', () => ({
  createPrismaMobileSessionRepository: () => ({ repository: true }),
}));
vi.mock('@/lib/mobile-auth/session-service', () => ({
  createMobileSession: mocks.createMobileSession,
}));
vi.mock('@/lib/mobile-auth/tokens', () => ({ resolveMobileAuthSecret: () => 'secret' }));

import { POST } from './route';

const validPassphrase = ['Strong', 'Pass', '123'].join('');

function request(body: unknown) {
  return new Request('https://qurabia.com/api/mobile/auth/sign-up', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/mobile/auth/sign-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.findUnique.mockResolvedValue(null);
    mocks.hashPassword.mockResolvedValue('password-hash');
    mocks.createUser.mockResolvedValue({
      id: 'user-1',
      name: 'مها',
      email: 'maha@example.com',
      image: null,
      role: 'USER',
      status: 'ACTIVE',
      tokenVersion: 0,
    });
    mocks.createMobileSession.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
  });

  it('creates the profile and returns a no-store authenticated session', async () => {
    const response = await POST(
      request({ name: 'مها', email: 'MAHA@example.com', password: validPassphrase }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.hashPassword).toHaveBeenCalledWith(validPassphrase);
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'مها',
          email: 'maha@example.com',
          passwordHash: 'password-hash',
          profile: { create: { displayName: 'مها' } },
        }),
      }),
    );
    expect(await response.json()).toMatchObject({ ok: true, data: { accessToken: 'access' } });
  });

  it('returns the same safe conflict for an existing email without hashing a password', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'existing' });
    const response = await POST(
      request({ name: 'مها', email: 'maha@example.com', password: validPassphrase }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('ACCOUNT_UNAVAILABLE');
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });
});

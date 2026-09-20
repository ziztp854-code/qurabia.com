import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createMobileSession: vi.fn(),
  findUnique: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  update: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: mocks.hasDatabaseUrl,
  getPrismaClient: () => ({ user: { findUnique: mocks.findUnique, update: mocks.update } }),
}));
vi.mock('@/lib/auth/password', () => ({ verifyPassword: mocks.verifyPassword }));
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
  return new Request('https://qurabia.com/api/mobile/auth/sign-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/mobile/auth/sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'مها',
      email: 'maha@example.com',
      image: null,
      passwordHash: 'hash',
      role: 'USER',
      status: 'ACTIVE',
      tokenVersion: 0,
    });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.update.mockResolvedValue(undefined);
    mocks.createMobileSession.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
  });

  it('rejects invalid input before database access', async () => {
    const response = await POST(request({ email: 'bad', password: '' }));
    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('returns a generic error for invalid credentials', async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const response = await POST(request({ email: 'maha@example.com', password: 'wrong' }));
    const payload = await response.json();
    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('INVALID_CREDENTIALS');
    expect(payload.error.message).not.toContain('email');
  });

  it('returns a no-store mobile session envelope for an active account', async () => {
    const response = await POST(request({ email: 'maha@example.com', password: validPassphrase }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(payload).toMatchObject({ ok: true, data: { accessToken: 'access' } });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it('binds a complete installation capability to the created mobile session', async () => {
    const installation = {
      installationId: '11111111-1111-4111-8111-111111111111',
      installationSecret: 'a'.repeat(64),
    };
    const response = await POST(
      request({
        email: 'maha@example.com',
        password: validPassphrase,
        ...installation,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createMobileSession).toHaveBeenCalledWith(
      { repository: true },
      'secret',
      expect.objectContaining({ id: 'user-1' }),
      expect.any(Number),
      installation,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentSession, isSessionUserCurrent } from './session';

const sessionMocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  unstable_rethrow: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: sessionMocks.getServerSession,
}));

vi.mock('./options', () => ({
  authOptions: { secret: 'test-secret' },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  unstable_rethrow: sessionMocks.unstable_rethrow,
}));

vi.mock('./prisma', () => ({
  hasDatabaseUrl: vi.fn(() => false),
  getPrismaClient: vi.fn(),
}));

const sessionUser = { id: 'user-1', tokenVersion: 3 };

describe('active session validation', () => {
  it('allows an active user with the current token version', () => {
    expect(
      isSessionUserCurrent(sessionUser, {
        id: 'user-1',
        role: 'USER',
        status: 'ACTIVE',
        tokenVersion: 3,
      }),
    ).toBe(true);
  });

  it('rejects a user suspended after the token was issued', () => {
    expect(
      isSessionUserCurrent(sessionUser, {
        id: 'user-1',
        role: 'USER',
        status: 'SUSPENDED',
        tokenVersion: 4,
      }),
    ).toBe(false);
  });

  it('rejects a stale token even when the account is active again', () => {
    expect(
      isSessionUserCurrent(sessionUser, {
        id: 'user-1',
        role: 'USER',
        status: 'ACTIVE',
        tokenVersion: 4,
      }),
    ).toBe(false);
  });
});

describe('getCurrentSession', () => {
  beforeEach(() => {
    sessionMocks.getServerSession.mockReset();
    sessionMocks.unstable_rethrow.mockReset();
  });

  it('يعيد الجلسة عندما تتوفر إعدادات NextAuth', async () => {
    sessionMocks.getServerSession.mockResolvedValue({ user: { id: 'user-1' } });

    await expect(getCurrentSession()).resolves.toEqual({ user: { id: 'user-1' } });
  });

  it('لا يسقط الصفحات العامة عند خطأ إعدادات NextAuth', async () => {
    const error = new Error('There is a problem with the server configuration.');
    sessionMocks.getServerSession.mockRejectedValue(error);

    await expect(getCurrentSession()).resolves.toBeNull();
    expect(sessionMocks.unstable_rethrow).toHaveBeenCalledWith(error);
  });

  it('يعيد رمي أخطاء التحكم الخاصة بـ Next.js', async () => {
    const error = Object.assign(new Error('Dynamic server usage'), {
      digest: 'DYNAMIC_SERVER_USAGE',
    });
    sessionMocks.unstable_rethrow.mockImplementation((value: unknown) => {
      throw value;
    });
    sessionMocks.getServerSession.mockRejectedValue(error);

    await expect(getCurrentSession()).rejects.toBe(error);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  hasDatabaseUrl: vi.fn(() => false),
  findUnique: vi.fn(),
}));

vi.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: vi.fn() }));
vi.mock('./prisma', () => ({
  hasDatabaseUrl: authMocks.hasDatabaseUrl,
  getPrismaClient: () => ({
    user: {
      findUnique: authMocks.findUnique,
      update: vi.fn(),
    },
  }),
}));

import { authOptions, resolveNextAuthSecret } from './options';

describe('resolveNextAuthSecret', () => {
  it('يفضّل AUTH_SECRET المستخدم في المنصة على NEXTAUTH_SECRET', () => {
    expect(
      resolveNextAuthSecret({ AUTH_SECRET: 'from-auth', NEXTAUTH_SECRET: 'from-next' }),
    ).toBe('from-auth');
  });

  it('يقبل NEXTAUTH_SECRET عندما لا يتوفر AUTH_SECRET', () => {
    expect(resolveNextAuthSecret({ NEXTAUTH_SECRET: 'from-next' })).toBe('from-next');
  });

  it('يعيد undefined بدل إرسال سر فارغ إلى NextAuth', () => {
    expect(resolveNextAuthSecret({})).toBeUndefined();
    expect(resolveNextAuthSecret({ AUTH_SECRET: '   ' })).toBeUndefined();
  });

  it('يمرر نفس السر إلى إعدادات NextAuth', () => {
    expect(authOptions.secret).toBe(resolveNextAuthSecret());
  });
});

describe('authOptions identity claims', () => {
  beforeEach(() => {
    authMocks.hasDatabaseUrl.mockReturnValue(false);
    authMocks.findUnique.mockReset();
  });

  it('يحدّث الجلسات القديمة بدور المدير من قاعدة البيانات', async () => {
    authMocks.hasDatabaseUrl.mockReturnValue(true);
    authMocks.findUnique.mockResolvedValue({
      role: 'ADMIN',
      status: 'ACTIVE',
      tokenVersion: 7,
    });
    const jwtCallback = authOptions.callbacks?.jwt;
    if (!jwtCallback) throw new Error('JWT callback is required');

    const token = await jwtCallback({ token: { id: 'admin-1' } } as never);

    expect(authMocks.findUnique).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      select: { role: true, status: true, tokenVersion: true },
    });
    expect(token).toMatchObject({ role: 'ADMIN', status: 'ACTIVE', tokenVersion: 7 });
  });

  it('ينقل دور المدير من الرمز إلى جلسة الواجهة', async () => {
    const sessionCallback = authOptions.callbacks?.session;
    if (!sessionCallback) throw new Error('Session callback is required');

    const session = await sessionCallback({
      session: { user: { name: 'عبدالعزيز' }, expires: '2099-01-01' },
      token: { id: 'admin-1', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 7 },
    } as never);

    expect(session.user).toMatchObject({
      id: 'admin-1',
      role: 'ADMIN',
      status: 'ACTIVE',
      tokenVersion: 7,
    });
  });

  it('يحدّث الدور المرئي دون تجديد نسخة جلسة ملغاة', async () => {
    authMocks.hasDatabaseUrl.mockReturnValue(true);
    authMocks.findUnique.mockResolvedValue({
      role: 'USER',
      status: 'ACTIVE',
      tokenVersion: 8,
    });
    const jwtCallback = authOptions.callbacks?.jwt;
    if (!jwtCallback) throw new Error('JWT callback is required');

    const token = await jwtCallback({
      token: {
        id: 'former-admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        tokenVersion: 7,
      },
    } as never);

    expect(token).toMatchObject({ role: 'USER', status: 'ACTIVE', tokenVersion: 7 });
  });
});

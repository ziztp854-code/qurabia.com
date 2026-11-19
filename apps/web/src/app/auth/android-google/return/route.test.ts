import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  findUser: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('@/lib/auth/options', () => ({ resolveNextAuthSecret: () => 'local-fixture' }));
vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: () => true,
  getPrismaClient: () => ({
    user: { findUnique: mocks.findUser },
    verificationToken: { create: mocks.create, deleteMany: mocks.deleteMany },
  }),
}));

const value = () => randomBytes(32).toString('base64url');
function request() {
  return new NextRequest(`https://qurabia.com/auth/android-google/return/?state=${value()}&challenge=${value()}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getToken.mockResolvedValue({ id: 'fixture', tokenVersion: 2, androidGoogleAuthenticatedAt: Date.now() });
  mocks.findUser.mockResolvedValue({ id: 'fixture', tokenVersion: 2, status: 'ACTIVE' });
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  mocks.create.mockResolvedValue({});
});

describe('Android browser return route', () => {
  it('issues a no-store return page explicitly addressed to Tahaddi', async () => {
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await result.text()).toContain(
      'scheme=com.qurabia.tahaddi.authqa.oauth;package=com.qurabia.tahaddi.authqa;',
    );
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it('requires a recent Google browser session before creating a grant', async () => {
    mocks.getToken.mockResolvedValue({ id: 'fixture', tokenVersion: 2 });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects the return when the account session has been revoked', async () => {
    mocks.findUser.mockResolvedValue({ id: 'fixture', tokenVersion: 3, status: 'ACTIVE' });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

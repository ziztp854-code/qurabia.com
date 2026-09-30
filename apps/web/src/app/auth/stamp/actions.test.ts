import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  hashPassword: vi.fn(),
  findStamp: vi.fn(),
  claimStamp: vi.fn(),
  findUser: vi.fn(),
  createUser: vi.fn(),
  createSubscription: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.9' })),
}));
vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: vi.fn().mockReturnValue(true),
  getPrismaClient: vi.fn().mockReturnValue({ $transaction: mocks.transaction }),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/auth/password', () => ({ hashPassword: mocks.hashPassword }));

import { registerWithStamp } from './actions';

function registration(code = 'THD-PRC-ABCD-EFGH') {
  const form = new FormData();
  form.set('name', 'أميرة');
  form.set('email', 'PRINCESS@example.com');
  form.set('password', 'secure-pass-123');
  form.set('code', code);
  return form;
}

describe('stamp holder registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.hashPassword.mockResolvedValue('hashed-password');
    mocks.findUser.mockResolvedValue(null);
    mocks.findStamp.mockResolvedValue({
      id: 'stamp-1',
      status: 'UNUSED',
      planCode: 'PRINCE',
      planVersion: 1,
      durationDays: 30,
    });
    mocks.claimStamp.mockResolvedValue({ count: 1 });
    mocks.createUser.mockResolvedValue({ id: 'user-1' });
    mocks.createSubscription.mockResolvedValue({ id: 'subscription-1' });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        user: { findUnique: mocks.findUser, create: mocks.createUser },
        subscriptionStamp: { findUnique: mocks.findStamp, updateMany: mocks.claimStamp },
        userSubscription: { create: mocks.createSubscription },
      }),
    );
  });

  it('creates a normal account and activates the rank granted by its unused stamp', async () => {
    const result = await registerWithStamp(
      { status: 'idle', message: '' },
      registration(' thd-prc-abcd-efgh '),
    );

    expect(result.status).toBe('success');
    expect(result.message).toContain('الأمير');
    expect(mocks.findStamp).toHaveBeenCalledWith({ where: { code: 'THD-PRC-ABCD-EFGH' } });
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'princess@example.com',
          role: 'USER',
          passwordHash: 'hashed-password',
        }),
      }),
    );
    expect(mocks.createSubscription).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: expect.any(String),
        stampId: 'stamp-1',
        planCode: 'PRINCE',
        source: 'STAMP',
        status: 'ACTIVE',
      }),
    });
    const accountId = mocks.createUser.mock.calls[0][0].data.id;
    expect(mocks.claimStamp).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ redeemedBy: accountId }),
      }),
    );
    expect(mocks.createSubscription.mock.calls[0][0].data.userId).toBe(accountId);
  });

  it('does not create an account for a redeemed stamp', async () => {
    mocks.findStamp.mockResolvedValue({
      id: 'stamp-1',
      status: 'REDEEMED',
      planCode: 'SULTAN',
      durationDays: 30,
    });

    const result = await registerWithStamp({ status: 'idle', message: '' }, registration());

    expect(result.status).toBe('error');
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it('does not create an account when another request claims the stamp first', async () => {
    mocks.claimStamp.mockResolvedValue({ count: 0 });

    const result = await registerWithStamp({ status: 'idle', message: '' }, registration());

    expect(result.status).toBe('error');
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it('rejects a malformed stamp before reading the database', async () => {
    const result = await registerWithStamp({ status: 'idle', message: '' }, registration('bad!'));

    expect(result.status).toBe('error');
    expect(result.errors?.code).toBeTruthy();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('does not claim a stamp for an existing account', async () => {
    mocks.findUser.mockResolvedValue({ id: 'existing-user' });

    const result = await registerWithStamp({ status: 'idle', message: '' }, registration());

    expect(result.status).toBe('error');
    expect(mocks.claimStamp).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it('does not reveal whether an email exists when the supplied stamp is unknown', async () => {
    mocks.findStamp.mockResolvedValue(null);
    const unknownEmailResult = await registerWithStamp(
      { status: 'idle', message: '' },
      registration(),
    );

    mocks.findUser.mockResolvedValue({ id: 'existing-user' });
    const existingEmailResult = await registerWithStamp(
      { status: 'idle', message: '' },
      registration(),
    );

    expect(existingEmailResult).toEqual(unknownEmailResult);
  });

  it('does not create an account when the signup rate limit is reached', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await registerWithStamp({ status: 'idle', message: '' }, registration());

    expect(result.status).toBe('error');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('limits registration attempts by email even when the client IP changes', async () => {
    mocks.checkRateLimit.mockImplementation(
      async (key: string) => key !== 'signup-stamp-email:princess@example.com',
    );

    const result = await registerWithStamp({ status: 'idle', message: '' }, registration());

    expect(result.status).toBe('error');
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('signup-stamp-email:princess@example.com', 5);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  checkRateLimit: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.9' })),
}));
vi.mock('workflow/api', () => ({ start: mocks.start }));
vi.mock('@/lib/auth/email', () => ({
  canDeliverPasswordReset: vi.fn().mockReturnValue(true),
  canDeliverSignupEmail: vi.fn().mockReturnValue(true),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: vi.fn().mockReturnValue(true),
  getPrismaClient: vi.fn().mockReturnValue({
    user: { findUnique: mocks.findUnique, create: mocks.create },
  }),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/auth/password', () => ({ hashPassword: mocks.hashPassword }));
vi.mock('@/workflows/user-signup', () => ({ handleUserSignup: vi.fn() }));

import { registerWithPassword } from './actions';
import { handleUserSignup } from '@/workflows/user-signup';

describe('registerWithPassword onboarding workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.findUnique.mockResolvedValue(null);
    mocks.hashPassword.mockResolvedValue('hashed-password');
    mocks.create.mockResolvedValue({
      id: 'user_123',
      email: 'player@example.com',
      name: 'لاعب',
    });
    mocks.start.mockResolvedValue({ runId: 'run_123' });
  });

  it('creates the account once and enqueues onboarding without waiting for completion', async () => {
    const formData = new FormData();
    formData.set('name', 'لاعب');
    formData.set('email', 'PLAYER@example.com');
    formData.set('password', 'secure-pass-123');

    const result = await registerWithPassword({ status: 'idle', message: '' }, formData);

    expect(result.status).toBe('success');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledWith(handleUserSignup, [
      { id: 'user_123', email: 'player@example.com', name: 'لاعب' },
    ]);
  });

  it('applies an IP signup limit that does not change with the email address', async () => {
    const firstSignup = new FormData();
    firstSignup.set('name', 'لاعب');
    firstSignup.set('email', 'first@example.com');
    firstSignup.set('password', 'secure-pass-123');
    const secondSignup = new FormData();
    secondSignup.set('name', 'لاعب آخر');
    secondSignup.set('email', 'second@example.com');
    secondSignup.set('password', 'secure-pass-456');

    await registerWithPassword({ status: 'idle', message: '' }, firstSignup);
    await registerWithPassword({ status: 'idle', message: '' }, secondSignup);

    expect(mocks.checkRateLimit.mock.calls).toEqual([
      ['signup-ip:203.0.113.9', 5],
      ['signup:203.0.113.9:first@example.com', 5],
      ['signup-ip:203.0.113.9', 5],
      ['signup:203.0.113.9:second@example.com', 5],
    ]);
  });
});

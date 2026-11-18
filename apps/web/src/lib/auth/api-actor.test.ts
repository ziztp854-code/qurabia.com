import { beforeEach, describe, expect, it, vi } from 'vitest';
import { limitApiActor, requireApiActor } from './api-actor';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  limiter: vi.fn(),
}));

vi.mock('./session', () => ({ getCurrentSession: mocks.session }));
vi.mock('./prisma', () => ({ getPrismaClient: () => ({ user: { findUnique: mocks.findUser } }) }));
vi.mock('./rate-limit', () => ({ checkRateLimit: mocks.limiter }));

describe('account API authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { id: 'actor', tokenVersion: 3 } });
    mocks.findUser.mockResolvedValue({ id: 'actor', role: 'USER', status: 'ACTIVE', tokenVersion: 3 });
    mocks.limiter.mockResolvedValue(true);
  });

  it('requires authentication before querying the account', async () => {
    mocks.session.mockResolvedValue(null);
    await expect(requireApiActor()).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' });
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it('accepts the current account and rejects stale or suspended sessions', async () => {
    await expect(requireApiActor()).resolves.toEqual({ id: 'actor' });
    mocks.findUser.mockResolvedValueOnce({ id: 'actor', role: 'USER', status: 'ACTIVE', tokenVersion: 4 });
    mocks.findUser.mockResolvedValueOnce({ id: 'actor', role: 'USER', status: 'SUSPENDED', tokenVersion: 3 });
    await expect(requireApiActor()).rejects.toMatchObject({ status: 401, code: 'SESSION_REVOKED' });
    await expect(requireApiActor()).rejects.toMatchObject({ status: 401, code: 'SESSION_REVOKED' });
  });

  it('retains the existing per-account read and write rate limits', async () => {
    await limitApiActor('actor', false, 'game-favorites');
    expect(mocks.limiter).toHaveBeenCalledWith('voice-game-favorites-read:actor', 120, 60_000);
    mocks.limiter.mockResolvedValue(false);
    await expect(limitApiActor('actor', true, 'profile')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMIT',
    });
    expect(mocks.limiter).toHaveBeenCalledWith('voice-profile-write:actor', 40, 60_000);
  });
});

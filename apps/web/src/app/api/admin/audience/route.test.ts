import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  getAudienceSnapshot: vi.fn(),
  getCurrentSession: vi.fn(),
  hasDatabaseUrl: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({ user: { findUnique: mocks.findUnique } }),
  hasDatabaseUrl: mocks.hasDatabaseUrl,
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: mocks.getCurrentSession,
  isSessionUserCurrent: (
    sessionUser: { id: string; tokenVersion: number },
    storedUser: { id: string; status: string; tokenVersion: number } | null,
  ) =>
    storedUser?.status === 'ACTIVE' &&
    storedUser.id === sessionUser.id &&
    storedUser.tokenVersion === sessionUser.tokenVersion,
}));

vi.mock('@/lib/presence/audience', () => ({
  getAudienceSnapshot: mocks.getAudienceSnapshot,
}));

describe('admin audience route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.getCurrentSession.mockResolvedValue({ user: { id: 'user-1', tokenVersion: 1 } });
    mocks.findUnique.mockResolvedValue({
      id: 'user-1',
      role: 'OWNER',
      status: 'ACTIVE',
      tokenVersion: 1,
    });
    mocks.getAudienceSnapshot.mockResolvedValue({
      presentNow: 2,
      uniqueToday: 9,
      viewsToday: 11,
      livePlayers: 1,
      recentLogins: 4,
      updatedAt: '2026-08-17T00:00:00.000Z',
      source: 'memory',
    });
  });

  it('returns the snapshot to the owner', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, presentNow: 2, uniqueToday: 9 });
  });

  it('forbids a moderator', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'user-1',
      role: 'MODERATOR',
      status: 'ACTIVE',
      tokenVersion: 1,
    });

    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.getAudienceSnapshot).not.toHaveBeenCalled();
  });

  it('does not expose the snapshot without an authenticated session', async () => {
    mocks.getCurrentSession.mockResolvedValue(null);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).not.toHaveProperty('presentNow');
    expect(payload).not.toHaveProperty('livePlayers');
    expect(mocks.getAudienceSnapshot).not.toHaveBeenCalled();
  });
});

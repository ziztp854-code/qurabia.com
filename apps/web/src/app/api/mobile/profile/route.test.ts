import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null as { id: string; role: string } | null,
  getProfile: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({ hasDatabaseUrl: () => true }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/mobile-auth/authorization', () => ({
  requireMobileUser: vi.fn(async () => mocks.user),
}));
vi.mock('@/lib/mobile-profile', () => ({
  MobileProfileError: class MobileProfileError extends Error {},
  createDefaultMobileProfileService: () => ({ getProfile: mocks.getProfile }),
}));

import { GET } from './route';

describe('GET /api/mobile/profile', () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.getProfile.mockReset();
  });

  it('requires a valid mobile session', async () => {
    const response = await GET(new Request('https://qurabia.com/api/mobile/profile'));
    expect(response.status).toBe(401);
    expect(mocks.getProfile).not.toHaveBeenCalled();
  });

  it('returns the server-authored rank and aggregates for the authenticated user only', async () => {
    mocks.user = { id: 'user-1', role: 'USER' };
    mocks.getProfile.mockResolvedValue({
      id: 'user-1',
      displayName: 'مها',
      rank: { code: 'KNIGHT', name: 'الفارس', emblem: '⚜' },
      stats: { quizzes: 2, questions: 12, participations: 4, hostedRooms: 1 },
    });
    const response = await GET(
      new Request('https://qurabia.com/api/mobile/profile', {
        headers: { authorization: 'Bearer access' },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.getProfile).toHaveBeenCalledWith('user-1');
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { rank: { code: 'KNIGHT', name: 'الفارس' }, stats: { questions: 12 } },
    });
  });
});

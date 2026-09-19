import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  getLeaderboardPayload: vi.fn(),
  getPrismaClient: vi.fn(),
  hasDatabaseUrl: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: mocks.getPrismaClient,
  hasDatabaseUrl: mocks.hasDatabaseUrl,
}));

vi.mock('@/lib/leaderboard/standings', () => ({
  getLeaderboardPayload: mocks.getLeaderboardPayload,
}));

describe('leaderboard route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.getPrismaClient.mockReturnValue({ liveSession: {} });
    mocks.getLeaderboardPayload.mockResolvedValue({
      ok: true,
      players: [{ id: 'player-1', name: 'أميرة', score: 2450, rank: 1, streak: 1 }],
      updatedAt: '2026-08-12T10:00:00.000Z',
      finishedSessions: 1,
    });
  });

  it('يعيد الفائزين من مصدر قاعدة البيانات بدون كاش', async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.getLeaderboardPayload).toHaveBeenCalledWith({ liveSession: {} });
    expect(payload.players[0].name).toBe('أميرة');
  });

  it('يعيد قائمة فارغة آمنة عند عدم ضبط قاعدة البيانات', async () => {
    mocks.hasDatabaseUrl.mockReturnValue(false);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.players).toEqual([]);
    expect(mocks.getLeaderboardPayload).not.toHaveBeenCalled();
  });
});

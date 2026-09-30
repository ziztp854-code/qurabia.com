import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMonitoringSnapshot } from './monitor';

const mocks = vi.hoisted(() => ({
  roomCount: vi.fn(),
  recentRooms: vi.fn(),
  userCount: vi.fn(),
  audience: vi.fn(),
  errors: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({
    liveSession: { count: mocks.roomCount, findMany: mocks.recentRooms },
    user: { count: mocks.userCount },
  }),
}));
vi.mock('@/lib/presence/audience', () => ({ getAudienceSnapshot: mocks.audience }));
vi.mock('./monitor-errors', () => ({ getRecentSentryIssues: mocks.errors }));

describe('getMonitoringSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_REALTIME_URL', 'https://realtime.example.com');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://site.example.com');
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/1');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@example.ingest.sentry.io/1');
    mocks.roomCount.mockResolvedValueOnce(3).mockResolvedValueOnce(7);
    mocks.recentRooms.mockResolvedValue([
      {
        id: 'room-1',
        roomCode: 'ABC123',
        status: 'ACTIVE',
        createdAt: new Date('2026-09-27T08:00:00Z'),
        quiz: { title: 'مسابقة' },
        _count: { participants: 4 },
      },
    ]);
    mocks.userCount.mockResolvedValue(5);
    mocks.errors.mockResolvedValue({ status: 'available', issues: [] });
    mocks.audience.mockResolvedValue({
      presentNow: 8,
      uniqueToday: 30,
      viewsToday: 36,
      livePlayers: 4,
      recentLogins: 6,
      updatedAt: '2026-09-27T08:00:00.000Z',
      source: 'redis',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ service: 'tahaddi-realtime', status: 'ok' }),
      }),
    );
  });

  it('combines real activity with a bounded service response check', async () => {
    const snapshot = await getMonitoringSnapshot(new Date('2026-09-27T09:00:00Z'));

    expect(snapshot.rooms.active).toBe(3);
    expect(snapshot.rooms.created24h).toBe(7);
    expect(snapshot.rooms.livePlayers).toBe(4);
    expect(snapshot.rooms.recent).toMatchObject([{ code: 'ABC123', participants: 4 }]);
    expect(snapshot.audience?.presentNow).toBe(8);
    expect(snapshot.services.realtime.status).toBe('responsive');
    expect(snapshot.services.errorCapture.server).toBe(true);
    expect(snapshot.services.web.status).toBe('responsive');
    expect(mocks.roomCount).toHaveBeenCalledWith({
      where: { status: { in: ['WAITING', 'ACTIVE'] } },
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://realtime.example.com/health',
      expect.objectContaining({ cache: 'no-store', redirect: 'error' }),
    );
    expect(mocks.recentRooms).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: { participants: { where: expect.objectContaining({ status: 'CONNECTED' }) } },
          },
        }),
      }),
    );
  });

  it('marks unavailable sources without inventing zero activity', async () => {
    mocks.audience.mockRejectedValue(new Error('presence unavailable'));
    vi.mocked(fetch).mockRejectedValue(new Error('network unavailable'));

    const snapshot = await getMonitoringSnapshot(new Date('2026-09-27T09:00:00Z'));

    expect(snapshot.audience).toBeNull();
    expect(snapshot.services.realtime.status).toBe('unavailable');
  });

  it('keeps the dashboard readable when a metric query fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.roomCount.mockReset().mockRejectedValue(new Error('database timeout'));
    const snapshot = await getMonitoringSnapshot(new Date('2026-09-27T09:00:00Z'));

    expect(snapshot.rooms.active).toBeNull();
    expect(snapshot.rooms.recent).toBeNull();
    expect(snapshot.newUsers24h).toBeNull();
    expect(snapshot.services.databaseStatus).toBe('unavailable');
    vi.restoreAllMocks();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  smembers: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limit', () => ({
  getSharedRedis: () => ({ get: mocks.get, smembers: mocks.smembers }),
}));

vi.mock('./presence-store', () => ({
  readPresenceCounts: vi.fn().mockResolvedValue({
    presentNow: 4,
    uniqueToday: 8,
    viewsToday: 12,
  }),
}));

import { getLiveStats } from './live-stats';

describe('getLiveStats', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.smembers.mockReset();
  });

  it('يجمع لاعبي الغرف النشطة من أشكال Redis الفعلية', async () => {
    mocks.smembers.mockImplementation(async (key: string) => {
      if (key === 'special-game:pins:active') return ['SPECIAL1'];
      if (key === 'chess:pins:active') return ['CHESS1'];
      if (key === 'baloot:roomCodes:active') return ['BALOOT1'];
      if (key === 'ladder:roomCodes:active') return ['LADDER1'];
      return [];
    });
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'special-game:SPECIAL1:room') return { players: [{}, {}] };
      if (key === 'chess:room:CHESS1') return { seats: { white: {}, black: {} } };
      if (key === 'baloot:room:BALOOT1') return { seats: [{}, {}, null, null] };
      if (key === 'ladder:room:LADDER1') return { teams: [{}, {}, {}] };
      return null;
    });

    await expect(getLiveStats()).resolves.toEqual({ presentNow: 4, livePlayers: 9 });
  });
});

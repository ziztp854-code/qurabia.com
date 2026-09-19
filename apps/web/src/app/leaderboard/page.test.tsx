import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LeaderboardPage from './page';

const mocks = vi.hoisted(() => ({
  getLeaderboardPayload: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: () => true,
  getPrismaClient: () => ({}),
}));

vi.mock('@/lib/leaderboard/standings', () => ({
  getLeaderboardPayload: mocks.getLeaderboardPayload,
}));

describe('LeaderboardPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('يعرض الفائزين المحدثين داخل صورة لوحة الشرف', async () => {
    mocks.getLeaderboardPayload.mockResolvedValue({
      ok: true,
      players: [
        { id: '1', name: 'نورة', score: 20000, rank: 1 },
        { id: '2', name: 'خالد', score: 18000, rank: 2 },
        { id: '3', name: 'سارة', score: 16000, rank: 3 },
        { id: '4', name: 'فهد', score: 14000, rank: 4 },
      ],
      updatedAt: '2026-08-25T00:00:00.000Z',
      finishedSessions: 2,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          players: [
            { id: '1', name: 'نورة', score: 20000, rank: 1 },
            { id: '2', name: 'خالد', score: 18000, rank: 2 },
            { id: '3', name: 'سارة', score: 16000, rank: 3 },
            { id: '4', name: 'فهد', score: 14000, rank: 4 },
          ],
        }),
      }),
    );

    render(await LeaderboardPage());

    expect(screen.getByRole('heading', { level: 1, name: 'لوحة الشرف' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رجوع' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /لوحة الشرف/ })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getAllByText('نورة')).toHaveLength(2);
    expect(screen.getAllByText('20,000')).toHaveLength(2);
    expect(screen.getByText('فهد')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'تحديث الترتيب' })).not.toBeInTheDocument();
  });
});

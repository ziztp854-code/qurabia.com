import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LadderAdminPage from './page';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(path);
  }),
  count: vi.fn(),
  findMany: vi.fn(),
  redis: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/session', () => ({ requireActiveUser: mocks.user }));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({ question: { count: mocks.count, findMany: mocks.findMany } }),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ getSharedRedis: mocks.redis }));
vi.mock('@/components/games/ladder/ladder-report', () => ({
  LadderReport: () => <div>تفاصيل التقرير</div>,
}));

describe('owner ladder dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    mocks.redis.mockReturnValue(null);
  });
  it('rejects administrators before reading questions or reports', async () => {
    mocks.user.mockResolvedValue({ role: 'ADMIN' });
    await expect(LadderAdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      '/forbidden',
    );
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.redis).not.toHaveBeenCalled();
  });
  it('limits questions to ladder and displays only completed reports', async () => {
    mocks.user.mockResolvedValue({ role: 'OWNER' });
    mocks.redis.mockReturnValue({
      smembers: vi.fn().mockResolvedValue(['A', 'B']),
      get: vi
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(
            key.endsWith('A')
              ? {
                  roomCode: 'A',
                  status: 'finished',
                  roundHistory: [{ questionId: 'q' }],
                  teams: [],
                  rightScore: 1,
                  leftScore: 0,
                }
              : { status: 'playing', roundHistory: [{ questionId: 'q' }] },
          ),
        ),
    });
    render(await LadderAdminPage({ searchParams: Promise.resolve({ q: 'تاريخ' }) }));
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          gameTypes: { has: 'LADDER' },
          prompt: { contains: 'تاريخ', mode: 'insensitive' },
        }),
      }),
    );
    expect(screen.getByText('A').closest('summary')).toHaveTextContent('غرفة');
    expect(screen.getByText('تفاصيل التقرير')).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  displayPage: vi.fn(),
  findFirst: vi.fn(),
  hasDatabaseUrl: vi.fn(() => true),
}));

vi.mock('../display/page', () => ({ default: mocks.displayPage }));
vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: mocks.hasDatabaseUrl,
  getPrismaClient: () => ({ liveSession: { findFirst: mocks.findFirst } }),
}));

import Page from './page';

describe('BroadcastPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.displayPage.mockResolvedValue('display');
  });

  it('uses the requested live session in the shared display experience', async () => {
    await Page({ searchParams: Promise.resolve({ sessionId: 'session-1' }) });

    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.displayPage).toHaveBeenCalledWith({
      searchParams: expect.any(Promise),
    });
    await expect(mocks.displayPage.mock.calls[0][0].searchParams).resolves.toEqual({
      sessionId: 'session-1',
      preview: undefined,
    });
  });

  it('keeps the latest active-session fallback when no id is supplied', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'latest-session' });

    await Page({ searchParams: Promise.resolve({}) });

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { status: { in: ['WAITING', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    await expect(mocks.displayPage.mock.calls[0][0].searchParams).resolves.toEqual({
      sessionId: 'latest-session',
      preview: undefined,
    });
  });
});

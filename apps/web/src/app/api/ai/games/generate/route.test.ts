import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyAiGameDraftToken } from '@tahaddi/contracts';

const AUTH_SECRET = 'test-only-auth-secret-32-characters';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  findUnique: vi.fn(),
  generateGameContentDraft: vi.fn(),
  getCurrentSession: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
  subscriptionFindMany: vi.fn(),
  usageUpdateMany: vi.fn(),
  usageFindUnique: vi.fn(),
  usageCreate: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({
    user: { findUnique: mocks.findUnique },
    userSubscription: {
      updateMany: mocks.subscriptionUpdateMany,
      findMany: mocks.subscriptionFindMany,
    },
    usageCounter: {
      create: mocks.usageCreate,
      updateMany: mocks.usageUpdateMany,
      findUnique: mocks.usageFindUnique,
    },
  }),
  hasDatabaseUrl: mocks.hasDatabaseUrl,
}));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: mocks.getCurrentSession,
  isSessionUserCurrent: () => true,
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/ai/game-content-generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/game-content-generation')>()),
  generateGameContentDraft: mocks.generateGameContentDraft,
}));

import { POST } from './route';

describe('AI game generation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.getCurrentSession.mockResolvedValue({ user: { id: 'user-1', tokenVersion: 1 } });
    mocks.findUnique.mockResolvedValue({
      id: 'user-1',
      role: 'USER',
      status: 'ACTIVE',
      tokenVersion: 1,
    });
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.subscriptionUpdateMany.mockResolvedValue({ count: 0 });
    mocks.subscriptionFindMany.mockResolvedValue([]);
    mocks.usageCreate.mockResolvedValue({ count: 0 });
    mocks.usageUpdateMany.mockResolvedValue({ count: 1 });
    mocks.usageFindUnique.mockResolvedValue({ count: 1 });
    mocks.generateGameContentDraft.mockResolvedValue({
      game: 'mafia',
      content: {
        title: 'ليلة القصر',
        intro: 'انطفأت الأنوار واختفى الحارس داخل القصر في ظروف غامضة.',
        clues: ['ساعة متوقفة', 'رسالة ممزقة', 'آثار طين'],
        hostBrief: 'اكشف دليلًا واحدًا مع كل نهار.',
      },
    });
    process.env.AUTH_SECRET = AUTH_SECRET;
  });

  it('rejects an oversized chunked body without trusting content-length', async () => {
    const request = new Request('http://localhost/api/ai/games/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({
        game: 'mafia',
        topic: 'أ'.repeat(9_000),
        roundCount: 3,
      }),
    });
    request.headers.delete('content-length');

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.generateGameContentDraft).not.toHaveBeenCalled();
  });

  it('returns a signed short-lived approval token with the reviewed draft', async () => {
    const request = new Request('http://localhost/api/ai/games/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({ game: 'mafia', topic: 'ليلة في القصر', roundCount: 3 }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { approvalToken: string };

    expect(response.status).toBe(200);
    expect(verifyAiGameDraftToken(AUTH_SECRET, payload.approvalToken)).toMatchObject({
      game: 'mafia',
    });
  });
});

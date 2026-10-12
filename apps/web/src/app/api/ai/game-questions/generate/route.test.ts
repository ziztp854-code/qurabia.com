import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  current: vi.fn(),
  database: vi.fn(),
  user: vi.fn(),
  rate: vi.fn(),
  quota: vi.fn(),
  generate: vi.fn(),
  transaction: vi.fn(),
  category: vi.fn(),
  quiz: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: mocks.session,
  isSessionUserCurrent: mocks.current,
}));
vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: mocks.database,
  getPrismaClient: () => ({ user: { findUnique: mocks.user }, $transaction: mocks.transaction }),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/subscription/entitlements', () => ({ consumeQuota: mocks.quota }));
vi.mock('@/lib/ai/game-question-refresh', () => ({ generateFreshGameQuestions: mocks.generate }));
vi.mock('@/lib/quiz/room-code', () => ({ generateUniqueActivityRoomCode: async () => 'ABC123' }));
import { POST } from './route';

function request(game = 'letter-challenge', origin = 'http://localhost', extra = {}) {
  return new Request('http://localhost/api/ai/game-questions/generate', {
    method: 'POST',
    headers: { origin },
    body: JSON.stringify({ game, topic: 'ثقافة عامة', ...extra }),
  });
}
describe('game question refresh API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('XAI_API_KEY', 'test-only');
    vi.stubEnv('XAI_DISABLED', 'false');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost');
    mocks.database.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: { id: 'user-1', tokenVersion: 1 } });
    mocks.current.mockReturnValue(true);
    mocks.user.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', role: 'USER', tokenVersion: 1 });
    mocks.rate.mockResolvedValue(true);
    mocks.quota.mockResolvedValue({ ok: true });
    mocks.generate.mockResolvedValue([
      {
        prompt: 'سؤال جديد صالح؟',
        answer: 'إجابة',
        explanation: 'توضيح الإجابة',
        difficulty: 'EASY',
        options: ['إجابة', 'ب', 'ج', 'د'],
        answerIndex: 0,
      },
    ]);
    mocks.category.mockResolvedValue({ id: 'private-category', isActive: false });
    mocks.quiz.mockResolvedValue({ id: 'private-quiz' });
    mocks.transaction.mockImplementation(async (work) =>
      work({ category: { upsert: mocks.category }, quiz: { create: mocks.quiz } }),
    );
  });
  afterEach(() => vi.unstubAllEnvs());
  it('rejects foreign origins and oversized streamed bodies', async () => {
    expect((await POST(request('letter-challenge', 'https://other.example'))).status).toBe(403);
    expect(
      (await POST(request('letter-challenge', 'http://localhost', { topic: 'أ'.repeat(40_000) })))
        .status,
    ).toBe(413);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it('requires a current active session', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('uses the configured canonical origin behind an internal upstream host', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://qurabia.com');
    const accepted = new Request('http://internal/api/ai/game-questions/generate', {
      method: 'POST',
      headers: { origin: 'https://qurabia.com' },
      body: JSON.stringify({ game: 'letter-challenge', topic: 'ثقافة عامة' }),
    });
    expect((await POST(accepted)).status).toBe(200);
    const forged = new Request('http://internal/api/ai/game-questions/generate', {
      method: 'POST',
      headers: { origin: 'https://other.example', 'x-forwarded-host': 'other.example' },
      body: JSON.stringify({ game: 'letter-challenge', topic: 'ثقافة عامة' }),
    });
    expect((await POST(forged)).status).toBe(403);
  });
  it('keeps disabled AI, rate limits, and plan quota authoritative', async () => {
    vi.stubEnv('XAI_DISABLED', 'true');
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv('XAI_DISABLED', 'false');
    mocks.rate.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(429);
    expect(mocks.quota).not.toHaveBeenCalled();
    mocks.rate.mockResolvedValue(true);
    mocks.quota.mockResolvedValue({ ok: false, message: 'انتهت الحصة' });
    expect((await POST(request())).status).toBe(402);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('returns generated local-game questions without changing the database', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.json()).questions).toHaveLength(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('creates a private owned ladder pack outside the public tagged bank', async () => {
    const response = await POST(request('ladder'));
    expect(response.status).toBe(200);
    expect((await response.json()).playHref).toBe('/games/ladder/host?quizId=private-quiz');
    expect(mocks.category).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ isActive: false }) }),
    );
    expect(mocks.quiz).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: 'user-1', isPublic: false, gameMode: 'LADDER' }),
      }),
    );
  });
});

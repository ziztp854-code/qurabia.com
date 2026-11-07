import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  current: vi.fn(),
  database: vi.fn(),
  user: vi.fn(),
  rate: vi.fn(),
  redis: vi.fn(),
  redisSet: vi.fn(),
  quota: vi.fn(),
  generate: vi.fn(),
  selectBank: vi.fn(),
  bankRows: vi.fn(),
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
vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.rate,
  getSharedRedis: mocks.redis,
}));
vi.mock('@/lib/subscription/entitlements', () => ({ consumeQuota: mocks.quota }));
vi.mock('@/lib/ai/game-question-refresh', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/game-question-refresh')>()),
  generateFreshGameQuestions: mocks.generate,
}));
vi.mock('@/lib/ai/ladder-bank-selection', () => ({ selectLadderBankQuestions: mocks.selectBank }));
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
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('UNOROUTER_API_KEY', '');
    vi.stubEnv('KIMI_API_KEY', '');
    vi.stubEnv('XAI_DISABLED', 'false');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost');
    mocks.database.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: { id: 'user-1', tokenVersion: 1 } });
    mocks.current.mockReturnValue(true);
    mocks.user.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', role: 'USER', tokenVersion: 1 });
    mocks.rate.mockResolvedValue(true);
    mocks.redis.mockReturnValue({ set: mocks.redisSet });
    mocks.redisSet.mockReset().mockResolvedValue('OK');
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
    mocks.selectBank.mockResolvedValue([{ id: 'bank-1', question: { prompt: 'سؤال من البنك' } }]);
    mocks.bankRows.mockResolvedValue([{ id: 'bank-1', version: 3 }]);
    mocks.category.mockResolvedValue({ id: 'private-category', isActive: false });
    mocks.quiz.mockResolvedValue({ id: 'private-quiz' });
    mocks.transaction.mockImplementation(async (work) =>
      work({
        category: { upsert: mocks.category },
        quiz: { create: mocks.quiz },
        question: { findMany: mocks.bankRows },
      }),
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
  it('does not allow ladder fallback when UnoRouter is not configured', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-gateway');
    mocks.user.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      role: 'ADMIN',
      tokenVersion: 1,
    });
    expect((await POST(request('ladder'))).status).toBe(503);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
  });
  it('blocks regular ladder hosts even when UnoRouter is unconfigured', async () => {
    vi.stubEnv('UNOROUTER_API_KEY', '');
    expect((await POST(request('ladder'))).status).toBe(403);
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('accepts Kimi for an authorized ladder host with the shared limiter', async () => {
    vi.stubEnv('KIMI_API_KEY', 'test-kimi');
    mocks.user.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      role: 'ADMIN',
      tokenVersion: 1,
    });
    expect((await POST(request('ladder'))).status).toBe(200);
    expect(mocks.redisSet).toHaveBeenCalledOnce();
    expect(mocks.selectBank).toHaveBeenCalledOnce();
  });
  it('blocks regular users before calling the provider or consuming quota', async () => {
    vi.stubEnv('KIMI_API_KEY', 'test-kimi');
    const response = await POST(request('ladder'));
    expect(response.status).toBe(403);
    expect(mocks.redisSet).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it.each(['ADMIN', 'OWNER'])('allows %s through the global UnoRouter limiter', async (role) => {
    vi.stubEnv('KIMI_API_KEY', 'test-kimi');
    mocks.user.mockResolvedValue({ id: 'user-1', status: 'ACTIVE', role, tokenVersion: 1 });
    expect((await POST(request('ladder'))).status).toBe(200);
    expect(mocks.redisSet).toHaveBeenCalledWith('tahaddi:ai:unorouter:glm-5.3-flash:rate:v1', '1', {
      nx: true,
      ex: 150,
    });
    expect(mocks.quota).toHaveBeenCalledOnce();
  });
  it('accepts only one simulated concurrent host before consuming quota', async () => {
    vi.stubEnv('KIMI_API_KEY', 'test-kimi');
    mocks.user.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      role: 'ADMIN',
      tokenVersion: 1,
    });
    let taken = false;
    mocks.redisSet.mockImplementation(async () => {
      if (taken) return null;
      taken = true;
      return 'OK';
    });
    const responses = await Promise.all([POST(request('ladder')), POST(request('ladder'))]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 429]);
    expect(mocks.selectBank).toHaveBeenCalledOnce();
    expect(mocks.quota).toHaveBeenCalledOnce();
  });
  it.each(['unavailable', 'failure'])('fails closed when shared limiter is %s', async (failure) => {
    vi.stubEnv('KIMI_API_KEY', 'test-kimi');
    mocks.user.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      role: 'ADMIN',
      tokenVersion: 1,
    });
    if (failure === 'unavailable') mocks.redis.mockReturnValue(null);
    else mocks.redisSet.mockRejectedValue(new Error('private redis error'));
    expect((await POST(request('ladder'))).status).toBe(503);
    expect(mocks.quota).not.toHaveBeenCalled();
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
  it('accepts a configured gateway without a direct xAI key', async () => {
    vi.stubEnv('XAI_API_KEY', '');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-test');
    expect((await POST(request())).status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it('creates a private owned ladder pack outside the public tagged bank', async () => {
    vi.stubEnv('KIMI_API_KEY', 'test-kimi');
    mocks.user.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      role: 'ADMIN',
      tokenVersion: 1,
    });
    const response = await POST(request('ladder'));
    expect(response.status).toBe(200);
    expect((await response.json()).playHref).toBe('/games/ladder/host?quizId=private-quiz');
    expect(mocks.category).not.toHaveBeenCalled();
    expect(mocks.quiz.mock.calls[0][0].data.questions.create).toEqual([
      { position: 0, questionId: 'bank-1', questionVersion: 3 },
    ]);
    expect(mocks.quiz).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: 'user-1', isPublic: false, gameMode: 'LADDER' }),
      }),
    );
  });
  it('does not save a pack if a selected bank question is no longer available', async () => {
    vi.stubEnv('KIMI_API_KEY', 'test-kimi');
    mocks.user.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      role: 'ADMIN',
      tokenVersion: 1,
    });
    mocks.bankRows.mockResolvedValue([]);
    expect((await POST(request('ladder'))).status).toBe(502);
    expect(mocks.quiz).not.toHaveBeenCalled();
  });
  it('does not create a partial ladder pack when generation fails', async () => {
    vi.stubEnv('KIMI_API_KEY', 'test-kimi');
    mocks.user.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      role: 'ADMIN',
      tokenVersion: 1,
    });
    mocks.selectBank.mockRejectedValueOnce(new Error('selection failed'));
    const response = await POST(request('ladder'));
    expect(response.status).toBe(502);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.quiz).not.toHaveBeenCalled();
  });
});

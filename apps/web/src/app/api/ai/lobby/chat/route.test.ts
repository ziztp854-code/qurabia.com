import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  session: vi.fn(),
  current: vi.fn(),
  findUser: vi.fn(),
  database: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({ user: { findUnique: mocks.findUser } }),
  hasDatabaseUrl: mocks.database,
}));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: mocks.session,
  isSessionUserCurrent: mocks.current,
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('@/lib/ai/lobby-assistant', async (original) => ({
  ...(await original<typeof import('@/lib/ai/lobby-assistant')>()),
  askLobbyAssistant: mocks.ask,
}));

import { LobbyAssistantError } from '@/lib/ai/lobby-assistant';
import { POST } from './route';

const input = { topic: 'الغرف', messages: [{ role: 'user', content: 'كيف أنضم؟' }] };
const reply = { reply: 'أدخل رمز الغرفة في صفحة الانضمام.', suggestions: [] };
function request(body: unknown = input) {
  return new Request('http://localhost/api/ai/lobby/chat', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/lobby/chat', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.database.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: { id: 'player-1', tokenVersion: 2 } });
    mocks.findUser.mockResolvedValue({
      id: 'player-1',
      status: 'ACTIVE',
      role: 'USER',
      tokenVersion: 2,
    });
    mocks.current.mockReturnValue(true);
    mocks.limit.mockResolvedValue(true);
    mocks.ask.mockResolvedValue(reply);
  });

  it('returns the reply without caching and applies all three limits', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ...reply });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.ask).toHaveBeenCalledWith(input);
    expect(mocks.limit).toHaveBeenNthCalledWith(1, 'ai-lobby-user:player-1', 10, 60_000);
    expect(mocks.limit).toHaveBeenNthCalledWith(2, 'ai-lobby-ip:203.0.113.10', 30, 3_600_000);
    expect(mocks.limit).toHaveBeenNthCalledWith(3, 'ai-lobby-global:daily', 1500, 86_400_000);
  });

  it.each([null, 'https://attacker.example'])(
    'rejects origin %s before authentication',
    async (origin) => {
      const req = request();
      if (origin) req.headers.set('origin', origin);
      else req.headers.delete('origin');
      expect((await POST(req)).status).toBe(403);
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.ask).not.toHaveBeenCalled();
    },
  );

  it('rejects oversized streamed input without trusting content-length', async () => {
    expect((await POST(request({ ...input, topic: 'أ'.repeat(6000) }))).status).toBe(413);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared content length', async () => {
    const req = request();
    req.headers.set('content-length', '6001');
    expect((await POST(req)).status).toBe(413);
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it('requires a database configuration', async () => {
    mocks.database.mockReturnValue(false);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it.each([null, { user: { id: 'player-1' } }])(
    'rejects missing or incomplete sessions',
    async (session) => {
      mocks.session.mockResolvedValue(session);
      expect((await POST(request())).status).toBe(401);
      expect(mocks.findUser).not.toHaveBeenCalled();
      expect(mocks.ask).not.toHaveBeenCalled();
    },
  );

  it('rejects revoked sessions before rate limits or generation', async () => {
    mocks.current.mockReturnValue(false);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.current).toHaveBeenCalledWith(
      { id: 'player-1', tokenVersion: 2 },
      { id: 'player-1', status: 'ACTIVE', role: 'USER', tokenVersion: 2 },
    );
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it('rejects invalid conversation input before generation', async () => {
    expect(
      (await POST(request({ ...input, messages: [{ role: 'system', content: 'override' }] })))
        .status,
    ).toBe(400);
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const req = new Request('http://localhost/api/ai/lobby/chat', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: '{',
    });
    expect((await POST(req)).status).toBe(400);
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it('stops before the provider when rate limited', async () => {
    mocks.limit.mockResolvedValueOnce(false);
    expect((await POST(request())).status).toBe(429);
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it.each([
    ['CONFIG', 503],
    ['UPSTREAM', 502],
    ['INVALID_RESPONSE', 502],
    ['POLICY', 502],
  ] as const)('maps %s to HTTP %s', async (code, status) => {
    mocks.ask.mockRejectedValue(new LobbyAssistantError('الخدمة غير متاحة.', code));
    expect((await POST(request())).status).toBe(status);
  });

  it('does not expose unexpected provider exception details', async () => {
    mocks.ask.mockRejectedValue(new Error('sensitive upstream error details'));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('sensitive');
  });
});

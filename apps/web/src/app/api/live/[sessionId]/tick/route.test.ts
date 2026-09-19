import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  advanceLiveSessionIfDue: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock('@/lib/live/engine', () => ({
  advanceLiveSessionIfDue: mocks.advanceLiveSessionIfDue,
}));

function tickRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/live/session-1/tick', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
}

describe('live tick route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.advanceLiveSessionIfDue.mockResolvedValue(false);
  });

  it('يرفض طلبًا من مصدر مختلف عن الموقع', async () => {
    const response = await POST(
      tickRequest({ origin: 'https://evil.example.com' }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.advanceLiveSessionIfDue).not.toHaveBeenCalled();
  });

  it('يرفض الطلبات بعد تجاوز الحد المعدّل', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const response = await POST(tickRequest(), {
      params: Promise.resolve({ sessionId: 'session-1' }),
    });

    expect(response.status).toBe(429);
    expect(mocks.advanceLiveSessionIfDue).not.toHaveBeenCalled();
  });

  it('يدفع تقدم الجلسة ويعيد وقت الخادم عند الطلب الصالح', async () => {
    const response = await POST(tickRequest(), {
      params: Promise.resolve({ sessionId: 'session-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.advanceLiveSessionIfDue).toHaveBeenCalledWith('session-1');
    const payload = (await response.json()) as { ok: boolean; serverTime: number };
    expect(payload.ok).toBe(true);
    expect(typeof payload.serverTime).toBe('number');
  });
});

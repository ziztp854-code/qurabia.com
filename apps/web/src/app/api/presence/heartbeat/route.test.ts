import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  recordPresenceHeartbeat: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock('@/lib/presence/presence-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/presence/presence-store')>()),
  recordPresenceHeartbeat: mocks.recordPresenceHeartbeat,
}));

function request(body: unknown, origin = 'http://localhost') {
  return new Request('http://localhost/api/presence/heartbeat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

describe('presence heartbeat route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.recordPresenceHeartbeat.mockResolvedValue(undefined);
  });

  it('records a valid visitor heartbeat', async () => {
    const response = await POST(
      request({ visitorId: '8f14e45f-ea44-4a2d-9c1a-0b3c2d1e0f9a' }),
    );

    expect(response.status).toBe(200);
    expect(mocks.recordPresenceHeartbeat).toHaveBeenCalledWith(
      '8f14e45f-ea44-4a2d-9c1a-0b3c2d1e0f9a',
    );
  });

  it('rejects a foreign origin', async () => {
    const response = await POST(
      request({ visitorId: '8f14e45f-ea44-4a2d-9c1a-0b3c2d1e0f9a' }, 'https://evil.example'),
    );

    expect(response.status).toBe(403);
    expect(mocks.recordPresenceHeartbeat).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  join: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/auth/prisma', () => ({ hasDatabaseUrl: mocks.hasDatabaseUrl }));
vi.mock('@/lib/live/join-quiz-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/live/join-quiz-session')>()),
  joinQuizSessionByCode: mocks.join,
}));

import { POST } from './route';

function joinRequest(body: unknown) {
  return new Request('http://localhost/api/live/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/live/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.hasDatabaseUrl.mockReturnValue(true);
  });

  it('joins a quiz room with a normalized code and name', async () => {
    mocks.join.mockResolvedValue({
      status: 'success',
      sessionId: 'session-1',
      participantId: 'player-1',
      participantToken: 'signed-token',
      roomCode: 'A7K9PQ',
    });

    const response = await POST(joinRequest({ roomCode: ' a7k9pq ', playerName: '  نورة   علي ' }));

    expect(response.status).toBe(200);
    expect(mocks.join).toHaveBeenCalledWith('A7K9PQ', 'نورة علي');
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('live-join:203.0.113.7', 20, 60_000);
    expect(await response.json()).toEqual({
      ok: true,
      sessionId: 'session-1',
      participantId: 'player-1',
      participantToken: 'signed-token',
      roomCode: 'A7K9PQ',
      displayName: 'نورة علي',
    });
  });

  it('rejects invalid input before touching the database', async () => {
    const badCode = await POST(joinRequest({ roomCode: '12', playerName: 'نورة' }));
    const badName = await POST(joinRequest({ roomCode: 'A7K9PQ', playerName: ' ن ' }));

    expect(badCode.status).toBe(400);
    expect((await badCode.json()).error).toBe('INVALID_ROOM_CODE');
    expect(badName.status).toBe(400);
    expect((await badName.json()).error).toBe('INVALID_PLAYER_NAME');
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it('returns 429 when the IP is rate limited', async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const response = await POST(joinRequest({ roomCode: 'A7K9PQ', playerName: 'نورة' }));

    expect(response.status).toBe(429);
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'not_found' }, 404, 'ROOM_NOT_FOUND'],
    [{ status: 'full' }, 409, 'ROOM_FULL'],
  ])('maps %o to a %i response', async (result, status, error) => {
    mocks.join.mockResolvedValue(result);

    const response = await POST(joinRequest({ roomCode: 'A7K9PQ', playerName: 'نورة' }));

    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(error);
  });

  it('reports a duplicate player name', async () => {
    mocks.join.mockRejectedValue({ code: 'P2002' });

    const response = await POST(joinRequest({ roomCode: 'A7K9PQ', playerName: 'نورة' }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('NAME_TAKEN');
  });
});

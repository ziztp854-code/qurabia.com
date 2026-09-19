import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyHost: vi.fn(),
  verifyPlayer: vi.fn(),
  getState: vi.fn(),
  start: vi.fn(),
  next: vi.fn(),
  finish: vi.fn(),
  answer: vi.fn(),
}));

vi.mock('@/lib/live/access-token', () => ({
  verifyHostLiveAccessToken: mocks.verifyHost,
  verifyPlayerLiveAccessToken: mocks.verifyPlayer,
}));
vi.mock('@/lib/live/http-engine', () => ({
  getHttpLiveState: mocks.getState,
  startHttpLiveQuestion: mocks.start,
  nextHttpLiveQuestion: mocks.next,
  finishHttpLiveGame: mocks.finish,
  submitHttpLiveAnswer: mocks.answer,
}));

import { POST } from './route';

function roomRequest(body: object) {
  return new Request('http://localhost/api/live/session-1/room', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/live/[sessionId]/room', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyHost.mockReturnValue(true);
    mocks.verifyPlayer.mockReturnValue(true);
    mocks.getState.mockResolvedValue({
      snapshot: { sessionId: 'session-1', phase: 'LOBBY' },
      stats: null,
    });
  });

  it('rejects a request with an invalid signed room token', async () => {
    mocks.verifyHost.mockReturnValue(false);

    const response = await POST(
      roomRequest({
        operation: 'snapshot',
        subjectId: 'host-1',
        accessToken: 'invalid',
        role: 'host',
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(mocks.getState).not.toHaveBeenCalled();
  });

  it('returns the authenticated room snapshot', async () => {
    const response = await POST(
      roomRequest({
        operation: 'snapshot',
        subjectId: 'player-1',
        accessToken: 'signed-token',
        role: 'player',
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyPlayer).toHaveBeenCalledWith('session-1', 'player-1', 'signed-token');
    expect(mocks.getState).toHaveBeenCalledWith({
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
    });
  });

  it('passes the request receipt time to answer scoring', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T20:00:00.000Z'));
    mocks.answer.mockResolvedValue({ ok: true });

    const response = await POST(
      roomRequest({
        operation: 'answer',
        subjectId: 'player-1',
        accessToken: 'signed-token',
        role: 'player',
        questionId: 'question-1',
        optionId: 'option-1',
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.answer).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 'player-1' }), {
      questionId: 'question-1',
      optionId: 'option-1',
      receivedAt: new Date('2026-07-26T20:00:00.000Z'),
    });
    vi.useRealTimers();
  });
});

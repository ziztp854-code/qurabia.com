import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameService } from '../../../../realtime/src/game/game.service';
import { LiveHostExperience } from './live-host-experience';

const socketState = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>(),
  io: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('socket.io-client', () => ({
  io: socketState.io.mockImplementation(() => {
    const socket = {
      connected: true,
      on: vi.fn((event: string, listener: (payload?: unknown) => void) => {
        socketState.listeners.set(event, listener);
        return socket;
      }),
      emit: socketState.emit,
      removeAllListeners: vi.fn(),
      disconnect: vi.fn(),
    };
    return socket;
  }),
}));

function makeSession(participants: Array<Record<string, unknown>>) {
  return {
    id: 'session-1',
    roomCode: 'ABC123',
    hostId: 'host-1',
    status: 'LOBBY',
    currentQuestionPosition: 0,
    questionStartedAt: null,
    endedAt: null,
    quiz: { autoAdvance: false, questions: [] },
    participants,
    answers: [],
  };
}

describe('live host roster', () => {
  beforeEach(() => {
    socketState.listeners.clear();
    socketState.io.mockClear();
    socketState.emit.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('raises the host participant count from zero to one after a real player join', async () => {
    let session = makeSession([]);
    const redis = {
      loadGameState: vi.fn().mockResolvedValue({
        sessionId: 'session-1',
        roomCode: 'ABC123',
        phase: 'LOBBY',
        currentQuestionPosition: 0,
        questionStartedAt: null,
        questionEndsAt: null,
        transitionDueAt: null,
      }),
    };
    const database = {
      client: {
        liveSession: { findUnique: vi.fn(async () => session) },
        liveParticipant: { updateMany: vi.fn() },
      },
    };
    const server = {
      to: vi.fn(() => server),
      emit: vi.fn((event: string, payload: unknown) => {
        socketState.listeners.get(event)?.(payload);
      }),
    };
    const service = new GameService(redis as never, database as never);
    service.setServer(server as never);

    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="host-token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance={false}
      />,
    );

    expect(socketState.io).toHaveBeenCalledWith(
      'http://localhost:3001/',
      expect.objectContaining({ transports: ['websocket'] }),
    );
    act(() => socketState.listeners.get('connect')?.());
    expect(socketState.emit).toHaveBeenCalledWith('game:join', {
      sessionId: 'session-1',
      subjectId: 'host-1',
      accessToken: 'host-token',
      role: 'host',
      deviceId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    });

    const hostSnapshot = await service.getSnapshot({
      sessionId: 'session-1',
      subjectId: 'host-1',
      role: 'host',
    });
    act(() => socketState.listeners.get('game:snapshot')?.(hostSnapshot));
    expect(screen.getByRole('heading', { name: 'المتسابقون في الجولة (0)' })).toBeVisible();

    session = makeSession([
      {
        id: 'player-1',
        displayName: 'لاعب',
        score: 0,
        correctCount: 0,
        status: 'CONNECTED',
        joinedAt: new Date(),
      },
    ]);
    await act(async () => {
      await service.joined({
        sessionId: 'session-1',
        subjectId: 'player-1',
        role: 'player',
      });
    });

    expect(screen.getByRole('heading', { name: 'المتسابقون في الجولة (1)' })).toBeVisible();
  });
});

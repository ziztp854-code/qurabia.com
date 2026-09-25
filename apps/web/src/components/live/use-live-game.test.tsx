import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const socketState = vi.hoisted(() => {
  const listeners = new Map<string, (...args: never[]) => void>();
  const socket = {
    connected: false,
    listeners,
    emit: vi.fn(),
    on: vi.fn((event: string, listener: (...args: never[]) => void) => {
      listeners.set(event, listener);
      return socket;
    }),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
  };
  return { io: vi.fn(() => socket), socket };
});

vi.mock('socket.io-client', () => ({ io: socketState.io }));

import { useLiveGame } from './use-live-game';
import type { GameSnapshot } from '@tahaddi/contracts';

const questionSnapshot: GameSnapshot = {
  sessionId: 'session-1',
  roomCode: 'ABC123',
  phase: 'QUESTION',
  serverTime: 1_000,
  question: {
    questionId: 'question-1',
    prompt: 'السؤال',
    options: [],
    media: [],
    questionStartedAt: 1_000,
    questionEndsAt: 21_000,
    questionNumber: 1,
    totalQuestions: 2,
  },
  reveal: null,
  leaderboard: [],
  participantCount: 1,
  playerAnswer: null,
  playerResult: null,
};

function receive(event: string, payload: unknown) {
  act(() => socketState.socket.listeners.get(event)?.(payload as never));
}

function connectedPlayer() {
  const hook = renderHook(() =>
    useLiveGame({
      sessionId: 'session-1',
      subjectId: 'player-1',
      accessToken: 'signed-token',
      role: 'player',
    }),
  );
  socketState.socket.connected = true;
  act(() => socketState.socket.listeners.get('connect')?.());
  receive('game:snapshot', questionSnapshot);
  socketState.socket.emit.mockClear();
  return hook;
}

describe('useLiveGame realtime connection', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_REALTIME_URL;
    window.localStorage.setItem('tahaddi.device-id.v1', '018f5e2a-7b66-7b2c-9a51-2397f59d67e1');
    socketState.io.mockClear();
    socketState.socket.listeners.clear();
    socketState.socket.emit.mockClear();
    socketState.socket.connected = false;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('uses the shared same-origin resolver and exposes connection failures', () => {
    const { result, unmount } = renderHook(() =>
      useLiveGame({
        sessionId: 'session-1',
        subjectId: 'host-1',
        accessToken: 'signed-token',
        role: 'host',
      }),
    );

    expect(socketState.io).toHaveBeenCalledWith(
      'http://localhost:3001/',
      expect.objectContaining({
        transports: ['websocket'],
        reconnection: true,
      }),
    );

    act(() => socketState.socket.listeners.get('connect_error')?.());

    expect(result.current.connected).toBe(false);
    expect(result.current.message).toBe('تعذّر الاتصال بخدمة اللعب المباشر؛ نحاول إعادة الاتصال…');

    unmount();
  });

  it('shows a question that arrives while the player snapshot is still loading', () => {
    const { result } = renderHook(() =>
      useLiveGame({
        sessionId: 'session-1',
        subjectId: 'player-1',
        accessToken: 'signed-token',
        role: 'player',
      }),
    );
    socketState.socket.connected = true;
    act(() => socketState.socket.listeners.get('connect')?.());
    receive('question:started', questionSnapshot.question);
    receive('game:snapshot', { ...questionSnapshot, phase: 'LOBBY', question: null });

    expect(result.current.snapshot?.phase).toBe('QUESTION');
    expect(result.current.snapshot?.question?.questionId).toBe('question-1');
  });

  it('keeps an acknowledged answer when an older lobby snapshot arrives', () => {
    const { result } = renderHook(() =>
      useLiveGame({
        sessionId: 'session-1',
        subjectId: 'player-1',
        accessToken: 'signed-token',
        role: 'player',
      }),
    );
    socketState.socket.connected = true;
    act(() => socketState.socket.listeners.get('connect')?.());
    receive('game:snapshot', { ...questionSnapshot, phase: 'LOBBY', question: null });
    receive('question:started', questionSnapshot.question);
    receive('answer:accepted', { questionId: 'question-1', receivedAt: 2_000 });
    receive('game:snapshot', { ...questionSnapshot, phase: 'LOBBY', question: null });

    expect(result.current.snapshot?.phase).toBe('QUESTION');
    expect(result.current.snapshot?.playerAnswer?.receivedAt).toBe(2_000);
  });

  it('shows a revealed question even when its events precede the first snapshot', () => {
    const { result } = renderHook(() =>
      useLiveGame({
        sessionId: 'session-1',
        subjectId: 'player-1',
        accessToken: 'signed-token',
        role: 'player',
      }),
    );
    socketState.socket.connected = true;
    act(() => socketState.socket.listeners.get('connect')?.());
    receive('question:started', questionSnapshot.question);
    receive('question:revealed', {
      questionId: 'question-1',
      correctOptionId: 'option-1',
      explanation: null,
      stats: { questionId: 'question-1', answeredCount: 0, participantCount: 1, options: [] },
      playerResult: null,
    });
    receive('game:snapshot', { ...questionSnapshot, phase: 'LOBBY', question: null });

    expect(result.current.snapshot?.phase).toBe('REVEAL');
    expect(result.current.snapshot?.question?.questionId).toBe('question-1');
  });

  it('lets an authenticated host reveal the active question manually', () => {
    const { result } = renderHook(() =>
      useLiveGame({
        sessionId: 'session-1',
        subjectId: 'host-1',
        accessToken: 'signed-token',
        role: 'host',
      }),
    );

    socketState.socket.connected = true;
    act(() => socketState.socket.listeners.get('connect')?.());
    socketState.socket.emit.mockClear();

    act(() => result.current.revealQuestion('question-1'));

    expect(socketState.socket.emit).toHaveBeenCalledWith('question:reveal', {
      sessionId: 'session-1',
      questionId: 'question-1',
    });
  });

  it('does not mark an answer sent when the socket has already disconnected', () => {
    const { result } = connectedPlayer();
    socketState.socket.connected = false;
    act(() => result.current.submitAnswer('question-1', 'option-1'));
    expect(result.current.snapshot?.playerAnswer).toBeNull();
    expect(socketState.socket.emit).not.toHaveBeenCalled();
  });

  it('ignores a rejection from the previous question while the current answer is pending', () => {
    const { result } = connectedPlayer();
    act(() => result.current.submitAnswer('question-1', 'option-1'));
    receive('answer:rejected', { questionId: 'previous-question', reason: 'ANSWER_TOO_LATE' });
    expect(result.current.snapshot?.playerAnswer?.optionId).toBe('option-1');
    expect(result.current.busy).toBe(true);
  });

  it('keeps the final standings when a player disconnects after the competition', () => {
    const { result } = connectedPlayer();
    const leaderboard = [{ id: 'player-1', name: 'سارة', score: 1000, rank: 1 }];
    receive('game:finished', { sessionId: 'session-1', leaderboard });
    receive('game:player_left', { playerId: 'player-1', participantCount: 0 });
    expect(result.current.snapshot?.leaderboard).toEqual(leaderboard);
  });

  it('submits only one answer when tapped twice before the next render', () => {
    const { result } = connectedPlayer();
    act(() => {
      result.current.submitAnswer('question-1', 'option-1');
      result.current.submitAnswer('question-1', 'option-2');
    });
    expect(socketState.socket.emit).toHaveBeenCalledTimes(1);
    expect(result.current.snapshot?.playerAnswer?.optionId).toBe('option-1');
  });

  it('restores the saved answer when the server reports a duplicate', () => {
    const { result } = connectedPlayer();
    act(() => result.current.submitAnswer('question-1', 'option-1'));
    socketState.socket.emit.mockClear();
    receive('answer:rejected', { questionId: 'question-1', reason: 'DUPLICATE_ANSWER' });
    expect(socketState.socket.emit).toHaveBeenCalledWith(
      'game:join',
      expect.objectContaining({ subjectId: 'player-1' }),
    );
  });

  it('requests saved state when an answer acknowledgement is lost, without resending the answer', () => {
    vi.useFakeTimers();
    const { result, unmount } = connectedPlayer();
    act(() => result.current.submitAnswer('question-1', 'option-1'));
    socketState.socket.emit.mockClear();
    act(() => vi.advanceTimersByTime(5_000));
    expect(socketState.socket.emit).toHaveBeenCalledWith(
      'game:join',
      expect.objectContaining({ sessionId: 'session-1' }),
    );
    expect(result.current.message).toContain('التحقق');
    receive('game:snapshot', {
      ...questionSnapshot,
      playerAnswer: { optionId: 'option-1', receivedAt: 2_000 },
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.snapshot?.playerAnswer?.receivedAt).toBe(2_000);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

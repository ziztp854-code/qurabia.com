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

describe('useLiveGame realtime connection', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_REALTIME_URL;
    window.localStorage.setItem('tahaddi.device-id.v1', '018f5e2a-7b66-7b2c-9a51-2397f59d67e1');
    socketState.io.mockClear();
    socketState.socket.listeners.clear();
    socketState.socket.emit.mockClear();
    socketState.socket.connected = false;
  });

  afterEach(() => vi.unstubAllEnvs());

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

    expect(socketState.socket.emit).toHaveBeenCalledWith('game:join', {
      sessionId: 'session-1',
      subjectId: 'host-1',
      accessToken: 'signed-token',
      role: 'host',
      deviceId: '018f5e2a-7b66-7b2c-9a51-2397f59d67e1',
    });
    socketState.socket.emit.mockClear();

    act(() => result.current.revealQuestion('question-1'));

    expect(socketState.socket.emit).toHaveBeenCalledWith('question:reveal', {
      sessionId: 'session-1',
      questionId: 'question-1',
    });
  });
});

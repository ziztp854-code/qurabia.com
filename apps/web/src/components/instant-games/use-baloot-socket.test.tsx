import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBalootSocket } from './use-baloot-socket';

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  callbacks: new Map<string, (...args: unknown[]) => void>(),
  socket: {
    connected: true,
    recovered: false,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    timeout: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));
vi.mock('socket.io-client', () => ({
  io: () => {
    mock.socket.on.mockImplementation((event, callback) => {
      mock.handlers.set(event, callback);
      return mock.socket;
    });
    mock.socket.emit.mockImplementation((event, _payload, callback) => {
      mock.callbacks.set(event, callback);
    });
    mock.socket.timeout.mockReturnValue(mock.socket);
    return mock.socket;
  },
}));

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
  mock.handlers.clear();
  mock.callbacks.clear();
  vi.clearAllMocks();
});

describe('Baloot room departure', () => {
  it('does not clear a new room when the old leave fallback deadline passes', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useBalootSocket());
    act(() => mock.handlers.get('connect')?.());
    act(() => result.current.leave());
    act(() => mock.callbacks.get('baloot:leave')?.(null, { ok: true }));
    act(() => vi.advanceTimersByTime(0));
    const snapshot = { roomCode: '654321', stateVersion: 1 };
    act(() => result.current.emit('baloot:host', { playerName: 'لاعب جديد' }));
    act(() =>
      mock.callbacks.get('baloot:host')?.(null, {
        ok: true,
        data: { snapshot, roomCode: '654321', sessionToken: 'new-room-session' },
      }),
    );
    act(() => vi.advanceTimersByTime(7_001));
    expect(result.current.room?.roomCode).toBe('654321');
    expect(sessionStorage.getItem('tahaddi-baloot-session-token')).toBe('new-room-session');
    unmount();
  });
});

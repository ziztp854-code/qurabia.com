import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLadderSocket } from './use-ladder-socket';

const socket = vi.hoisted(() => {
  const listeners = new Map<string, (...args: never[]) => void>();
  return { listeners, on: vi.fn((event: string, listener: (...args: never[]) => void) => listeners.set(event, listener)), emit: vi.fn(), disconnect: vi.fn() };
});
vi.mock('socket.io-client', () => ({ io: () => socket }));

describe('ladder snapshot ordering', () => {
  beforeEach(() => socket.listeners.clear());
  it('keeps the latest revision for the same room while accepting a new room', () => {
    const { result } = renderHook(() => useLadderSocket('guest', 'token'));
    const send = (roomCode: string, revision: number, currentRound: number) => act(() => {
      socket.listeners.get('ladder:room:state')?.({ roomCode, revision, currentRound } as never);
    });
    send('AB12CD34', 8, 2);
    send('AB12CD34', 7, 1);
    expect(result.current.room?.currentRound).toBe(2);
    send('ZZ12YY34', 1, 1);
    expect(result.current.room?.roomCode).toBe('ZZ12YY34');
  });
});

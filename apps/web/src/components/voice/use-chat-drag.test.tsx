import { act, renderHook } from '@testing-library/react';
import type { MouseEvent, PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useChatDrag } from './use-chat-drag';

vi.mock('framer-motion', async (load) => ({
  ...await load<typeof import('framer-motion')>(), useReducedMotion: () => true,
}));
const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
const pointer = (y: number, timeStamp: number, x = 0) => ({
  isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: y, timeStamp, currentTarget: target,
}) as unknown as PointerEvent<HTMLButtonElement>;
const click = (detail: number) => ({ detail }) as MouseEvent<HTMLButtonElement>;

function setup() {
  const panel = { current: document.createElement('section') };
  Object.defineProperty(panel.current, 'offsetHeight', { value: 600 });
  const close = vi.fn();
  return { ...renderHook(() => useChatDrag(panel, true, true, close)), close };
}

describe('chat gesture cancellation and release', () => {
  it('allows the first keyboard activation after pointer cancellation', () => {
    const { result, close } = setup();
    act(() => { result.current.onPointerDown(pointer(0, 0)); result.current.onPointerMove(pointer(100, 20)); result.current.onPointerCancel(); });
    act(() => result.current.onClick(click(0)));
    expect(close).toHaveBeenCalledOnce();
  });
  it('suppresses the drag-generated click but permits keyboard dismissal', () => {
    const { result, close } = setup();
    act(() => {
      result.current.onPointerDown(pointer(0, 0)); result.current.onPointerMove(pointer(30, 20));
      result.current.onPointerUp(pointer(30, 200)); result.current.onClick(click(1));
    });
    expect(close).not.toHaveBeenCalled();
    act(() => result.current.onClick(click(0)));
    expect(close).toHaveBeenCalledOnce();
  });
  it('uses the final pointer position even if a last move event was not delivered', () => {
    const { result, close } = setup();
    act(() => {
      result.current.onPointerDown(pointer(0, 0)); result.current.onPointerMove(pointer(20, 20));
      result.current.onPointerUp(pointer(400, 60));
    });
    expect(close).toHaveBeenCalledOnce();
  });
  it('does not translate the sheet when horizontal intent wins', () => {
    const { result, close } = setup();
    act(() => {
      result.current.onPointerDown(pointer(0, 0)); result.current.onPointerMove(pointer(20, 20, 80));
      result.current.onPointerUp(pointer(20, 40, 100)); result.current.onClick(click(1));
    });
    expect(result.current.y.get()).toBe(0);
    expect(close).not.toHaveBeenCalled();
  });
});

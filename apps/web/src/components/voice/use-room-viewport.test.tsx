import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoomViewport } from './use-room-viewport';

describe('voice room viewport measurements', () => {
  let surface: HTMLDivElement;
  let controls: HTMLDivElement;
  let header: HTMLElement;
  let topbar: HTMLElement;
  let viewport: EventTarget & { height: number; offsetTop: number };
  let controlsHeight: number;
  let headerHeight: number;
  let topbarHeight: number;
  let nextFrame: number;
  let frames: Map<number, FrameRequestCallback>;
  let resizeCallbacks: Array<() => void>;
  const observe = vi.fn();
  const disconnect = vi.fn();
  const cancelFrame = vi.fn();

  function flushFrames() {
    const queued = [...frames.values()];
    frames.clear();
    act(() => queued.forEach((callback) => callback(0)));
  }
  function mount(enabled = true) {
    const surfaceRef = { current: surface };
    const controlsRef = { current: controls };
    return renderHook(({ active }) => useRoomViewport(surfaceRef, controlsRef, active), {
      initialProps: { active: enabled },
    });
  }
  function pixels(name: string) {
    return surface.style.getPropertyValue(`--room-${name}`);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    surface = document.createElement('div');
    const main = document.createElement('main');
    main.className = 'v-main';
    const app = document.createElement('div');
    app.className = 'v-room-app';
    topbar = document.createElement('header');
    topbar.className = 'v-topbar';
    header = document.createElement('header');
    controls = document.createElement('div');
    main.append(header, controls);
    app.append(topbar, main);
    surface.append(app);
    document.body.append(surface);
    controlsHeight = 92;
    headerHeight = 72;
    topbarHeight = 56;
    Object.defineProperty(controls, 'offsetHeight', { get: () => controlsHeight });
    Object.defineProperty(header, 'offsetHeight', { get: () => headerHeight });
    Object.defineProperty(topbar, 'offsetHeight', { get: () => topbarHeight });
    viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    vi.stubGlobal('visualViewport', viewport);
    vi.stubGlobal('innerHeight', 800);
    nextFrame = 0;
    frames = new Map();
    resizeCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    cancelFrame.mockImplementation((id: number) => frames.delete(id));
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resizeCallbacks.push(callback);
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
  });

  afterEach(() => {
    cleanup();
    surface.remove();
    vi.unstubAllGlobals();
  });

  it('keeps the keyboard viewport and wrapped controls/header in sync in one frame', () => {
    mount();
    expect(pixels('viewport-height')).toBe('800px');
    expect(pixels('viewport-top')).toBe('0px');
    expect(pixels('viewport-bottom')).toBe('0px');
    expect(pixels('controls-height')).toBe('92px');
    expect(pixels('controls-space')).toBe('108px');
    expect(pixels('header-height')).toBe('72px');
    expect(pixels('topbar-height')).toBe('56px');
    expect(observe).toHaveBeenCalledWith(controls);
    expect(observe).toHaveBeenCalledWith(header);
    expect(observe).toHaveBeenCalledWith(topbar);

    viewport.height = 420;
    viewport.offsetTop = 114;
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    controlsHeight = 168;
    headerHeight = 120;
    topbarHeight = 84;
    resizeCallbacks[0]();
    window.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(1);
    expect(pixels('viewport-height')).toBe('800px');
    flushFrames();
    expect(pixels('viewport-height')).toBe('420px');
    expect(pixels('viewport-top')).toBe('114px');
    expect(pixels('viewport-bottom')).toBe('266px');
    expect(pixels('controls-height')).toBe('168px');
    expect(pixels('controls-space')).toBe('184px');
    expect(pixels('header-height')).toBe('120px');
    expect(pixels('topbar-height')).toBe('84px');
  });

  it('cancels pending work, restores styles and stops listening while hidden or unmounted', () => {
    surface.style.setProperty('--room-header-height', '9px');
    const { rerender, unmount } = mount(false);
    expect(resizeCallbacks).toHaveLength(0);
    expect(pixels('viewport-height')).toBe('');
    expect(pixels('viewport-bottom')).toBe('');
    rerender({ active: true });
    viewport.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(1);
    rerender({ active: false });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(pixels('viewport-height')).toBe('');
    expect(pixels('controls-space')).toBe('');
    expect(pixels('header-height')).toBe('9px');
    viewport.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    resizeCallbacks[0]();
    expect(frames.size).toBe(0);

    controlsHeight = 200;
    rerender({ active: true });
    expect(pixels('controls-height')).toBe('200px');
    expect(pixels('controls-space')).toBe('216px');
    viewport.dispatchEvent(new Event('scroll'));
    unmount();
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(pixels('header-height')).toBe('9px');
    viewport.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(0);
  });

  it('falls back to window resize when viewport and ResizeObserver APIs are unavailable', () => {
    vi.stubGlobal('visualViewport', undefined);
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal('innerHeight', 720);
    const { unmount } = mount();
    expect(pixels('viewport-height')).toBe('720px');
    expect(pixels('viewport-top')).toBe('0px');
    vi.stubGlobal('innerHeight', 560);
    controlsHeight = 150;
    window.dispatchEvent(new Event('resize'));
    flushFrames();
    expect(pixels('viewport-height')).toBe('560px');
    expect(pixels('controls-space')).toBe('166px');
    unmount();
    window.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(0);
  });

  it('reveals the focused inline composer when the keyboard opens without moving focus', () => {
    const composer = document.createElement('form');
    composer.className = 'v-chat-compose';
    const input = document.createElement('textarea');
    composer.append(input);
    surface.querySelector('main')!.append(composer);
    const scroll = vi.fn();
    composer.scrollIntoView = scroll;
    input.focus();
    mount();
    expect(scroll).not.toHaveBeenCalled();

    viewport.height = 420;
    viewport.dispatchEvent(new Event('resize'));
    flushFrames();
    expect(pixels('viewport-bottom')).toBe('380px');
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(document.activeElement).toBe(input);

    // Overlay chat owns its own viewport; never scroll its background room.
    surface.querySelector('main')!.classList.add('v-chat-open');
    scroll.mockClear();
    viewport.height = 330;
    viewport.dispatchEvent(new Event('resize'));
    flushFrames();
    expect(scroll).not.toHaveBeenCalled();

    // Panning/zoom can report a viewport extending beyond the layout viewport.
    viewport.height = 900;
    viewport.offsetTop = 20;
    viewport.dispatchEvent(new Event('resize'));
    flushFrames();
    expect(pixels('viewport-bottom')).toBe('0px');
  });
});

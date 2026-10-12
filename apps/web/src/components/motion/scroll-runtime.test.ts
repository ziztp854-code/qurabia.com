import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startScrollRuntime } from './scroll-runtime';

const state = vi.hoisted(() => ({
  ticks: new Set<() => void>(),
  add: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  triggerRefresh: vi.fn(),
  update: vi.fn(),
  revert: vi.fn(),
  destroy: vi.fn(),
  raf: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  scrollTo: vi.fn(),
  options: undefined as unknown,
  mutation: undefined as ((records: Pick<MutationRecord, 'type' | 'target'>[]) => void) | undefined,
}));
vi.mock('lenis', () => ({
  default: class {
    constructor(options: unknown) {
      state.options = options;
    }
    isScrolling = 'smooth';
    raf = state.raf;
    on = state.on;
    off = state.off;
    stop = state.stop;
    start = state.start;
    scrollTo = state.scrollTo;
    destroy = state.destroy;
    resize() {}
  },
}));
vi.mock('gsap', () => ({
  gsap: {
    registerPlugin: vi.fn(),
    from: vi.fn(),
    ticker: {
      add: (tick: () => void) => {
        state.add(tick);
        state.ticks.add(tick);
      },
      remove: (tick: () => void) => {
        state.remove(tick);
        state.ticks.delete(tick);
      },
    },
    context: (callback: (context: object) => void) => {
      const context: Record<string, unknown> = {
        add: (name: string, fn: () => void) => {
          context[name] = fn;
        },
        revert: state.revert,
        getTweens: () => [],
      };
      callback(context);
      return context;
    },
  },
}));
vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: {
    create: vi.fn(() => ({ refresh: state.triggerRefresh })),
    refresh: state.refresh,
    update: state.update,
  },
}));

describe('owned scroll runtime', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    state.ticks.clear();
    document.body.innerHTML = '<main data-scroll-reveal>المحتوى</main>';
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(callback: (records: Pick<MutationRecord, 'type' | 'target'>[]) => void) {
          state.mutation = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  it('owns one ticker with autoRaf disabled and removes its listeners and contexts', () => {
    const foreignTicker = () => {};
    state.ticks.add(foreignTicker);
    cleanup = startScrollRuntime(document.documentElement);
    expect(state.options).toMatchObject({ autoRaf: false, syncTouch: false, anchors: false });
    expect(state.add).toHaveBeenCalledTimes(1);
    expect(state.ticks.size).toBe(2);
    state.ticks.forEach((tick) => tick());
    expect(state.raf).toHaveBeenCalledWith(expect.any(Number));
    expect(state.on).toHaveBeenCalledWith('scroll', expect.any(Function));
    const listener = state.on.mock.calls[0][1] as () => void;
    listener();
    expect(state.update).toHaveBeenCalledTimes(1);
    cleanup();
    cleanup = undefined;
    expect(state.ticks).toEqual(new Set([foreignTicker]));
    expect(state.off).toHaveBeenCalledWith('scroll', listener);
    expect(state.destroy).toHaveBeenCalledTimes(1);
    expect(state.revert).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.scrollRuntime).toBeUndefined();
  });

  it('does not recursively refresh when ScrollTrigger writes temporary body styles', async () => {
    cleanup = startScrollRuntime(document.documentElement);
    state.refresh.mockClear();
    state.triggerRefresh.mockClear();
    state.mutation?.([{ type: 'attributes', target: document.body }]);
    state.mutation?.([{ type: 'childList', target: document.body }]);
    await Promise.resolve();
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.triggerRefresh).not.toHaveBeenCalled();
    state.mutation?.([{ type: 'childList', target: document.querySelector('main')! }]);
    await Promise.resolve();
    expect(state.triggerRefresh).toHaveBeenCalledTimes(1);
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it('suspends one owned clock for dialogs and hidden tabs and resumes without duplicates', () => {
    cleanup = startScrollRuntime(document.documentElement);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    state.mutation?.([{ type: 'childList', target: document.body }]);
    expect(state.ticks.size).toBe(0);
    expect(state.stop).toHaveBeenCalledTimes(1);
    dialog.remove();
    state.mutation?.([{ type: 'childList', target: document.body }]);
    expect(state.ticks.size).toBe(1);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(state.ticks.size).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(state.ticks.size).toBe(1);
    hidden.mockRestore();
  });
});

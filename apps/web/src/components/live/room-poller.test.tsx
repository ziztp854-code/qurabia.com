import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDisplayClockState, resetDisplayClock } from './display-clock';
import { RoomPoller } from './room-poller';

const { refresh, router } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { refresh, router: { refresh } };
});

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('RoomPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    resetDisplayClock();
    refresh.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('marks the room seen immediately without causing a duplicate first render', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<RoomPoller endpoint="/api/live/session-1/tick" intervalMs={1_000} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh the whole page after a failed poll', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    render(<RoomPoller endpoint="/api/live/session-1/tick" intervalMs={1_000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes on recovery after the initial poll fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<RoomPoller endpoint="/api/live/session-1/tick" intervalMs={1_000} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping requests when the network is slow', async () => {
    const fetchMock = vi.fn(
      () =>
        new Promise<{ ok: boolean }>(() => {
          // Keep the first request pending to prove later intervals are ignored.
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const view = render(<RoomPoller endpoint="/api/live/session-1/tick" intervalMs={1_000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    view.unmount();
  });

  it('derives the display clock offset from the tick server time', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, serverTime: 1_000_250 }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<RoomPoller endpoint="/api/live/session-1/tick" intervalMs={1_000} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(getDisplayClockState()).toEqual({ ready: true, offset: 250 });
  });

  it('keeps the display clock unset when the tick payload has no server time', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    render(<RoomPoller endpoint="/api/live/session-1/tick" intervalMs={1_000} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(getDisplayClockState()).toEqual({ ready: false, offset: 0 });
  });

  it('keeps the request locked until its body has finished loading', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: () => new Promise(() => {}),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<RoomPoller endpoint="/api/live/session-1/tick" intervalMs={1_000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('ignores a response body that arrives after unmount', async () => {
    let resolveBody!: (value: { serverTime: number }) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: () =>
          new Promise((resolve) => {
            resolveBody = resolve;
          }),
      })),
    );
    const view = render(<RoomPoller endpoint="/api/live/session-1/tick" />);
    await act(async () => {
      await Promise.resolve();
    });
    view.unmount();
    await act(async () => {
      resolveBody({ serverTime: 2_000_000 });
    });
    expect(getDisplayClockState()).toEqual({ ready: false, offset: 0 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes immediately when the tab becomes visible again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    render(<RoomPoller endpoint="/api/live/session-1/tick" intervalMs={10_000} />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('recovers from a timed-out request without waiting for another successful poll', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url, { signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      )
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<RoomPoller endpoint="/api/live/session-1/tick" intervalMs={1_000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a low-latency clock sample when a slower poll arrives', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ serverTime: 1_000_250 }),
      })
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { ok: true, json: async () => ({ serverTime: 1_001_250 }) };
      });
    vi.stubGlobal('fetch', fetchMock);
    render(<RoomPoller endpoint="/api/live/session-1/tick" intervalMs={1_000} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getDisplayClockState().offset).toBe(250);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_400);
    });
    expect(getDisplayClockState().offset).toBe(250);
  });
});

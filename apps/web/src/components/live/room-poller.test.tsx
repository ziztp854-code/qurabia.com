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
});

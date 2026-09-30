import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapLibreAdapter } from '../src/adapter';
import { ViewportLoader } from '../src/viewport-loader';
import { FakeMap, payload } from './fixtures';

afterEach(() => vi.useRealTimers());

describe('viewport loading', () => {
  it('clears old data immediately during movement and debounces bounded requests', async () => {
    vi.useFakeTimers();
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port());
    adapter.resetSession('world');
    adapter.render(payload('1', true));
    const load = vi.fn().mockImplementation(async (bounds) => ({ ...payload('2'), bounds }));
    const loader = new ViewportLoader(map.port(), adapter, { load, now: () => 0 });
    map.fire('moveend');
    map.fire('moveend');
    expect(map.data('armies').features).toEqual([]);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0]![0]).toEqual({ west: 170, east: -170, south: -10, north: 10 });
    loader.dispose();
    adapter.dispose();
  });

  it('discards a late response even when the transport ignores cancellation', async () => {
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port());
    adapter.resetSession('world');
    const pending: ((value: ReturnType<typeof payload>) => void)[] = [];
    const signals: AbortSignal[] = [];
    const loader = new ViewportLoader(map.port(), adapter, {
      now: () => 0,
      load: (_bounds, signal) => {
        signals.push(signal);
        return new Promise((resolve) => pending.push(resolve));
      },
    });
    const first = loader.refresh();
    const second = loader.refresh();
    const bounds = adapter.getViewportBounds();
    pending[1]!({ ...payload('2'), bounds });
    await second;
    pending[0]!({ ...payload('3', true), bounds });
    await first;
    expect(signals[0]!.aborted).toBe(true);
    expect(map.data('armies').features).toEqual([]);
    loader.dispose();
    expect(map.listeners.get('moveend')?.size).toBe(0);
    adapter.dispose();
  });

  it('shows only the basemap for a viewport too broad to query', async () => {
    const map = new FakeMap();
    map.bounds = { west: -180, east: 180, south: -90, north: 90 };
    const adapter = new MapLibreAdapter(map.port());
    adapter.resetSession('world');
    adapter.render(payload('1', true));
    const load = vi.fn();
    const loader = new ViewportLoader(map.port(), adapter, { load });
    await loader.refresh();
    expect(load).not.toHaveBeenCalled();
    expect(map.data('armies').features).toEqual([]);
    loader.dispose();
    adapter.dispose();
  });

  it('clears data on network failure or mismatched viewport and reports the error', async () => {
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port());
    adapter.resetSession('world');
    const load = vi
      .fn()
      .mockResolvedValueOnce(payload('2'))
      .mockRejectedValueOnce(new Error('offline'));
    const onError = vi.fn();
    const loader = new ViewportLoader(map.port(), adapter, { load, onError });
    adapter.render(payload('1', true));
    await loader.refresh();
    expect(map.data('armies').features).toEqual([]);
    expect(onError.mock.calls[0]![0]).toEqual(new Error('Payload viewport mismatch'));
    await loader.refresh();
    expect(onError.mock.calls[1]![0]).toEqual(new Error('offline'));
    loader.dispose();
    adapter.dispose();
  });

  it('refreshes the current viewport without retaining old snapshot features', async () => {
    vi.useFakeTimers();
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port());
    adapter.resetSession('world');
    const load = vi.fn().mockImplementation(async (bounds) => ({
      ...payload(String(load.mock.calls.length)),
      bounds,
    }));
    const loader = new ViewportLoader(map.port(), adapter, { load, now: () => 0, refreshMs: 1000 });
    await loader.refresh();
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2);
    loader.dispose();
    await loader.refresh();
    expect(load).toHaveBeenCalledTimes(2);
    adapter.dispose();
  });
});

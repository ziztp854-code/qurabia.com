import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapLibreAdapter } from '../src/adapter';
import {
  VIEWPORT_DEFAULT_RETRY,
  ViewportLoader,
  ViewportTimeoutError,
  viewportRetryDelay,
  type ViewportLifecycle,
} from '../src/viewport-loader';
import { FakeMap, payload } from './fixtures';

afterEach(() => vi.useRealTimers());

class FakeLifecycle {
  visibilityState = 'visible';
  online = true;
  readonly listeners = new Map<string, Set<() => void>>();
  private add = (type: string, listener: () => void) => {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  };
  private remove = (type: string, listener: () => void) => {
    this.listeners.get(type)?.delete(listener);
  };
  readonly source: ViewportLifecycle = {
    document: Object.defineProperty(
      { addEventListener: this.add, removeEventListener: this.remove },
      'visibilityState',
      { get: () => this.visibilityState },
    ) as ViewportLifecycle['document'],
    window: { addEventListener: this.add, removeEventListener: this.remove },
    isOnline: () => this.online,
  };
  fire(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
  count() {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

function setup(options: Partial<ConstructorParameters<typeof ViewportLoader>[2]> = {}) {
  vi.useFakeTimers();
  const map = new FakeMap();
  const adapter = new MapLibreAdapter(map.port());
  adapter.resetSession('world');
  const lifecycle = new FakeLifecycle();
  const load = vi.fn().mockImplementation(async (bounds) => ({
    ...payload(String(load.mock.calls.length), true),
    bounds,
  }));
  const loader = new ViewportLoader(map.port(), adapter, {
    load,
    now: () => Date.now(),
    random: () => 0.5,
    lifecycle: lifecycle.source,
    retainOnError: () => true,
    ...options,
  });
  return { map, adapter, lifecycle, load, loader };
}

describe('retry policy', () => {
  it('doubles delays up to a cap and jitters within the declared fraction', () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 20].map((n) =>
      viewportRetryDelay(n, undefined, () => 0.5),
    );
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(viewportRetryDelay(0, VIEWPORT_DEFAULT_RETRY, () => 0)).toBe(750);
    expect(viewportRetryDelay(0, VIEWPORT_DEFAULT_RETRY, () => 1)).toBe(1250);
    expect(viewportRetryDelay(99, VIEWPORT_DEFAULT_RETRY, () => 1)).toBe(30000);
    expect(viewportRetryDelay(0, { baseMs: 500, maxMs: 500, jitter: 0 })).toBe(500);
  });

  it('retries forever with capped backoff, keeps the snapshot, and resumes normal polling', async () => {
    const { map, adapter, load, loader } = setup({ refreshMs: 5000 });
    await loader.refresh();
    expect(map.data('armies').features).toHaveLength(1);
    load.mockRejectedValue(new TypeError('offline'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(map.data('armies').features).toHaveLength(1);
    const gaps: number[] = [];
    let last = Date.now();
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const calls = load.mock.calls.length;
      while (load.mock.calls.length === calls) await vi.advanceTimersByTimeAsync(250);
      gaps.push(Date.now() - last);
      last = Date.now();
    }
    expect(gaps).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000]);
    load.mockImplementation(async (bounds) => ({ ...payload('9', true), bounds }));
    while (load.mock.calls.length < 12) await vi.advanceTimersByTimeAsync(1000);
    const calls = load.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(calls + 1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(calls + 2);
    loader.dispose();
    adapter.dispose();
  });

  it('does not clear an authorized snapshot on a retained failure', async () => {
    const onError = vi.fn();
    const { map, adapter, load, loader } = setup({ onError });
    await loader.refresh();
    load.mockRejectedValueOnce(new Error('503'));
    await loader.refresh();
    expect(onError).toHaveBeenCalledOnce();
    expect(map.data('armies').features).toHaveLength(1);
    loader.dispose();
    adapter.dispose();
  });

  it('clears the snapshot when the host does not retain it', async () => {
    const { map, adapter, load, loader } = setup({ retainOnError: () => false });
    await loader.refresh();
    load.mockRejectedValueOnce(new Error('forbidden'));
    await loader.refresh();
    expect(map.data('armies').features).toEqual([]);
    loader.dispose();
    adapter.dispose();
  });

  it('stops retrying only for failures the host declares unrecoverable', async () => {
    const { adapter, load, loader } = setup({ shouldRetry: () => false });
    load.mockRejectedValue(new Error('forbidden'));
    await loader.refresh();
    await vi.advanceTimersByTimeAsync(120000);
    expect(load).toHaveBeenCalledTimes(1);
    loader.dispose();
    adapter.dispose();
  });

  it('turns a request that never settles into a retryable timeout', async () => {
    const onError = vi.fn();
    const { adapter, load, loader } = setup({ onError, requestTimeoutMs: 4000 });
    load.mockImplementationOnce(() => new Promise(() => {}));
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(4000);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(ViewportTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2);
    loader.dispose();
    adapter.dispose();
  });
});

describe('page lifecycle', () => {
  it('stops polling in a hidden tab, keeps the snapshot, and refreshes immediately when visible', async () => {
    const { map, adapter, lifecycle, load, loader } = setup();
    await loader.refresh();
    lifecycle.visibilityState = 'hidden';
    lifecycle.fire('visibilitychange');
    await vi.advanceTimersByTimeAsync(8000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(map.data('armies').features).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(52000);
    expect(load).toHaveBeenCalledTimes(1);
    lifecycle.visibilityState = 'visible';
    lifecycle.fire('visibilitychange');
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(3);
    loader.dispose();
    adapter.dispose();
  });

  it('lets a response that was in flight when the tab hid land without re-arming polling', async () => {
    const { map, adapter, lifecycle, load, loader } = setup();
    let deliver: ((value: unknown) => void) | undefined;
    load.mockImplementationOnce(() => new Promise((resolve) => (deliver = resolve)));
    const pending = loader.refresh();
    lifecycle.visibilityState = 'hidden';
    lifecycle.fire('visibilitychange');
    deliver?.({ ...payload('4', true), bounds: adapter.getViewportBounds() });
    await pending;
    expect(map.data('armies').features).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(load).toHaveBeenCalledTimes(1);
    loader.dispose();
    adapter.dispose();
  });

  it('keeps data while offline, ignores a premature online while hidden, and recovers on online', async () => {
    const { map, adapter, lifecycle, load, loader } = setup();
    await loader.refresh();
    lifecycle.online = false;
    lifecycle.fire('offline');
    load.mockRejectedValue(new TypeError('Failed to fetch'));
    await vi.advanceTimersByTimeAsync(8000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(map.data('armies').features).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(52000);
    expect(load).toHaveBeenCalledTimes(1);
    lifecycle.visibilityState = 'hidden';
    lifecycle.online = true;
    lifecycle.fire('online');
    expect(load).toHaveBeenCalledTimes(1);
    lifecycle.visibilityState = 'visible';
    load.mockImplementation(async (bounds) => ({ ...payload('7', true), bounds }));
    lifecycle.fire('online');
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(3);
    loader.dispose();
    adapter.dispose();
  });

  it('does not schedule a retry while offline but resumes with fresh backoff afterwards', async () => {
    const { adapter, lifecycle, load, loader } = setup();
    load.mockRejectedValue(new TypeError('Failed to fetch'));
    lifecycle.online = false;
    await loader.refresh();
    await vi.advanceTimersByTimeAsync(120000);
    expect(load).toHaveBeenCalledTimes(1);
    lifecycle.online = true;
    lifecycle.fire('online');
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(3);
    loader.dispose();
    adapter.dispose();
  });

  it('skips passive refresh requests while hidden or when a fresh request is pending', async () => {
    const { adapter, lifecycle, load, loader } = setup();
    lifecycle.visibilityState = 'hidden';
    loader.requestRefresh();
    expect(load).not.toHaveBeenCalled();
    lifecycle.visibilityState = 'visible';
    loader.requestRefresh();
    expect(load).toHaveBeenCalledTimes(1);
    load.mockImplementation(() => new Promise(() => {}));
    void loader.refresh();
    loader.requestRefresh();
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3500);
    loader.requestRefresh();
    expect(load).toHaveBeenCalledTimes(3);
    loader.dispose();
    adapter.dispose();
  });

  it('removes every lifecycle listener on disposal', () => {
    const { adapter, lifecycle, loader } = setup();
    expect(lifecycle.count()).toBe(3);
    loader.dispose();
    expect(lifecycle.count()).toBe(0);
    adapter.dispose();
  });

  it('ignores a stale response that arrives after a resumed refresh', async () => {
    const { map, adapter, lifecycle, load, loader } = setup();
    const resolvers: ((value: unknown) => void)[] = [];
    load.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const first = loader.refresh();
    lifecycle.fire('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    const bounds = adapter.getViewportBounds();
    resolvers[1]!({ ...payload('2'), bounds });
    await vi.advanceTimersByTimeAsync(0);
    resolvers[0]!({ ...payload('1', true), bounds });
    await first;
    expect(map.data('armies').features).toEqual([]);
    loader.dispose();
    adapter.dispose();
  });
});

describe('overview hysteresis', () => {
  const span = (width: number) => ({ west: 0, east: width, south: -10, north: 10 });

  it('enters the overview above 90 degrees and leaves it at 85 or less', async () => {
    const loadOverview = vi.fn().mockResolvedValue(true);
    const { map, adapter, load, loader } = setup({ loadOverview });
    const seen: string[] = [];
    for (const width of [80, 88, 91, 89, 86, 87, 84, 89, 91, 85, 84.9]) {
      map.bounds = span(width);
      await loader.refresh();
      seen.push(`${width}:${loader.isBroad() ? 'overview' : 'local'}`);
    }
    expect(seen).toEqual([
      '80:local',
      '88:local',
      '91:overview',
      '89:overview',
      '86:overview',
      '87:overview',
      '84:local',
      '89:local',
      '91:overview',
      '85:local',
      '84.9:local',
    ]);
    expect(load.mock.calls.length + loadOverview.mock.calls.length).toBe(11);
    loader.dispose();
    adapter.dispose();
  });

  it('clears local detail once on entering the overview, not on every overview poll', async () => {
    const loadOverview = vi.fn().mockResolvedValue(true);
    const { map, adapter, loader } = setup({ loadOverview });
    await loader.refresh();
    const clear = vi.spyOn(adapter, 'clear');
    map.bounds = span(120);
    await loader.refresh();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(loadOverview.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(clear).toHaveBeenCalledTimes(1);
    loader.dispose();
    adapter.dispose();
  });

  it('retries a failed overview with backoff while retaining what is shown', async () => {
    const loadOverview = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(true);
    const { map, adapter, loader } = setup({ loadOverview });
    map.bounds = span(120);
    await loader.refresh();
    expect(loadOverview).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(loadOverview).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(loadOverview).toHaveBeenCalledTimes(3);
    loader.dispose();
    adapter.dispose();
  });
});

function arrivalPayload(arrivalOffset: number, mission = 'attack', serverTime = 1000) {
  const snapshot = payload('1', true);
  return {
    ...snapshot,
    serverTime,
    expiresAt: serverTime + 100000,
    layers: {
      ...snapshot.layers,
      armies: {
        ...snapshot.layers.armies,
        features: snapshot.layers.armies.features.map((army) => ({
          ...army,
          properties: { ...army.properties, own: true },
        })),
      },
      armyRoutes: {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            id: 'army',
            geometry: {
              type: 'LineString' as const,
              coordinates: [
                [31, 30],
                [33, 32],
              ] as const,
            },
            properties: {
              armyId: 'army',
              mission,
              distance: 3,
              departureTime: serverTime,
              arrivalTime: serverTime + arrivalOffset,
            },
          },
        ],
      },
    },
  };
}

describe('authoritative army arrival refresh', () => {
  it('fetches at the next own arrival and again at the server-confirmed return arrival', async () => {
    const { adapter, map, load, loader } = setup({ refreshAtArmyArrivals: true });
    load.mockImplementationOnce(async (bounds) => ({ ...arrivalPayload(1200), bounds }));
    load.mockImplementationOnce(async (bounds) => ({
      ...arrivalPayload(1800, 'return', 2200),
      revision: '2',
      bounds,
    }));
    load.mockImplementationOnce(async (bounds) => {
      const arrived = arrivalPayload(0, 'return', 4000);
      return {
        ...arrived,
        revision: '3',
        bounds,
        layers: {
          ...arrived.layers,
          armies: { type: 'FeatureCollection', features: [] },
          armyRoutes: { type: 'FeatureCollection', features: [] },
        },
      };
    });
    await loader.refresh();
    await vi.advanceTimersByTimeAsync(1199);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(map.data('armyRoutes').features[0].properties.mission).toBe('return');
    expect(map.data('armies').features).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1799);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(3);
    expect(map.data('armies').features).toEqual([]);
    loader.dispose();
    adapter.dispose();
  });

  it('keeps the current poll bound and ignores rival and unowned route deadlines', async () => {
    const { adapter, load, loader } = setup({ refreshAtArmyArrivals: true });
    const snapshot = arrivalPayload(10000);
    load.mockImplementation(async (bounds) => ({
      ...snapshot,
      revision: String(load.mock.calls.length),
      bounds,
      layers: {
        ...snapshot.layers,
        armies: {
          ...snapshot.layers.armies,
          features: [
            ...snapshot.layers.armies.features,
            { ...snapshot.layers.armies.features[0]!, id: 'rival', properties: { own: false } },
          ],
        },
        armyRoutes: {
          ...snapshot.layers.armyRoutes,
          features: [
            ...snapshot.layers.armyRoutes.features,
            {
              ...snapshot.layers.armyRoutes.features[0]!,
              id: 'rival',
              properties: { armyId: 'rival', arrivalTime: 1100 },
            },
            {
              ...snapshot.layers.armyRoutes.features[0]!,
              id: 'hidden',
              properties: { armyId: 'hidden', arrivalTime: 1050 },
            },
          ],
        },
      },
    }));
    await loader.refresh();
    await vi.advanceTimersByTimeAsync(4999);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    loader.dispose();
    adapter.dispose();
  });

  it('does not loop when the same snapshot still carries an already-reached deadline', async () => {
    const { adapter, load, loader } = setup({ refreshAtArmyArrivals: true });
    load.mockImplementation(async (bounds) => ({
      ...arrivalPayload(1000),
      revision: String(load.mock.calls.length),
      bounds,
    }));
    await loader.refresh();
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4999);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(3);
    loader.dispose();
    adapter.dispose();
  });

  it('yields to bounded failure backoff after an arrival request fails', async () => {
    const { adapter, load, loader } = setup({ refreshAtArmyArrivals: true });
    load.mockImplementationOnce(async (bounds) => ({ ...arrivalPayload(1200), bounds }));
    await loader.refresh();
    load.mockRejectedValue(new Error('503'));
    await vi.advanceTimersByTimeAsync(1200);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1999);
    expect(load).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(4);
    loader.dispose();
    adapter.dispose();
  });

  it('suspends arrival polling while hidden/offline and cancels it on disposal', async () => {
    const { adapter, lifecycle, load, loader } = setup({ refreshAtArmyArrivals: true });
    load.mockImplementation(async (bounds) => ({
      ...arrivalPayload(1000),
      revision: String(load.mock.calls.length),
      bounds,
    }));
    await loader.refresh();
    lifecycle.visibilityState = 'hidden';
    lifecycle.fire('visibilitychange');
    await vi.advanceTimersByTimeAsync(1001);
    expect(load).toHaveBeenCalledTimes(1);
    lifecycle.visibilityState = 'visible';
    lifecycle.fire('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    lifecycle.online = false;
    lifecycle.fire('offline');
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(2);
    lifecycle.online = true;
    lifecycle.fire('online');
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(3);
    loader.dispose();
    adapter.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('keeps legacy fixed polling unless the host opts into arrival refresh', async () => {
    const { adapter, load, loader } = setup();
    load.mockImplementation(async (bounds) => ({
      ...arrivalPayload(1000),
      revision: String(load.mock.calls.length),
      bounds,
    }));
    await loader.refresh();
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(load).toHaveBeenCalledTimes(2);
    loader.dispose();
    adapter.dispose();
  });
});

describe('realtime primary with authorized API snapshots', () => {
  it('uses authorization TTL instead of the 5s poll while the acknowledged channel is healthy', async () => {
    const { adapter, load, loader } = setup({ refreshAtArmyArrivals: true });
    const started = Date.now();
    load.mockImplementation(async (bounds) => {
      const snapshot = arrivalPayload(60000, 'attack', 1000 + Date.now() - started);
      return {
        ...snapshot,
        revision: String(load.mock.calls.length),
        bounds,
        expiresAt: snapshot.serverTime + 15000,
      };
    });
    loader.setRealtimeHealth(true);
    await loader.refresh();
    await vi.advanceTimersByTimeAsync(14999);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15000);
    expect(load).toHaveBeenCalledTimes(3);
    loader.dispose();
    adapter.dispose();
  });

  it('uses bounded fallback intervals and returns to TTL after a live ACK', async () => {
    const { adapter, load, loader } = setup();
    const started = Date.now();
    load.mockImplementation(async (bounds) => ({
      ...arrivalPayload(100000, 'attack', 1000 + Date.now() - started),
      revision: String(load.mock.calls.length),
      bounds,
    }));
    loader.setRealtimeHealth(false);
    await loader.refresh();
    for (const interval of [5000, 10000, 20000, 30000, 30000]) {
      const previous = load.mock.calls.length;
      await vi.advanceTimersByTimeAsync(interval - 1);
      expect(load).toHaveBeenCalledTimes(previous);
      await vi.advanceTimersByTimeAsync(1);
      expect(load).toHaveBeenCalledTimes(previous + 1);
    }
    loader.setRealtimeHealth(true);
    const previous = load.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30000);
    expect(load).toHaveBeenCalledTimes(previous);
    loader.dispose();
    adapter.dispose();
  });

  it('coalesces a revision burst during a fetch into one follow-up and never aborts that fetch', async () => {
    const { adapter, load, loader } = setup();
    let deliver!: (value: unknown) => void;
    let firstSignal!: AbortSignal;
    load.mockImplementationOnce((_bounds, signal) => {
      firstSignal = signal;
      return new Promise((resolve) => {
        deliver = resolve;
      });
    });
    load.mockImplementation(async (bounds) => ({ ...payload('4', true), bounds }));
    const first = loader.refresh();
    loader.requestRevision(2);
    loader.requestRevision(4);
    loader.requestRevision(3);
    expect(load).toHaveBeenCalledTimes(1);
    expect(firstSignal.aborted).toBe(false);
    deliver({ ...payload('1', true), bounds: adapter.getViewportBounds() });
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(loader.currentRevision).toBe('4');
    expect(firstSignal.aborted).toBe(false);
    loader.requestRevision(4);
    loader.requestRevision(2);
    expect(load).toHaveBeenCalledTimes(2);
    loader.dispose();
    adapter.dispose();
  });

  it('queues a resync during a fetch and follows up only once', async () => {
    const { adapter, load, loader } = setup();
    let deliver!: (value: unknown) => void;
    load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
    const first = loader.refresh();
    loader.requestRevision();
    loader.requestRevision();
    deliver({ ...payload('1', true), bounds: adapter.getViewportBounds() });
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    loader.dispose();
    adapter.dispose();
  });

  it('backs off when an API response has not caught up to a notified revision', async () => {
    const { adapter, load, loader } = setup();
    await loader.refresh();
    load.mockImplementation(async (bounds) => ({ ...payload('4', true), bounds }));
    loader.requestRevision(5);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(loader.currentRevision).toBe('1');
    loader.requestRevision(6);
    loader.requestRevision(7);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(load).toHaveBeenCalledTimes(2);
    load.mockImplementation(async (bounds) => ({ ...payload('7', true), bounds }));
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(3);
    expect(loader.currentRevision).toBe('7');
    loader.dispose();
    adapter.dispose();
  });

  it('never loops or retains private data after an unrecoverable authorization failure', async () => {
    const { map, adapter, load, loader } = setup({
      shouldRetry: () => false,
      retainOnError: () => false,
    });
    loader.setRealtimeHealth(true);
    await loader.refresh();
    load.mockRejectedValue(new Error('403'));
    loader.requestRevision(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(map.data('armies').features).toEqual([]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(load).toHaveBeenCalledTimes(2);
    loader.dispose();
    adapter.dispose();
    loader.requestRevision(4);
    loader.setRealtimeHealth(true);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

it('restarts bounded fallback at 5s after HTTP recovery and lifecycle resume', async () => {
  const { adapter, lifecycle, load, loader } = setup();
  const started = Date.now();
  const snapshot = async (bounds: import('@mamluk/world-map-core').BoundingBox) => ({
    ...arrivalPayload(100000, 'attack', 1000 + Date.now() - started),
    revision: String(load.mock.calls.length),
    bounds,
  });
  load.mockImplementation(snapshot);
  loader.setRealtimeHealth(false);
  await loader.refresh();
  await vi.advanceTimersByTimeAsync(15000);
  expect(load).toHaveBeenCalledTimes(3);
  load.mockRejectedValueOnce(new Error('503'));
  await loader.refresh();
  await vi.advanceTimersByTimeAsync(1000);
  expect(load).toHaveBeenCalledTimes(5);
  await vi.advanceTimersByTimeAsync(4999);
  expect(load).toHaveBeenCalledTimes(5);
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(6);
  lifecycle.visibilityState = 'hidden';
  lifecycle.fire('visibilitychange');
  await vi.advanceTimersByTimeAsync(50000);
  expect(load).toHaveBeenCalledTimes(6);
  lifecycle.visibilityState = 'visible';
  lifecycle.fire('visibilitychange');
  await vi.advanceTimersByTimeAsync(0);
  expect(load).toHaveBeenCalledTimes(7);
  await vi.advanceTimersByTimeAsync(4999);
  expect(load).toHaveBeenCalledTimes(7);
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(8);
  loader.dispose();
  adapter.dispose();
});

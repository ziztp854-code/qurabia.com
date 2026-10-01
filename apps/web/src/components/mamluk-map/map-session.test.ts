import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE } from '@mamluk/maplibre-adapter';
import { createMapSession } from './map-session';
import { MapSdkFixture, approvedPayload } from './map-fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function retrySession() {
  const map = new MapSdkFixture();
  const callbacks = { onPayload: vi.fn(), onSelection: vi.fn(), onStatus: vi.fn() };
  return {
    map,
    callbacks,
    session: createMapSession(map.asMap(), 'world', 'mercator', DEFAULT_PALETTE, callbacks),
  };
}

it('requests a fresh viewport after a transient network failure and resets backoff after acceptance', async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValueOnce({ ok: true, json: async () => approvedPayload() })
    .mockRejectedValueOnce(new Error('Another transient failure'))
    .mockResolvedValue({ ok: true, json: async () => approvedPayload('world', '2') });
  vi.stubGlobal('fetch', fetchMock);
  const { map, callbacks, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  expect(callbacks.onStatus).toHaveBeenLastCalledWith('error');
  expect(map.sources.size).toBe(0);
  await vi.advanceTimersByTimeAsync(999);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(callbacks.onStatus).toHaveBeenLastCalledWith('ready');
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(map.sources.size).toBe(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(callbacks.onPayload.mock.lastCall?.[0]?.revision).toBe('2');
  session.dispose();
});

it('rejects a delayed successful response beyond its TTL and recovers only from a fresh snapshot', async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: async () => approvedPayload() }), 9000),
        ),
    )
    .mockResolvedValue({ ok: true, json: async () => approvedPayload('world', '2') });
  vi.stubGlobal('fetch', fetchMock);
  const { map, callbacks, session } = retrySession();
  await vi.advanceTimersByTimeAsync(9000);
  expect(callbacks.onStatus).toHaveBeenLastCalledWith('error');
  expect(callbacks.onPayload.mock.calls.every(([payload]) => payload === null)).toBe(true);
  expect(map.sources.size).toBe(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(callbacks.onPayload.mock.lastCall?.[0]?.revision).toBe('2');
  expect(map.sources.size).toBe(9);
  session.dispose();
});

it('limits automatic retries to three attempts with increasing delays and keeps failures visible', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockRejectedValue(new Error('Unavailable'));
  vi.stubGlobal('fetch', fetchMock);
  const { map, callbacks, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(4999);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(callbacks.onStatus).toHaveBeenLastCalledWith('error');
  expect(map.sources.size).toBe(0);
  session.dispose();
});

it('cancels a scheduled recovery when the session is disposed', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockRejectedValue(new Error('Unavailable'));
  vi.stubGlobal('fetch', fetchMock);
  const { session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  session.dispose();
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('cancels a scheduled recovery when movement leaves a loadable viewport', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockRejectedValue(new Error('Unavailable'));
  vi.stubGlobal('fetch', fetchMock);
  const { map, callbacks, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  map.bounds = { west: -180, east: 180, south: -80, north: 80 };
  map.fire('moveend');
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(callbacks.onStatus).toHaveBeenLastCalledWith('zoom');
  session.dispose();
});

it('does not let an old recovery timer abort a newer manual refresh', async () => {
  vi.useFakeTimers();
  let deliver: ((value: unknown) => void) | undefined;
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
  vi.stubGlobal('fetch', fetchMock);
  const { callbacks, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  const refresh = session.loader.refresh();
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]?.[1].signal.aborted).toBe(false);
  deliver?.({ ok: true, json: async () => approvedPayload() });
  await refresh;
  expect(callbacks.onStatus).toHaveBeenLastCalledWith('ready');
  session.dispose();
});

it('keeps overlays when the SDK emits moveend for a redundant projection update', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() });
  vi.stubGlobal('fetch', fetchMock);
  const map = new MapSdkFixture();
  vi.spyOn(map, 'setProjection').mockImplementation((value) => {
    map.projection = value.type;
    map.fire('moveend');
  });
  const onStatus = vi.fn();
  const session = createMapSession(map.asMap(), 'world', 'globe', DEFAULT_PALETTE, {
    onPayload: vi.fn(),
    onSelection: vi.fn(),
    onStatus,
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(map.sources.size).toBe(9);
  expect(map.sources.get('mamluk-cities')?.data).toMatchObject(approvedPayload().layers.cities);
  expect(onStatus).toHaveBeenLastCalledWith('ready');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(map.setProjection).toHaveBeenCalledTimes(1);
  session.dispose();
});

it('promotes approved string IDs only in SDK copies, including subsequent source updates', async () => {
  vi.useFakeTimers();
  const payload = approvedPayload();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
  const map = new MapSdkFixture();
  const session = createMapSession(map.asMap(), 'world', 'mercator', DEFAULT_PALETTE, {
    onPayload: vi.fn(),
    onSelection: vi.fn(),
    onStatus: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(map.sources.get('mamluk-cities')).toMatchObject({
    promoteId: '__mamlukFeatureId',
    data: { features: [{ properties: { __mamlukFeatureId: 'cairo' } }] },
  });
  expect(payload.layers.cities.features[0]?.properties).not.toHaveProperty('__mamlukFeatureId');
  map.fire('style.load');
  await vi.advanceTimersByTimeAsync(0);
  expect(map.sources.get('mamluk-cities')?.data).toMatchObject({
    features: [{ properties: { __mamlukFeatureId: 'cairo' } }],
  });
  session.dispose();
});

it('clears, replaces, and expires approved sources while basemap tiles are still loading', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
  );
  const map = new MapSdkFixture();
  const onPayload = vi.fn();
  const session = createMapSession(map.asMap(), 'world', 'mercator', DEFAULT_PALETTE, {
    onPayload,
    onSelection: vi.fn(),
    onStatus: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(map.sources.size).toBe(9);
  map.styleLoaded = false;
  map.fire('moveend');
  expect(map.sources.size).toBe(0);
  await vi.advanceTimersByTimeAsync(150);
  expect(map.sources.size).toBe(9);
  session.loader.dispose();
  await vi.advanceTimersByTimeAsync(8000);
  expect(map.sources.size).toBe(0);
  expect(onPayload).toHaveBeenLastCalledWith(null);
  session.dispose();
  expect(map.listeners.get('style.load')?.size).toBe(0);
});

it('updates selection data only from accepted snapshots and clears it on movement and expiry', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
  );
  const map = new MapSdkFixture();
  const onPayload = vi.fn(),
    onSelection = vi.fn(),
    onStatus = vi.fn();
  const session = createMapSession(map.asMap(), 'world', 'globe', DEFAULT_PALETTE, {
    onPayload,
    onSelection,
    onStatus,
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(onPayload.mock.lastCall?.[0]?.layers.cities.features[0]?.id).toBe('cairo');
  session.adapter.render({
    ...approvedPayload('world', '0'),
    layers: { ...approvedPayload().layers, cities: { type: 'FeatureCollection', features: [] } },
  });
  expect(onPayload.mock.lastCall?.[0]?.revision).toBe('1');
  map.clicked = [{ source: 'mamluk-cities', id: 'cairo' }];
  map.fire('click', { point: { x: 1, y: 1 } });
  expect(onSelection).toHaveBeenLastCalledWith({ layer: 'cities', id: 'cairo' });
  map.fire('moveend');
  expect(onPayload).toHaveBeenLastCalledWith(null);
  expect(onSelection).toHaveBeenLastCalledWith(null);
  session.loader.dispose();
  session.adapter.render(approvedPayload('world', '2'));
  await vi.advanceTimersByTimeAsync(8000);
  expect(onPayload).toHaveBeenLastCalledWith(null);
  session.dispose();
  expect(map.listeners.get('click')?.size).toBe(0);
});

it('rejects malformed network data, aborts requests on teardown, and never sends player IDs', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ secret: 'enemy' }) })
    .mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  const map = new MapSdkFixture();
  const onStatus = vi.fn();
  const session = createMapSession(map.asMap(), 'world', 'mercator', DEFAULT_PALETTE, {
    onPayload: vi.fn(),
    onSelection: vi.fn(),
    onStatus,
  });
  await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith('error'));
  const pending = session.loader.refresh();
  expect(fetchMock.mock.calls[0]?.[0]).not.toContain('playerId');
  const request = fetchMock.mock.calls[1]?.[1];
  session.dispose();
  expect(request.signal.aborted).toBe(true);
  void pending;
});

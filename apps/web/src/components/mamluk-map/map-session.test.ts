import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE } from '@mamluk/maplibre-adapter';
import type { MapPayload } from '@mamluk/world-map-core';
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

function territoryPayload(): MapPayload {
  const payload = approvedPayload();
  return {
    ...payload,
    layers: {
      ...payload.layers,
      territories: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'cairo',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [31.22, 30.03],
                  [31.25, 30.03],
                  [31.25, 30.06],
                  [31.22, 30.06],
                  [31.22, 30.03],
                ],
              ],
            },
            properties: { regionId: 'egypt', ownerPlayerId: 'viewer', ownerSultanateId: null },
          },
        ],
      },
      fog: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'fog',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [28, 25],
                  [40, 25],
                  [40, 36],
                  [28, 36],
                  [28, 25],
                ],
              ],
            },
            properties: { kind: 'fog' },
          },
        ],
      },
    },
  };
}

it('keeps approved settlement markers and gold borders above fog without adding another source', async () => {
  vi.useFakeTimers();
  const payload = territoryPayload();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
  const { map, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  expect(map.layers.get('mamluk-village-borders')).toMatchObject({
    type: 'line',
    source: 'mamluk-territories',
    paint: { 'line-color': DEFAULT_PALETTE.city, 'line-width': 2.5, 'line-opacity': 0.9 },
  });
  expect(map.sources.size).toBe(9);
  expect(map.sources.get('mamluk-territories')?.data).toMatchObject(payload.layers.territories);
  expect(payload.layers.territories.features[0]?.properties).not.toHaveProperty(
    '__mamlukFeatureId',
  );
  const order = [...map.layers.keys()];
  expect(order.indexOf('mamluk-village-borders')).toBeGreaterThan(
    order.indexOf('mamluk-territories'),
  );
  expect(order.indexOf('mamluk-village-borders')).toBeLessThan(order.indexOf('mamluk-cities'));
  expect(order.indexOf('mamluk-village-borders')).toBeGreaterThan(order.indexOf('mamluk-fog'));
  expect(order.indexOf('mamluk-territories')).toBeGreaterThan(order.indexOf('mamluk-fog'));
  expect(order.indexOf('mamluk-cities')).toBeGreaterThan(order.indexOf('mamluk-fog'));
  expect(map.layers.get('mamluk-fog')).toMatchObject({
    type: 'fill',
    paint: { 'fill-opacity': 0.92 },
  });
  expect(map.sources.get('mamluk-fog')?.data).toMatchObject(payload.layers.fog);
  expect(map.sources.get('mamluk-armies')?.data).toEqual({
    type: 'FeatureCollection',
    features: [],
  });
  expect(map.sources.get('mamluk-armyRoutes')?.data).toEqual({
    type: 'FeatureCollection',
    features: [],
  });
  session.dispose();
});

it('removes the outline before its source and restores it safely through movement, style replacement, and expiry', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => territoryPayload() }),
  );
  const { map, session } = retrySession();
  const removeSource = map.removeSource.bind(map);
  vi.spyOn(map, 'removeSource').mockImplementation((id) => {
    if (id === 'mamluk-territories') expect(map.layers.has('mamluk-village-borders')).toBe(false);
    return removeSource(id);
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(map.layers.has('mamluk-village-borders')).toBe(true);
  map.fire('moveend');
  expect(map.layers.has('mamluk-village-borders')).toBe(false);
  expect(map.layers.has('mamluk-fog')).toBe(false);
  expect(map.sources.size).toBe(0);
  await vi.advanceTimersByTimeAsync(150);
  expect(map.layers.has('mamluk-village-borders')).toBe(true);
  map.sources.clear();
  map.layers.clear();
  map.fire('style.load');
  await vi.advanceTimersByTimeAsync(0);
  expect(map.layers.has('mamluk-village-borders')).toBe(true);
  const restoredOrder = [...map.layers.keys()];
  expect(restoredOrder.indexOf('mamluk-cities')).toBeGreaterThan(
    restoredOrder.indexOf('mamluk-fog'),
  );
  expect(restoredOrder.indexOf('mamluk-village-borders')).toBeGreaterThan(
    restoredOrder.indexOf('mamluk-fog'),
  );
  session.loader.dispose();
  await vi.advanceTimersByTimeAsync(8000);
  expect(map.layers.has('mamluk-village-borders')).toBe(false);
  expect(map.layers.has('mamluk-fog')).toBe(false);
  expect(map.sources.size).toBe(0);
  session.adapter.render({ ...territoryPayload(), revision: '2' });
  expect(map.layers.has('mamluk-village-borders')).toBe(true);
  session.dispose();
  expect(map.layers.size).toBe(0);
  expect(map.sources.size).toBe(0);
});

it('never generates village polygons when the approved territory source is empty', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
  );
  const { map, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  expect(map.sources.get('mamluk-territories')?.data).toEqual({
    type: 'FeatureCollection',
    features: [],
  });
  expect(map.sources.has('mamluk-village-borders')).toBe(false);
  session.dispose();
});

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

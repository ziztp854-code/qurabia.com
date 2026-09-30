import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE } from '@mamluk/maplibre-adapter';
import { createMapSession } from './map-session';
import { MapSdkFixture, approvedPayload } from './map-fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

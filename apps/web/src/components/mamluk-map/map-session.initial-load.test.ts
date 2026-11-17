import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE } from '@mamluk/maplibre-adapter';
import { createMapSession } from './map-session';
import { approvedPayload, MapSdkFixture } from './map-fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function delayedStyleSession(broad = false) {
  const map = new MapSdkFixture();
  map.styleLoaded = false;
  if (broad) map.bounds = { west: -180, south: -80, east: 180, north: 80 };
  const callbacks = { onPayload: vi.fn(), onSelection: vi.fn(), onStatus: vi.fn() };
  const session = createMapSession(
    map.asMap(),
    'world',
    'mercator',
    DEFAULT_PALETTE,
    callbacks,
    undefined,
    false,
  );
  return { map, callbacks, session };
}

const overviewResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    worldId: 'world',
    revision: '1',
    serverTime: 1000,
    cells: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'cell:14:8',
          geometry: { type: 'Point', coordinates: [31, 30] },
          properties: { count: 42, targetVillageId: null },
        },
      ],
    },
  }),
});

function styleReady(map: MapSdkFixture) {
  map.styleLoaded = true;
  map.fire('style.load');
}

it('starts the first viewport request while the style loads without cancelling it when the style is ready', async () => {
  vi.useFakeTimers();
  let respond!: (response: unknown) => void;
  const fetchMock = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const { map, session, callbacks } = delayedStyleSession();
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toContain('/world-map/viewport?');
    const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    styleReady(map);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(signal.aborted).toBe(false);
    respond({ ok: true, status: 200, json: async () => approvedPayload() });
    await vi.advanceTimersByTimeAsync(0);
    expect(callbacks.onPayload).toHaveBeenLastCalledWith(approvedPayload());
    expect(map.sources.get('mamluk-cities')?.data).toMatchObject({ features: [{ id: 'cairo' }] });
  } finally {
    session.dispose();
  }
});

it('renders a viewport response received before style readiness without fetching it twice', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => approvedPayload(),
  });
  vi.stubGlobal('fetch', fetchMock);
  const { map, session, callbacks } = delayedStyleSession();
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(map.sources.has('mamluk-cities')).toBe(false);
    expect(callbacks.onStatus).toHaveBeenLastCalledWith('loading');
    styleReady(map);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(map.sources.get('mamluk-cities')?.data).toMatchObject({ features: [{ id: 'cairo' }] });
    expect(callbacks.onStatus).toHaveBeenLastCalledWith('ready');
  } finally {
    session.dispose();
  }
});

it('rejects the old viewport when bounds change before style readiness', async () => {
  vi.useFakeTimers();
  const responses: ((value: unknown) => void)[] = [];
  const fetchMock = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        responses.push(resolve);
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const { map, session } = delayedStyleSession();
  try {
    await vi.advanceTimersByTimeAsync(0);
    const oldSignal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    const bounds = { west: 29, south: 25, east: 40, north: 36 };
    map.bounds = bounds;
    map.fire('moveend');
    styleReady(map);
    await vi.advanceTimersByTimeAsync(0);
    expect(oldSignal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fresh = approvedPayload('world', '2');
    const city = fresh.layers.cities.features[0]!;
    const updated = {
      ...fresh,
      bounds,
      layers: {
        ...fresh.layers,
        cities: {
          ...fresh.layers.cities,
          features: [{ ...city, properties: { ...city.properties, name: 'القرية الجديدة' } }],
        },
      },
    };
    responses[1]!({ ok: true, status: 200, json: async () => updated });
    await vi.advanceTimersByTimeAsync(0);
    responses[0]!({ ok: true, status: 200, json: async () => approvedPayload() });
    await vi.advanceTimersByTimeAsync(0);
    expect(map.sources.get('mamluk-cities')?.data).toMatchObject({
      features: [{ properties: { name: 'القرية الجديدة' } }],
    });
  } finally {
    session.dispose();
  }
});

it('does not restore a snapshot that expired while the style was unavailable', async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => approvedPayload() })
    .mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  const { map, session, callbacks } = delayedStyleSession();
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(callbacks.onPayload).toHaveBeenLastCalledWith(approvedPayload());
    await vi.advanceTimersByTimeAsync(8001);
    expect(callbacks.onPayload).toHaveBeenLastCalledWith(null);
    styleReady(map);
    await vi.advanceTimersByTimeAsync(0);
    expect(map.sources.get('mamluk-cities')?.data).not.toMatchObject({
      features: [{ id: 'cairo' }],
    });
  } finally {
    session.dispose();
  }
});

it('fetches the world overview during style loading and renders it once the style is ready', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue(overviewResponse());
  vi.stubGlobal('fetch', fetchMock);
  const { map, session } = delayedStyleSession(true);
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toContain('/world-map/overview?');
    expect(map.sources.has('mamluk-overview')).toBe(false);
    styleReady(map);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(map.sources.get('mamluk-overview')?.data).toMatchObject({
      features: [{ id: 'cell:14:8', properties: { count: 42 } }],
    });
  } finally {
    session.dispose();
  }
});

it('cancels a world overview waiting for style readiness when the session is disposed', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue(overviewResponse());
  vi.stubGlobal('fetch', fetchMock);
  const { map, session, callbacks } = delayedStyleSession(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalledOnce();
  const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
  session.dispose();
  expect(signal.aborted).toBe(true);
  styleReady(map);
  await vi.advanceTimersByTimeAsync(0);
  expect(map.sources.has('mamluk-overview')).toBe(false);
  expect(callbacks.onPayload).not.toHaveBeenCalledWith(expect.anything());
  expect(map.listeners.get('style.load')?.size ?? 0).toBe(0);
});

it('does not render an overview held beyond its refresh interval while the style loads', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue(overviewResponse());
  vi.stubGlobal('fetch', fetchMock);
  const { map, session } = delayedStyleSession(true);
  try {
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5001);
    styleReady(map);
    await vi.advanceTimersByTimeAsync(0);
    expect(map.sources.has('mamluk-overview')).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(map.sources.get('mamluk-overview')?.data).toMatchObject({
      features: [{ id: 'cell:14:8' }],
    });
  } finally {
    session.dispose();
  }
});

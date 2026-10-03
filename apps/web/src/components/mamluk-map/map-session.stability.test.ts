import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE } from '@mamluk/maplibre-adapter';
import type { MapPayload } from '@mamluk/world-map-core';
import type { Map as LibreMap } from 'maplibre-gl';
import { createMapSession } from './map-session';
import { MapSdkFixture, approvedPayload } from './map-fixture';
import type { OwnershipPresentationOptions } from './player-ownership';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('keeps the anonymous geographic reference at global zoom without requesting private world aggregates', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const map = new MapSdkFixture();
  map.bounds = { west: -180, east: 180, south: -80, north: 80 };
  const session = createMapSession(
    map.asMap(),
    'mamluk-public-geographic-atlas-v1',
    'globe',
    DEFAULT_PALETTE,
    { onPayload: vi.fn(), onSelection: vi.fn(), onStatus: vi.fn() },
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetch).not.toHaveBeenCalled();
  session.dispose();
});

it('keeps an unexpired authorized village snapshot visible while its background poll is pending', async () => {
  vi.useFakeTimers();
  const payload = approvedPayload();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
      .mockImplementation(() => new Promise(() => {})),
  );
  const { map, callbacks, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  const source = map.sources.get('mamluk-cities');
  expect(source?.data).toMatchObject({ features: [{ id: 'cairo' }] });
  callbacks.onPayload.mockClear();
  await vi.advanceTimersByTimeAsync(5000);
  expect(map.sources.get('mamluk-cities')).toBe(source);
  expect(callbacks.onPayload).not.toHaveBeenCalledWith(null);
  await vi.advanceTimersByTimeAsync(3000);
  expect(callbacks.onPayload).toHaveBeenLastCalledWith(null);
  session.dispose();
});

it.each(['network', '503'] as const)(
  'retains authorized villages through a temporary %s outage but still expires private details',
  async (failure) => {
    vi.useFakeTimers();
    const transport = vi.fn().mockResolvedValueOnce(publicResponse());
    if (failure === 'network') transport.mockRejectedValue(new TypeError('Failed to fetch'));
    else transport.mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', transport);
    const { map, callbacks, session } = retrySession();
    await vi.advanceTimersByTimeAsync(0);
    const source = map.sources.get('mamluk-cities');
    await vi.advanceTimersByTimeAsync(5000);
    expect(map.sources.get('mamluk-cities')).toBe(source);
    expect(callbacks.onPayload).toHaveBeenLastCalledWith(territoryPayload());
    await vi.advanceTimersByTimeAsync(3000);
    expect(callbacks.onPayload).toHaveBeenLastCalledWith(null);
    expect(map.sources.get('mamluk-cities')).toBe(source);
    expect(
      (source?.data as { features: { properties: object }[] }).features[0].properties,
    ).not.toHaveProperty('fortificationLevel');
    session.dispose();
  },
);

it('clusters the authorized city source and expands clusters without selecting a fabricated village', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(publicResponse()));
  const { map, callbacks, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  const cities = map.sources.get('mamluk-cities')!;
  expect(cities).toMatchObject({ cluster: true, clusterMaxZoom: 7, clusterRadius: 48 });
  expect(map.layers.get('mamluk-cities')).toMatchObject({ filter: ['!', ['has', 'point_count']] });
  expect(map.layers.has('mamluk-village-cluster-count')).toBe(true);
  Object.assign(cities, { getClusterExpansionZoom: vi.fn().mockResolvedValue(8) });
  map.clicked = [
    {
      source: 'mamluk-cities',
      id: 1,
      geometry: { type: 'Point', coordinates: [31, 30] },
      properties: { cluster_id: 1, point_count: 42 },
    } as never,
  ];
  map.fire('click', { point: { x: 2, y: 2 } });
  await vi.advanceTimersByTimeAsync(0);
  expect(map.lastCamera).toMatchObject({ center: [31, 30], zoom: 8 });
  expect(callbacks.onSelection).not.toHaveBeenCalledWith({ layer: 'cities', id: '1' });
  session.dispose();
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

function publicResponse(payload = territoryPayload()) {
  return {
    ok: true,
    headers: new Headers({ 'X-Mamluk-Public-Settlements': '1' }),
    json: async () => payload,
  };
}

it('selects the nearest approved illustrated settlement when city and castle hit areas overlap', async () => {
  vi.useFakeTimers();
  const base = approvedPayload();
  const payload: MapPayload = {
    ...base,
    layers: {
      ...base.layers,
      castles: {
        type: 'FeatureCollection',
        features: [
          {
            ...base.layers.cities.features[0]!,
            id: 'citadel',
            geometry: { type: 'Point', coordinates: [31.26, 30.03] },
            properties: {
              ...base.layers.cities.features[0]!.properties,
              kind: 'castle',
              name: 'القلعة',
              cityId: null,
            },
          },
        ],
      },
    },
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(publicResponse(payload)));
  const { map, callbacks, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  expect(callbacks.onPayload).toHaveBeenLastCalledWith(payload);
  map.layers.set('mamluk-cities', { type: 'symbol' });
  map.layers.set('mamluk-castles', { type: 'symbol' });
  map.project = ([longitude]) => (longitude === 31.2357 ? { x: 194, y: 320 } : { x: 206, y: 328 });
  map.clicked = [
    { source: 'mamluk-castles', id: 'citadel' },
    { source: 'mamluk-cities', id: 'cairo' },
  ];
  map.fire('click', { point: { x: 194, y: 302 } });
  expect(callbacks.onSelection).toHaveBeenLastCalledWith({ layer: 'cities', id: 'cairo' });
  map.fire('click', { point: { x: 206, y: 310 } });
  expect(callbacks.onSelection).toHaveBeenLastCalledWith({ layer: 'castles', id: 'citadel' });
  map.clicked = [{ source: 'mamluk-cities', id: 'unapproved-city' }];
  map.fire('click', { point: { x: 194, y: 302 } });
  expect(callbacks.onSelection).toHaveBeenLastCalledWith(null);
  session.dispose();
});

const ownership: OwnershipPresentationOptions = {
  viewerPlayerId: 'viewer',
  colors: {
    own: 'gold',
    neutral: 'gray',
    selected: 'white',
    halo: 'black',
    players: ['green', 'blue'],
  },
};

it('removes ownership companions when the SDK rejects their primary layer during rendering', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(publicResponse()));
  const map = new MapSdkFixture();
  const addLayer = map.addLayer.bind(map);
  vi.spyOn(map, 'addLayer').mockImplementation((layer, before) => {
    if (layer.id === 'mamluk-cities') throw new Error('SDK primary layer rejected');
    return addLayer(layer, before);
  });
  const removeSource = map.removeSource.bind(map);
  vi.spyOn(map, 'removeSource').mockImplementation((id) => {
    if ([...map.layers.values()].some((layer) => (layer as { source?: string }).source === id))
      throw new Error('SDK source still used by companion layer');
    return removeSource(id);
  });
  const callbacks = {
    onPayload: vi.fn(),
    onPublicPayload: vi.fn(),
    onSelection: vi.fn(),
    onStatus: vi.fn(),
  };
  const session = createMapSession(
    map.asMap(),
    'world',
    'mercator',
    DEFAULT_PALETTE,
    callbacks,
    undefined,
    undefined,
    ownership,
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(map.layers.size).toBe(0);
  expect(map.sources.size).toBe(0);
  expect(callbacks.onPublicPayload).toHaveBeenLastCalledWith(null);
  expect(callbacks.onStatus).toHaveBeenLastCalledWith('error');
  session.dispose();
});

it('publishes a separate public settlement payload with private collections and strategic attributes excluded', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(publicResponse())
      .mockImplementation(() => new Promise(() => {})),
  );
  const map = new MapSdkFixture();
  const callbacks = {
    onPayload: vi.fn(),
    onPublicPayload: vi.fn(),
    onSelection: vi.fn(),
    onStatus: vi.fn(),
  };
  const session = createMapSession(map.asMap(), 'world', 'mercator', DEFAULT_PALETTE, callbacks);
  await vi.advanceTimersByTimeAsync(0);
  const presentation = callbacks.onPublicPayload.mock.lastCall?.[0] as MapPayload;
  expect(presentation.layers.cities.features[0]?.properties).toEqual({
    name: 'القاهرة',
    regionId: 'egypt',
    ownerPlayerId: 'viewer',
    ownerSultanateId: null,
  });
  expect(presentation.layers.territories).toEqual(territoryPayload().layers.territories);
  for (const layer of [
    'castles',
    'armies',
    'armyRoutes',
    'sieges',
    'sultanateBorders',
    'visibility',
    'fog',
  ] as const)
    expect(presentation.layers[layer].features).toEqual([]);
  await vi.advanceTimersByTimeAsync(9000);
  expect(callbacks.onPayload).toHaveBeenLastCalledWith(null);
  expect(callbacks.onPublicPayload).toHaveBeenLastCalledWith(presentation);
  expect(presentation.layers.cities.features[0]?.properties).not.toHaveProperty(
    'fortificationLevel',
  );
  session.dispose();
});

it('highlights only approved city and plot IDs and preserves that public selection while panning', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(publicResponse())
      .mockImplementation(() => new Promise(() => {})),
  );
  const { map, callbacks, session } = retrySession();
  const featureState = vi.fn<LibreMap['setFeatureState']>(() => map.asMap());
  map.asMap().setFeatureState = featureState;
  await vi.advanceTimersByTimeAsync(0);
  session.select({ layer: 'cities', id: 'cairo' });
  expect(featureState).toHaveBeenCalledWith(
    { source: 'mamluk-cities', id: 'cairo' },
    { selected: true },
  );
  expect(featureState).toHaveBeenCalledWith(
    { source: 'mamluk-territories', id: 'cairo' },
    { selected: true },
  );
  callbacks.onSelection.mockClear();
  map.bounds = { west: 30, south: 29, east: 34, north: 33 };
  map.fire('moveend');
  expect(callbacks.onSelection).not.toHaveBeenCalledWith(null);
  featureState.mockClear();
  session.select({ layer: 'cities', id: 'unapproved-city' });
  expect(
    featureState.mock.calls.some(
      ([state, value]) => state.id === 'unapproved-city' || value.selected,
    ),
  ).toBe(false);
  session.dispose();
});

it('keeps private expiry clearing operational if SDK feature-state highlighting fails', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => territoryPayload() }),
  );
  const { map, callbacks, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  map.asMap().setFeatureState = vi.fn(() => {
    throw new Error('SDK feature state unavailable');
  });
  expect(() => session.select({ layer: 'cities', id: 'cairo' })).not.toThrow();
  expect(callbacks.onSelection).toHaveBeenLastCalledWith(null);
  session.loader.dispose();
  await vi.advanceTimersByTimeAsync(8000);
  expect(map.sources.size).toBe(0);
  expect(map.layers.size).toBe(0);
  expect(callbacks.onPayload).toHaveBeenLastCalledWith(null);
  session.dispose();
});

it.each(['pan', 'zoom', 'projection'] as const)(
  'preserves explicitly public settlement source identities and coordinates through %s while authorized data remains until expiry',
  async (action) => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(publicResponse())
        .mockImplementation(() => new Promise(() => {})),
    );
    const { map, callbacks, session } = retrySession();
    await vi.advanceTimersByTimeAsync(0);
    const cities = map.sources.get('mamluk-cities');
    const territories = map.sources.get('mamluk-territories');
    if (action === 'projection') {
      session.adapter.setProjection('globe');
      void session.loader.refresh();
    } else {
      map.bounds =
        action === 'pan'
          ? { west: 30, south: 29, east: 34, north: 33 }
          : { west: 30.5, south: 29.5, east: 33.5, north: 32.5 };
      map.fire('moveend');
    }
    expect(map.sources.get('mamluk-cities')).toBe(cities);
    expect(map.sources.get('mamluk-territories')).toBe(territories);
    expect(cities?.data).toMatchObject({
      features: [{ id: 'cairo', geometry: territoryPayload().layers.cities.features[0]?.geometry }],
    });
    expect(map.sources.size).toBe(9);
    expect(callbacks.onPayload).toHaveBeenLastCalledWith(territoryPayload());
    await vi.advanceTimersByTimeAsync(150);
    expect(map.sources.get('mamluk-cities')).toBe(cities);
    session.dispose();
    expect(map.sources.size).toBe(0);
  },
);

it('does not rebuild unchanged public settlement data on polling while keeping authorized attributes until expiry', async () => {
  vi.useFakeTimers();
  const original = territoryPayload();
  const fetchMock = vi.fn(async () =>
    publicResponse({
      ...original,
      revision: String(fetchMock.mock.calls.length),
      serverTime: 2000 + 5000 * (fetchMock.mock.calls.length - 1),
      expiresAt: 10000 + 5000 * (fetchMock.mock.calls.length - 1),
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const { map, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  const cities = map.sources.get('mamluk-cities')!;
  const territories = map.sources.get('mamluk-territories')!;
  const cityUpdates = vi.spyOn(cities, 'setData');
  const territoryUpdates = vi.spyOn(territories, 'setData');
  await vi.advanceTimersByTimeAsync(5000);
  expect(map.sources.get('mamluk-cities')).toBe(cities);
  expect(cityUpdates).not.toHaveBeenCalled();
  expect(territoryUpdates).not.toHaveBeenCalled();
  expect(cities.data).toMatchObject({ features: [{ properties: { fortificationLevel: 4 } }] });
  session.dispose();
});
it('removes every cached layer if the SDK cannot update approved public settlement presentation', async () => {
  vi.useFakeTimers();
  const next = territoryPayload();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(publicResponse())
      .mockResolvedValue(
        publicResponse({
          ...next,
          revision: '2',
          layers: {
            ...next.layers,
            cities: {
              ...next.layers.cities,
              features: next.layers.cities.features.map((city) => ({
                ...city,
                properties: { ...city.properties, name: 'اسم جديد' },
              })),
            },
          },
        }),
      ),
  );
  const { map, callbacks, session } = retrySession();
  await vi.advanceTimersByTimeAsync(0);
  const source = map.sources.get('mamluk-cities')!;
  source.setData = () => {
    throw new Error('SDK source unavailable');
  };

  expect(() => {
    void session.loader.refresh();
  }).not.toThrow();
  await vi.advanceTimersByTimeAsync(0);
  expect(map.sources.size).toBe(0);
  expect(map.layers.size).toBe(0);
  expect(callbacks.onPayload).toHaveBeenLastCalledWith(null);
  session.dispose();
});

it('retains approved public geometry during movement and ignores a late classified response from the previous viewport', async () => {
  vi.useFakeTimers();
  let deliver: ((value: unknown) => void) | undefined;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(publicResponse())
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
  vi.stubGlobal('fetch', fetchMock);
  const { map, session } = retrySession();
  await vi.advanceTimersByTimeAsync(5000);
  expect(map.sources.has('mamluk-cities')).toBe(true);
  const cities = map.sources.get('mamluk-cities');
  const previous = structuredClone(cities?.data);
  const oldDelivery = deliver;
  map.bounds = { west: 30, south: 29, east: 34, north: 33 };
  map.fire('moveend');
  expect(map.sources.get('mamluk-cities')).toBe(cities);
  oldDelivery?.(publicResponse({ ...territoryPayload(), revision: '2' }));
  await vi.advanceTimersByTimeAsync(150);

  expect(map.sources.get('mamluk-cities')).toBe(cities);
  expect(cities?.data).toEqual(previous);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  session.dispose();
});

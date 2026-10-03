import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE } from '@mamluk/maplibre-adapter';
import type { MapPayload } from '@mamluk/world-map-core';
import { createMapSession } from './map-session';
import { MapSdkFixture, approvedPayload } from './map-fixture';
import { allLayersVisible, type LayerPreferences } from './layer-visibility';
import type { OwnershipPresentationOptions } from './player-ownership';

const ownership: OwnershipPresentationOptions = {
  viewerPlayerId: 'viewer',
  colors: { own: '#1a1', neutral: '#888', selected: '#fa0', halo: '#fff', players: ['#a11'] },
};

let visibility = 'visible';
let online = true;

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  visibility = 'visible';
  online = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function village(properties: object, id = 'cairo', owner: string | null = 'viewer') {
  const base = approvedPayload().layers.cities.features[0]!;
  return {
    ...base,
    id,
    properties: { ...base.properties, ownerPlayerId: owner, ...properties },
  };
}

function snapshot(options: {
  revision?: string;
  ttlMs?: number;
  serverTime?: number;
  cities?: ReturnType<typeof village>[];
  bounds?: MapPayload['bounds'];
}): MapPayload {
  const base = approvedPayload('world', options.revision ?? '1');
  const serverTime = options.serverTime ?? 2000;
  return {
    ...base,
    serverTime,
    expiresAt: serverTime + (options.ttlMs ?? 120000),
    ...(options.bounds ? { bounds: options.bounds } : {}),
    layers: {
      ...base.layers,
      cities: { type: 'FeatureCollection', features: options.cities ?? [village({})] },
    },
  };
}

const ok = (payload: MapPayload) => ({
  ok: true,
  headers: new Headers({ 'X-Mamluk-Public-Settlements': '1' }),
  json: async () => payload,
});

function open(
  options: {
    preferences?: () => LayerPreferences;
    bounds?: MapSdkFixture['bounds'];
  } = {},
) {
  vi.useFakeTimers();
  const map = new MapSdkFixture();
  if (options.bounds) map.bounds = options.bounds;
  const callbacks = {
    onPayload: vi.fn(),
    onSelection: vi.fn(),
    onStatus: vi.fn(),
    ...(options.preferences ? { layerPreferences: options.preferences } : {}),
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
  return { map, callbacks, session };
}

const cityProps = (map: MapSdkFixture) =>
  (map.sources.get('mamluk-cities')?.data as { features: { properties: object }[] }).features[0]!
    .properties as Record<string, unknown>;

it('stops polling in a hidden tab without clearing, and refreshes immediately when visible', async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok(snapshot({})));
  vi.stubGlobal('fetch', fetchMock);
  const { map, callbacks, session } = open();
  await vi.advanceTimersByTimeAsync(0);
  const cities = map.sources.get('mamluk-cities');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  callbacks.onPayload.mockClear();
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(map.sources.get('mamluk-cities')).toBe(cities);
  expect(callbacks.onPayload).not.toHaveBeenCalledWith(null);
  visibility = 'visible';
  fetchMock.mockResolvedValue(
    ok(snapshot({ revision: '2', cities: [village({ villageLevel: 7 })] })),
  );
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(callbacks.onPayload.mock.lastCall?.[0]?.revision).toBe('2');
  expect(map.sources.get('mamluk-cities')).toBe(cities);
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(map.removed).toBe(false);
  expect(MapSdkFixture.instances.filter((instance) => !instance.removed)).toContain(map);
  session.dispose();
});

it('keeps villages offline, does not hammer the network, and refreshes at once when online', async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok(snapshot({})));
  vi.stubGlobal('fetch', fetchMock);
  const { map, session } = open();
  await vi.advanceTimersByTimeAsync(0);
  const cities = map.sources.get('mamluk-cities');
  online = false;
  window.dispatchEvent(new Event('offline'));
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
  await vi.advanceTimersByTimeAsync(90000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(map.sources.get('mamluk-cities')).toBe(cities);
  expect(cityProps(map)).toMatchObject({ fortificationLevel: 4 });
  online = true;
  fetchMock.mockResolvedValue(ok(snapshot({ revision: '3' })));
  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  session.dispose();
});

it('refreshes when a snapshot expires and drops private detail while the refresh is pending', async () => {
  const pending: ((value: unknown) => void)[] = [];
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      ok(
        snapshot({
          ttlMs: 2000,
          cities: [
            village({ villageLevel: 12, villageVisualTier: 3, villageRank: 'r', villagePower: 9 }),
          ],
        }),
      ),
    )
    .mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  vi.stubGlobal('fetch', fetchMock);
  const { map, callbacks, session } = open();
  await vi.advanceTimersByTimeAsync(0);
  expect(cityProps(map)).toMatchObject({ fortificationLevel: 4, villagePower: 9 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(callbacks.onPayload).toHaveBeenLastCalledWith(null);
  const expired = cityProps(map);
  expect(expired).not.toHaveProperty('fortificationLevel');
  expect(expired).not.toHaveProperty('strategicValue');
  expect(expired).not.toHaveProperty('villagePower');
  expect(expired).not.toHaveProperty('villageRank');
  // Own presentation survives: no jump to the generic tier.
  expect(expired).toMatchObject({ villageLevel: 12, villageVisualTier: 3 });
  pending[0]!(
    ok(snapshot({ revision: '2', cities: [village({ villageLevel: 13, villageVisualTier: 3 })] })),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(cityProps(map)).toMatchObject({ villageLevel: 13, fortificationLevel: 4 });
  session.dispose();
});

it('never retains level or tier of a village the viewer does not own', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      ok(
        snapshot({
          ttlMs: 1000,
          cities: [
            village({ villageLevel: 9, villageVisualTier: 2 }, 'mine'),
            village(
              { villageLevel: 41, villageVisualTier: 6, villagePower: 5000 },
              'rival',
              'enemy',
            ),
            village({ villageLevel: 99, villageVisualTier: 99 }, 'bad', 'viewer'),
          ],
        }),
      ),
    )
    .mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  const { map, session } = open();
  await vi.advanceTimersByTimeAsync(1000);
  const features = (
    map.sources.get('mamluk-cities')!.data as { features: { id: string; properties: object }[] }
  ).features;
  const props = (id: string) => features.find((feature) => feature.id === id)!.properties;
  expect(props('mine')).toMatchObject({ villageLevel: 9, villageVisualTier: 2 });
  expect(props('rival')).not.toHaveProperty('villageLevel');
  expect(props('rival')).not.toHaveProperty('villageVisualTier');
  expect(props('rival')).not.toHaveProperty('villagePower');
  expect(props('bad')).not.toHaveProperty('villageLevel');
  expect(props('bad')).not.toHaveProperty('villageVisualTier');
  session.dispose();
});

it.each([401, 403, 404])(
  'treats HTTP %s as revoked access: clears every source and stops automatic retries',
  async (status) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(snapshot({})));
    vi.stubGlobal('fetch', fetchMock);
    const { map, callbacks, session } = open();
    await vi.advanceTimersByTimeAsync(0);
    expect(map.sources.size).toBe(9);
    fetchMock.mockResolvedValue({ ok: false, status });
    await vi.advanceTimersByTimeAsync(5000);
    expect(map.sources.size).toBe(0);
    expect(callbacks.onStatus).toHaveBeenLastCalledWith('error');
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    fetchMock.mockResolvedValue(ok(snapshot({ revision: '2' })));
    map.fire('moveend');
    await vi.advanceTimersByTimeAsync(150);
    expect(fetchMock).toHaveBeenCalledTimes(calls + 1);
    expect(map.sources.size).toBe(9);
    session.dispose();
  },
);

it.each([
  ['an invalid request (400)', { ok: false, status: 400 }],
  ['a malformed payload', { ok: true, json: async () => ({ schemaVersion: 7 }) }],
  ['a server error (500)', { ok: false, status: 500 }],
  ['a network failure', new TypeError('Failed to fetch')],
])('keeps authorized villages through %s and keeps retrying', async (_name, failure) => {
  const fetchMock = vi.fn().mockResolvedValueOnce(ok(snapshot({})));
  if (failure instanceof Error) fetchMock.mockRejectedValue(failure);
  else fetchMock.mockResolvedValue(failure);
  vi.stubGlobal('fetch', fetchMock);
  const { map, session } = open();
  await vi.advanceTimersByTimeAsync(0);
  const cities = map.sources.get('mamluk-cities');
  await vi.advanceTimersByTimeAsync(5000);
  const failed = fetchMock.mock.calls.length;
  expect(failed).toBeGreaterThanOrEqual(2);
  expect(map.sources.get('mamluk-cities')).toBe(cities);
  expect(map.sources.size).toBe(9);
  await vi.advanceTimersByTimeAsync(3000);
  expect(fetchMock.mock.calls.length).toBeGreaterThan(failed);
  session.dispose();
});

it('resumes normal polling after a long outage without recreating or clearing the map', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(ok(snapshot({ ttlMs: 600000 })));
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetchMock);
  const { map, callbacks, session } = open();
  await vi.advanceTimersByTimeAsync(0);
  const cities = map.sources.get('mamluk-cities');
  await vi.advanceTimersByTimeAsync(180000);
  expect(fetchMock.mock.calls.length).toBeGreaterThan(8);
  fetchMock.mockResolvedValue(ok(snapshot({ revision: '9', ttlMs: 600000 })));
  await vi.advanceTimersByTimeAsync(30000);
  expect(callbacks.onPayload.mock.lastCall?.[0]?.revision).toBe('9');
  const polled = fetchMock.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetchMock.mock.calls.length).toBe(polled + 2);
  expect(map.sources.get('mamluk-cities')).toBe(cities);
  expect(map.removed).toBe(false);
  expect(MapSdkFixture.instances).toContain(map);
  session.dispose();
});

it('ignores a stale response that arrives after a newer lifecycle refresh', async () => {
  const pending: ((value: unknown) => void)[] = [];
  const fetchMock = vi
    .fn()
    .mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  vi.stubGlobal('fetch', fetchMock);
  const { map, callbacks, session } = open();
  await vi.advanceTimersByTimeAsync(0);
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(pending).toHaveLength(2);
  pending[1]!(ok(snapshot({ revision: '5', cities: [village({ villageLevel: 5 })] })));
  await vi.advanceTimersByTimeAsync(0);
  pending[0]!(ok(snapshot({ revision: '4', cities: [village({ villageLevel: 4 })] })));
  await vi.advanceTimersByTimeAsync(0);
  expect(callbacks.onPayload.mock.lastCall?.[0]?.revision).toBe('5');
  expect(cityProps(map)).toMatchObject({ villageLevel: 5 });
  session.dispose();
});

it('keeps a layer the user hid hidden through refresh, expiry, recovery and overview transitions', async () => {
  let preferences: LayerPreferences = { ...allLayersVisible, cities: false };
  const urls: string[] = [];
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    urls.push(url);
    const query = new URL(url, 'http://localhost').searchParams;
    if (url.includes('/overview?'))
      return {
        ok: true,
        json: async () => ({
          worldId: 'world',
          revision: '1',
          serverTime: 1000,
          cells: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                id: 'cell:1:1',
                geometry: { type: 'Point', coordinates: [31, 30] },
                properties: { count: 2, targetVillageId: null },
              },
            ],
          },
        }),
      };
    return ok(
      snapshot({
        ttlMs: 3000,
        revision: String(urls.length),
        bounds: {
          west: Number(query.get('west')),
          south: Number(query.get('south')),
          east: Number(query.get('east')),
          north: Number(query.get('north')),
        },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  const { map, session } = open({ preferences: () => preferences });
  const hidden = () =>
    ['mamluk-cities', 'mamluk-cities-owner-markers', 'mamluk-village-clusters'].filter(
      (id) =>
        map.layers.has(id) &&
        (map.layers.get(id) as { layout?: { visibility?: string } }).layout?.visibility !== 'none',
    );
  await vi.advanceTimersByTimeAsync(0);
  expect(map.layers.has('mamluk-cities')).toBe(true);
  expect(hidden()).toEqual([]);
  // expiry (3 s TTL) and the refresh it triggers
  await vi.advanceTimersByTimeAsync(3000);
  expect(hidden()).toEqual([]);
  // failure and recovery
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await vi.advanceTimersByTimeAsync(5000);
  expect(hidden()).toEqual([]);
  // overview round trip
  map.bounds = { west: -120, east: 120, south: -50, north: 50 };
  map.fire('moveend');
  await vi.advanceTimersByTimeAsync(200);
  expect(urls.at(-1)).toContain('/overview?');
  expect(
    (map.layers.get('mamluk-overview-cells') as { layout?: { visibility?: string } }).layout
      ?.visibility,
  ).toBe('none');
  expect(hidden()).toEqual([]);
  map.bounds = { west: 28, south: 25, east: 40, north: 36 };
  map.fire('moveend');
  await vi.advanceTimersByTimeAsync(200);
  expect(urls.at(-1)).toContain('/viewport?');
  expect(map.layers.has('mamluk-overview-cells')).toBe(false);
  expect(hidden()).toEqual([]);
  // the preference remains authoritative when it changes
  preferences = allLayersVisible;
  session.applyLayerVisibility();
  expect(
    (map.layers.get('mamluk-cities') as { layout?: { visibility?: string } }).layout?.visibility,
  ).toBe('visible');
  session.dispose();
});

it('enters the overview above 90 degrees and returns only at 85 or less', async () => {
  const urls: string[] = [];
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    urls.push(url);
    const query = new URL(url, 'http://localhost').searchParams;
    if (url.includes('/overview?'))
      return {
        ok: true,
        json: async () => ({
          worldId: 'world',
          revision: '1',
          serverTime: 1000,
          cells: { type: 'FeatureCollection', features: [] },
        }),
      };
    return ok(
      snapshot({
        bounds: {
          west: Number(query.get('west')),
          south: Number(query.get('south')),
          east: Number(query.get('east')),
          north: Number(query.get('north')),
        },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  const { map, callbacks, session } = open({
    bounds: { west: 0, east: 80, south: -10, north: 10 },
  });
  await vi.advanceTimersByTimeAsync(0);
  const seen: string[] = [];
  for (const span of [88, 91, 89, 87, 86, 85, 88, 90, 84, 89.9, 91]) {
    map.bounds = { west: 0, east: span, south: -10, north: 10 };
    map.fire('moveend');
    await vi.advanceTimersByTimeAsync(200);
    seen.push(`${span}:${urls.at(-1)!.includes('/overview?') ? 'overview' : 'local'}`);
  }
  expect(seen).toEqual([
    '88:local',
    '91:overview',
    '89:overview',
    '87:overview',
    '86:overview',
    '85:local',
    '88:local',
    '90:local',
    '84:local',
    '89.9:local',
    '91:overview',
  ]);
  expect(callbacks.onStatus).toHaveBeenLastCalledWith('ready');
  expect(map.removed).toBe(false);
  session.dispose();
});

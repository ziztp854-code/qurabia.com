import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE } from '@mamluk/maplibre-adapter';
import { PUBLIC_ATLAS_VIEWER_ID, PUBLIC_ATLAS_WORLD, PublicAtlasRepository } from '@/lib/mamluk-map/public-atlas';
import { MamlukViewportService } from '@/lib/mamluk-map/viewport-service';
import { createMapSession } from './map-session';
import { MapSdkFixture } from './map-fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('loads the public atlas on the initial full globe without movement and remains local across zooms', async () => {
  vi.useFakeTimers();
  const service = new MamlukViewportService(new PublicAtlasRepository(PUBLIC_ATLAS_VIEWER_ID), {
    maxLongitudeSpan: 360, maxLatitudeSpan: 180,
  });
  const fetch = vi.fn(async (url: string) => {
    const query = new URL(url, 'https://qurabia.com').searchParams;
    const payload = await service.getViewport({ worldId: query.get('worldId')!, bounds: {
      west: Number(query.get('west')), south: Number(query.get('south')),
      east: Number(query.get('east')), north: Number(query.get('north')),
    } }, { playerId: PUBLIC_ATLAS_VIEWER_ID });
    return new Response(JSON.stringify(payload), { headers: { 'X-Mamluk-Public-Settlements': '1' } });
  });
  vi.stubGlobal('fetch', fetch);
  const map = new MapSdkFixture();
  map.bounds = { west: -180, south: -90, east: 180, north: 90 };
  const callbacks = { onPayload: vi.fn(), onSelection: vi.fn(), onStatus: vi.fn() };
  const session = createMapSession(map.asMap(), PUBLIC_ATLAS_WORLD.id, 'globe', DEFAULT_PALETTE, callbacks);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toContain('/viewport?');
  expect(callbacks.onPayload.mock.lastCall?.[0]?.layers.cities.features).toHaveLength(12);
  expect(callbacks.onStatus).toHaveBeenLastCalledWith('ready');
  expect(map.layers.get('mamluk-village-cluster-count')).toMatchObject({
    layout: { 'text-field': ['concat', ['to-string', ['get', 'point_count_abbreviated']], ' مدينة'] },
  });
  for (const bounds of [
    { west: 31.2, south: 30, east: 31.3, north: 30.1 },
    { west: -180, south: -90, east: 180, north: 90 },
    { west: 170, south: -80, east: -170, north: 80 },
    { west: -180, south: -90, east: 180, north: 90 },
  ]) {
    map.bounds = bounds;
    map.fire('moveend');
    await vi.advanceTimersByTimeAsync(150);
    expect(session.loader.isBroad()).toBe(false);
    expect(callbacks.onStatus).toHaveBeenLastCalledWith('ready');
  }
  expect(fetch.mock.calls.every(([url]) => url.includes('/viewport?'))).toBe(true);
  expect(map.sources.has('mamluk-overview')).toBe(false);
  expect(callbacks.onPayload.mock.lastCall?.[0]?.layers.cities.features).toHaveLength(12);
  session.dispose();
});

it.each(['world', `${PUBLIC_ATLAS_WORLD.id}-private`])('keeps campaign overview and limits for %s', async (worldId) => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ worldId, revision: '1', serverTime: Date.now(),
    cells: { type: 'FeatureCollection', features: [] } })));
  vi.stubGlobal('fetch', fetch);
  const map = new MapSdkFixture();
  map.bounds = { west: -180, south: -90, east: 180, north: 90 };
  const session = createMapSession(map.asMap(), worldId, 'globe', DEFAULT_PALETTE, {
    onPayload: vi.fn(), onSelection: vi.fn(), onStatus: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(session.loader.isBroad()).toBe(true);
  expect(fetch.mock.calls[0]![0]).toContain('/overview?');
  expect(map.sources.has('mamluk-cities')).toBe(false);
  session.dispose();
});

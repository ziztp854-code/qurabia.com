import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE } from '@mamluk/maplibre-adapter';
import { MapSdkFixture } from './map-fixture';
import { createWorldOverview, decodeOverview } from './world-overview';

afterEach(() => vi.unstubAllGlobals());
const bounds = { west: -180, south: -90, east: 180, north: 90 };
const payload = (revision = '1') => ({
  worldId: 'world',
  revision,
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
});

it('decodes at most 288 public cells, strips extra fields and rejects malformed identity or geometry', () => {
  const input = payload();
  Object.assign(input.cells.features[0].properties, { troops: 999, power: 999 });
  expect(decodeOverview(input, 'world').cells.features[0].properties).toEqual({
    count: 42,
    targetVillageId: null,
  });
  expect(() => decodeOverview(input, 'other')).toThrow();
  expect(() =>
    decodeOverview(
      { ...input, cells: { ...input.cells, features: Array(289).fill(input.cells.features[0]) } },
      'world',
    ),
  ).toThrow();
  expect(() =>
    decodeOverview(
      {
        ...input,
        cells: {
          ...input.cells,
          features: [
            { ...input.cells.features[0], geometry: { type: 'Point', coordinates: [999, 0] } },
          ],
        },
      },
      'world',
    ),
  ).toThrow();
});

it('keeps bounded overview sources stable and zooms clusters on the same canvas', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload() }));
  const map = new MapSdkFixture();
  const overview = createWorldOverview(map.asMap(), 'world', DEFAULT_PALETTE);
  await overview.load(bounds, new AbortController().signal);
  const source = map.sources.get('mamluk-overview')!;
  expect(source).toMatchObject({
    promoteId: '__mamlukFeatureId',
    data: { features: [{ id: 'cell:14:8', properties: { __mamlukFeatureId: 'cell:14:8' } }] },
  });
  const updates = vi.spyOn(source, 'setData');
  await overview.load(bounds, new AbortController().signal);
  expect(map.sources.get('mamluk-overview')).toBe(source);
  expect(updates).not.toHaveBeenCalled();
  map.clicked = [{ id: 'cell:14:8', source: 'mamluk-overview' }];
  expect(overview.click({ point: { x: 1, y: 1 } } as never)).toBe(true);
  expect(map.lastCamera).toMatchObject({ center: [31, 30], zoom: 5 });
  overview.dispose();
  expect(map.sources.size).toBe(0);
});

it('discards an older late response and clears overview on authorization failure', async () => {
  let deliver!: (value: unknown) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    )
    .mockResolvedValueOnce({ ok: true, json: async () => payload('2') })
    .mockResolvedValueOnce({ ok: false, status: 401 });
  vi.stubGlobal('fetch', fetch);
  const map = new MapSdkFixture();
  const overview = createWorldOverview(map.asMap(), 'world', DEFAULT_PALETTE);
  const first = overview.load(bounds, new AbortController().signal);
  await overview.load(bounds, new AbortController().signal);
  const accepted = map.sources.get('mamluk-overview')!.data;
  deliver({
    ok: true,
    json: async () => ({ ...payload('3'), cells: { type: 'FeatureCollection', features: [] } }),
  });
  await first;
  expect(map.sources.get('mamluk-overview')!.data).toEqual(accepted);
  await expect(overview.load(bounds, new AbortController().signal)).rejects.toThrow();
  expect(map.sources.size).toBe(0);
  overview.dispose();
});

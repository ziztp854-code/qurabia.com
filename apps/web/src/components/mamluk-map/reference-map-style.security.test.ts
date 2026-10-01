import { describe, expect, it } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import { buildReferenceMapStyle } from './reference-map-style';
import { REFERENCE_IMAGE_CORNERS } from './image-map-calibration';

function baseStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Geographic fallback',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
    sources: {
      geographic: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: 'OpenFreeMap © OpenStreetMap contributors',
      },
      'mamluk-cities': {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'approved-village',
              geometry: { type: 'Point', coordinates: [31.2357, 30.0444] },
              properties: {
                name: 'القاهرة',
                ownerPlayerId: 'viewer',
                __mamlukFeatureId: 'approved-village',
              },
            },
          ],
        },
        promoteId: '__mamlukFeatureId',
      },
      'mamluk-armies': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      'mamluk-visibility': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': '#ece7c9' } },
      { id: 'coastline', type: 'line', source: 'geographic', 'source-layer': 'water' },
      { id: 'mamluk-cities', type: 'circle', source: 'mamluk-cities' },
      { id: 'mamluk-armies', type: 'circle', source: 'mamluk-armies' },
    ],
  };
}

describe('reference-image basemap boundary', () => {
  it('adds only the calibrated static local image while preserving provider and game data', () => {
    const base = baseStyle();
    const before = structuredClone(base);
    const style = buildReferenceMapStyle(base);

    expect(style).not.toBe(base);
    expect(base).toEqual(before);
    expect(Object.keys(style.sources).sort()).toEqual(
      [...Object.keys(before.sources), 'mamluk-reference-basemap'].sort(),
    );
    expect(style.sources['mamluk-reference-basemap']).toEqual({
      type: 'image',
      url: '/game-art/mamluk-map/reference-basemap.webp',
      coordinates: REFERENCE_IMAGE_CORNERS,
    });
    for (const [id, source] of Object.entries(before.sources))
      expect(style.sources[id]).toEqual(source);
    expect(style.layers.slice(0, before.layers.length)).toEqual(before.layers);
    expect(style.layers).toHaveLength(before.layers.length + 1);
    expect(style.layers.at(-1)).toMatchObject({
      id: 'mamluk-reference-basemap',
      source: 'mamluk-reference-basemap',
      type: 'raster',
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 },
    });
    expect(style.glyphs).toBe(before.glyphs);
    expect(style.sprite).toBe(before.sprite);
    expect(style.name).toBe(before.name);
  });

  it('uses four distinct clockwise finite WGS84 corners without reinterpreting game coordinates', () => {
    const base = baseStyle();
    const before = structuredClone(base.sources['mamluk-cities']);
    const style = buildReferenceMapStyle(base);
    const source = style.sources['mamluk-reference-basemap'];
    expect(source?.type).toBe('image');
    if (source?.type !== 'image') throw new Error('Missing reference image');
    const points = source.coordinates;

    expect(points).toHaveLength(4);
    expect(new Set(points.map((point) => point.join(','))).size).toBe(4);
    for (const point of points) {
      expect(point).toHaveLength(2);
      expect(point.every(Number.isFinite)).toBe(true);
      expect(point[0]).toBeGreaterThanOrEqual(-180);
      expect(point[0]).toBeLessThanOrEqual(180);
      expect(point[1]).toBeGreaterThanOrEqual(-90);
      expect(point[1]).toBeLessThanOrEqual(90);
    }
    const twiceArea = points.reduce((sum, [longitude, latitude], index) => {
      const next = points[(index + 1) % points.length]!;
      return sum + longitude * next[1] - next[0] * latitude;
    }, 0);
    expect(twiceArea).toBeLessThan(0);
    expect(style.sources['mamluk-cities']).toEqual(before);
  });

  it('accepts frozen provider inputs and does not replace the geographic fallback or approved game layers', () => {
    const base = baseStyle();
    Object.freeze(base.layers);
    Object.freeze(base.sources);
    Object.freeze(base);

    const style = buildReferenceMapStyle(base);
    expect(style.sources.geographic).toEqual(base.sources.geographic);
    expect(style.layers.slice(0, -1)).toEqual(base.layers);
    expect(style.sources['mamluk-armies']).toEqual({
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    expect(style.sources['mamluk-visibility']).toEqual({
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  });

  it.each([
    null,
    { version: 7, sources: {}, layers: [] },
    { version: 8, sources: null, layers: [] },
    { version: 8, sources: [], layers: [] },
    { version: 8, layers: [] },
    { version: 8, sources: {}, layers: null },
    { version: 8, sources: {} },
    { version: 8, sources: {}, layers: [null] },
  ])('rejects an invalid provider style without manufacturing a game world: %j', (base) => {
    expect(() => buildReferenceMapStyle(base as unknown as StyleSpecification)).toThrow();
  });

  it('rejects a reserved source collision without overwriting its original geographic data', () => {
    const base = baseStyle();
    base.sources['mamluk-reference-basemap'] = {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    };
    const before = structuredClone(base);

    expect(() => buildReferenceMapStyle(base)).toThrow();
    expect(base).toEqual(before);
  });

  it('rejects a reserved layer collision instead of replacing an existing layer', () => {
    const base = baseStyle();
    base.layers.push({ id: 'mamluk-reference-basemap', type: 'circle', source: 'mamluk-cities' });
    const before = structuredClone(base);

    expect(() => buildReferenceMapStyle(base)).toThrow();
    expect(base).toEqual(before);
  });
});

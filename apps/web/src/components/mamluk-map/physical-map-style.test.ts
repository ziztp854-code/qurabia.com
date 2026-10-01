import { describe, expect, it } from 'vitest';
import type { FilterSpecification, StyleSpecification } from 'maplibre-gl';
import { buildPhysicalMapStyle, type PhysicalMapColors } from './physical-map-style';

const colors: PhysicalMapColors = {
  ocean: '#3399c8',
  land: '#dfd2a4',
  forest: '#66865e',
  border: '#95724c',
  label: '#4d4738',
};
const base: StyleSpecification = {
  version: 8,
  name: 'OpenFreeMap Liberty',
  metadata: { attribution: 'OSM Liberty / OpenMapTiles / OpenStreetMap' },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://tiles.openfreemap.org/sprites/ofm/sprite',
  sources: {
    ne2_shaded: {
      type: 'raster',
      maxzoom: 6,
      tileSize: 256,
      tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],
    },
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: 'OpenFreeMap / OpenMapTiles / OpenStreetMap',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#eee' } },
    {
      id: 'natural_earth',
      type: 'raster',
      source: 'ne2_shaded',
      maxzoom: 7,
      paint: { 'raster-opacity': 0.1 },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': '#aaa' },
    },
  ],
};

describe('geographically anchored physical basemap', () => {
  it('retains real shaded terrain at strategic zoom and preserves provider sources and attribution', () => {
    const original = structuredClone(base);
    const style = buildPhysicalMapStyle(base, colors);
    const relief = style.layers.find((layer) => layer.id === 'natural_earth')!;
    expect(relief.maxzoom).toBe(24);
    expect(relief.type === 'raster' && relief.paint!['raster-opacity']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      7,
      0.96,
      10,
      0,
    ]);
    const water = style.layers.find((layer) => layer.id === 'water')!;
    expect(water.type === 'fill' && water.paint!['fill-color']).toBe('#3399c8');
    expect(style.sources).toEqual(base.sources);
    expect(style.glyphs).toBe(base.glyphs);
    expect(style.sprite).toBe(base.sprite);
    expect(style.metadata).toEqual(base.metadata);
    expect(base).toEqual(original);
    expect(style).not.toBe(base);
  });

  it('removes modern landmarks and limits roads and settlement labels to detailed zoom', () => {
    const style = buildPhysicalMapStyle(
      {
        ...base,
        layers: [
          ...base.layers,
          { id: 'hospital', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse' },
          {
            id: 'buildings',
            type: 'fill-extrusion',
            source: 'openmaptiles',
            'source-layer': 'building',
          },
          {
            id: 'airport',
            type: 'symbol',
            source: 'openmaptiles',
            'source-layer': 'aerodrome_label',
          },
          { id: 'shop', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi' },
          { id: 'runway', type: 'line', source: 'openmaptiles', 'source-layer': 'aeroway' },
          { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park' },
          {
            id: 'road',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            minzoom: 4,
          },
          {
            id: 'town-name',
            type: 'symbol',
            source: 'openmaptiles',
            'source-layer': 'place',
            layout: { 'text-field': ['get', 'name'] },
          },
        ],
      },
      colors,
    );
    for (const id of ['hospital', 'buildings', 'airport', 'shop', 'runway', 'park'])
      expect(style.layers.map((layer) => layer.id)).not.toContain(id);
    expect(style.layers.find((layer) => layer.id === 'road')!.minzoom).toBe(10);
    const label = style.layers.find((layer) => layer.id === 'town-name')!;
    expect(label.minzoom).toBe(10);
    expect(label.type === 'symbol' && label.layout!['text-field']).toEqual(['get', 'name']);
    expect(label.type === 'symbol' && label.paint!['text-color']).toBe('#4d4738');
  });

  it('keeps forest and sand geographic masks translucent over relief and softens country borders', () => {
    const forestFilter: FilterSpecification = ['==', ['get', 'class'], 'wood'];
    const style = buildPhysicalMapStyle(
      {
        ...base,
        layers: [
          ...base.layers,
          {
            id: 'landcover_wood',
            type: 'fill',
            source: 'openmaptiles',
            'source-layer': 'landcover',
            filter: structuredClone(forestFilter),
          },
          {
            id: 'landcover_sand',
            type: 'fill',
            source: 'openmaptiles',
            'source-layer': 'landcover',
          },
          { id: 'river', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway' },
          {
            id: 'country-boundary',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'boundary',
          },
        ],
      },
      colors,
    );
    const forest = style.layers.find((layer) => layer.id === 'landcover_wood')!;
    expect(forest.type === 'fill' && forest.paint!['fill-color']).toBe('#66865e');
    expect(forest.type === 'fill' && forest.paint!['fill-opacity']).toBeLessThan(0.4);
    expect('filter' in forest && forest.filter).toEqual(forestFilter);
    const sand = style.layers.find((layer) => layer.id === 'landcover_sand')!;
    expect(sand.type === 'fill' && sand.paint!['fill-color']).toBe('#dfd2a4');
    expect(sand.type === 'fill' && sand.paint!['fill-opacity']).toBeLessThan(0.4);
    const river = style.layers.find((layer) => layer.id === 'river')!;
    expect(river.type === 'line' && river.paint!['line-color']).toBe('#3399c8');
    const boundary = style.layers.find((layer) => layer.id === 'country-boundary')!;
    expect(boundary.type === 'line' && boundary.paint!['line-color']).toBe('#95724c');
    expect(boundary.type === 'line' && boundary.paint!['line-opacity']).toBeLessThan(0.4);
    expect(boundary.minzoom).toBeGreaterThanOrEqual(8);
  });

  it.each([
    null,
    {},
    { ...base, version: 7 },
    { ...base, sources: null },
    { ...base, sources: [] },
    { ...base, layers: null },
    { ...base, layers: [null] },
  ])('rejects malformed provider style at the host boundary', (input) => {
    expect(() => buildPhysicalMapStyle(input as StyleSpecification, colors)).toThrow(
      'Invalid physical map style',
    );
  });

  it('avoids invalid zoom intervals while retaining providers existing high-detail restrictions', () => {
    const style = buildPhysicalMapStyle(
      {
        ...base,
        layers: [
          {
            id: 'obsolete-overview-road',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            maxzoom: 9,
          },
          {
            id: 'detailed-road',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            minzoom: 14,
            maxzoom: 24,
          },
          {
            id: 'road-sign',
            type: 'symbol',
            source: 'openmaptiles',
            'source-layer': 'transportation_name',
            minzoom: 12,
          },
          { id: 'provider-raster', type: 'raster', source: 'ne2_shaded', minzoom: 0 },
          {
            id: 'provider-point',
            type: 'circle',
            source: 'openmaptiles',
            'source-layer': 'custom-geography',
          },
        ],
      },
      colors,
    );
    expect(style.layers.map((layer) => layer.id)).not.toContain('obsolete-overview-road');
    expect(style.layers.find((layer) => layer.id === 'detailed-road')!.minzoom).toBe(14);
    expect(style.layers.find((layer) => layer.id === 'road-sign')!.minzoom).toBe(12);
    expect(style.layers.find((layer) => layer.id === 'provider-point')!.type).toBe('circle');
  });

  it('does not alias mutable output records to the original provider style', () => {
    const style = buildPhysicalMapStyle(base, Object.freeze({ ...colors }));
    const raster = style.sources.ne2_shaded;
    if (raster.type !== 'raster') throw new Error('Expected raster source');
    raster.tiles![0] = 'https://other-provider.test/{z}/{x}/{y}.png';
    const original = base.sources.ne2_shaded;
    expect(original.type === 'raster' && original.tiles![0]).toBe(
      'https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png',
    );
  });
});

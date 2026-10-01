import { describe, expect, it } from 'vitest';
import type { LayerSpecification } from 'maplibre-gl';
import { approvedPayload } from './map-fixture';
import {
  getPlayerColor,
  playerBorderLayers,
  playerOwnershipLayer,
  playerSettlementLayers,
  withPlayerOwnership,
  type OwnershipPresentationOptions,
} from './player-ownership';

const options: OwnershipPresentationOptions = {
  viewerPlayerId: 'viewer',
  colors: {
    own: 'gold',
    neutral: 'stone',
    selected: 'ivory',
    halo: 'ink',
    players: ['forest', 'azure', 'crimson', 'violet', 'teal', 'copper'],
  },
};

describe('approved player ownership presentation', () => {
  it('keeps player colors stable across viewport reorderings while distinguishing own and neutral plots', () => {
    const initial = ['player-a', 'player-b', 'player-c'].map((id) => getPlayerColor(id, options));
    expect(getPlayerColor('viewer', options)).toBe('gold');
    expect(getPlayerColor(null, options)).toBe('stone');
    expect(getPlayerColor('', options)).toBe('stone');
    expect(initial.every((color) => options.colors.players.includes(color))).toBe(true);
    expect(
      initial.map((_, index) =>
        getPlayerColor(`player-${String.fromCharCode(97 + index)}`, options),
      ),
    ).toEqual(initial);
    expect(['player-c', 'player-a', 'player-b'].map((id) => getPlayerColor(id, options))).toEqual([
      initial[2],
      initial[0],
      initial[1],
    ]);
  });

  it('adds only presentation ownership to approved features without changing village geography or authoritative data', () => {
    const cities = approvedPayload().layers.cities;
    const before = structuredClone(cities);
    const result = withPlayerOwnership(cities, options);
    expect(result).toMatchObject({
      features: [
        {
          id: 'cairo',
          geometry: { type: 'Point', coordinates: [31.2357, 30.0444] },
          properties: { ownerPlayerId: 'viewer', __mamlukOwnerColor: 'gold', __mamlukOwn: true },
        },
      ],
    });
    expect(cities).toEqual(before);
    const unknown = {
      type: 'FeatureCollection' as const,
      features: [{ type: 'Feature' as const, id: 'hidden', geometry: null, properties: {} }],
    };
    expect(withPlayerOwnership(unknown, options)).toEqual(unknown);
    expect(withPlayerOwnership('/map.geojson', options)).toBe('/map.geojson');
  });

  it('styles approved territory and settlement sources by owner and selection with shared geographic boundary layers', () => {
    const territory: LayerSpecification = {
      id: 'mamluk-territories',
      source: 'mamluk-territories',
      type: 'fill',
      paint: { 'fill-color': 'old', 'fill-opacity': 0.18 },
    };
    const styled = playerOwnershipLayer(territory, options);
    expect(styled).toMatchObject({ id: territory.id, source: territory.source, type: 'fill' });
    expect(JSON.stringify(styled)).toContain('__mamlukOwnerColor');
    expect(JSON.stringify(styled)).toContain('feature-state');
    expect(territory.paint?.['fill-color']).toBe('old');
    const borders = playerBorderLayers(options);
    expect(borders.map(({ id }) => id)).toEqual([
      'mamluk-village-border-halo',
      'mamluk-village-borders',
    ]);
    expect(
      borders.every((layer) => 'source' in layer && layer.source === 'mamluk-territories'),
    ).toBe(true);
    expect(JSON.stringify(borders)).toContain('__mamlukOwnerColor');
    expect(JSON.stringify(borders)).toContain('__mamlukOwn');
    expect(playerSettlementLayers('mamluk-cities', options)).toMatchObject([
      {
        id: 'mamluk-cities-owner-markers',
        source: 'mamluk-cities',
        type: 'circle',
        paint: { 'circle-pitch-alignment': 'map' },
      },
    ]);
    expect(playerSettlementLayers('mamluk-armies', options)).toEqual([]);
    for (const layer of [
      { ...territory, source: 'mamluk-armies' },
      { ...territory, id: 'mamluk-fog', source: 'mamluk-fog' },
    ])
      expect(playerOwnershipLayer(layer, options)).toBe(layer);
  });

  it('keeps ownership styling available for both artwork symbols and fallback circles without touching unrelated geometry', () => {
    const circle: LayerSpecification = {
      id: 'mamluk-cities',
      source: 'mamluk-cities',
      type: 'circle',
      paint: { 'circle-radius': 5 },
    };
    const styledCircle = playerOwnershipLayer(circle, options);
    expect(styledCircle).toMatchObject({
      paint: { 'circle-radius': 5, 'circle-pitch-alignment': 'map' },
    });
    expect(JSON.stringify(styledCircle)).toContain('__mamlukOwnerColor');
    const symbol: LayerSpecification = {
      id: 'mamluk-castles',
      source: 'mamluk-castles',
      type: 'symbol',
      layout: { 'icon-image': 'castle', 'icon-anchor': 'bottom' },
      paint: { 'text-color': '#403c2f', 'text-halo-color': '#ecdfbd' },
    };
    expect(playerOwnershipLayer(symbol, options)).toMatchObject({ layout: symbol.layout });
    expect(playerOwnershipLayer(symbol, options)).toBe(symbol);
    const line: LayerSpecification = { id: 'mamluk-cities', source: 'mamluk-cities', type: 'line' };
    const background: LayerSpecification = { id: 'background', type: 'background' };
    expect(playerOwnershipLayer(line, options)).toBe(line);
    expect(playerOwnershipLayer(background, options)).toBe(background);
    const point = { type: 'Point' as const, coordinates: [31, 30] };
    expect(withPlayerOwnership(point, options)).toBe(point);
    expect(
      getPlayerColor('player-a', { ...options, colors: { ...options.colors, players: [] } }),
    ).toBe('stone');
    expect(
      withPlayerOwnership(withPlayerOwnership(approvedPayload().layers.cities, options), options),
    ).toEqual(withPlayerOwnership(approvedPayload().layers.cities, options));
  });
});

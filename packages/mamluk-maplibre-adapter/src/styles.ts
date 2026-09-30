import type { LayerSpecification } from 'maplibre-gl' with { 'resolution-mode': 'import' };
import type { MapLayers } from '@mamluk/world-map-core';

export const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const LAYER_NAMES: readonly (keyof MapLayers)[] = [
  'territories',
  'visibility',
  'sultanateBorders',
  'armyRoutes',
  'cities',
  'castles',
  'armies',
  'sieges',
  'fog',
];

export interface MapPalette {
  readonly territory: string;
  readonly border: string;
  readonly city: string;
  readonly castle: string;
  readonly army: string;
  readonly route: string;
  readonly siege: string;
  readonly visible: string;
  readonly fog: string;
}

export const DEFAULT_PALETTE: MapPalette = {
  territory: '#99764d',
  border: '#503526',
  city: '#dec18b',
  castle: '#80654d',
  army: '#317d89',
  route: '#317d89',
  siege: '#ad483d',
  visible: '#b7c6a0',
  fog: '#161d23',
};

export function mapLayer(name: keyof MapLayers, palette: MapPalette): LayerSpecification {
  const base = { id: `mamluk-${name}`, source: `mamluk-${name}` };
  if (name === 'territories' || name === 'visibility' || name === 'fog') {
    const color =
      name === 'territories' ? palette.territory : name === 'fog' ? palette.fog : palette.visible;
    return {
      ...base,
      type: 'fill',
      paint: {
        'fill-color': color,
        'fill-opacity': name === 'fog' ? 0.92 : name === 'visibility' ? 0.08 : 0.18,
      },
    };
  }
  if (name === 'armyRoutes' || name === 'sultanateBorders') {
    return {
      ...base,
      type: 'line',
      paint: {
        'line-color': name === 'armyRoutes' ? palette.route : palette.border,
        'line-width': name === 'armyRoutes' ? 2 : 3,
      },
    };
  }
  const colors = {
    cities: palette.city,
    castles: palette.castle,
    armies: palette.army,
    sieges: palette.siege,
  };
  return {
    ...base,
    type: 'circle',
    paint: {
      'circle-color': colors[name],
      'circle-radius': name === 'sieges' ? 9 : name === 'castles' ? 7 : 5,
      'circle-stroke-color': palette.border,
      'circle-stroke-width': 1.5,
    },
  };
}

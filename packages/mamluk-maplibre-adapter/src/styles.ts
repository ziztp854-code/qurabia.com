import type {
  LayerSpecification,
  SymbolLayerSpecification,
  FilterSpecification,
} from 'maplibre-gl' with {
  'resolution-mode': 'import',
};
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
        'fill-color':
          name === 'territories' ? ['coalesce', ['get', '__mamlukOwnerColor'], color] : color,
        'fill-opacity':
          name === 'fog'
            ? ['interpolate', ['linear'], ['zoom'], 0, 0.08, 4, 0.14, 10, 0.25]
            : name === 'visibility'
              ? 0.08
              : 0.12,
      },
    };
  }
  if (name === 'armyRoutes' || name === 'sultanateBorders') {
    return {
      ...base,
      type: 'line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color':
          name === 'armyRoutes'
            ? ['coalesce', ['get', '__mamlukMissionColor'], palette.route]
            : ['coalesce', ['get', '__mamlukOwnerColor'], palette.border],
        'line-width':
          name === 'armyRoutes'
            ? 2.25
            : ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
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
      'circle-color':
        name === 'armies'
          ? ['coalesce', ['get', '__mamlukMissionColor'], colors[name]]
          : colors[name],
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        name === 'cities' ? 5 : 7,
        9,
        name === 'cities' ? 11 : 9,
        13,
        name === 'cities' ? 13 : 11,
      ],
      'circle-stroke-color': palette.border,
      'circle-stroke-width': 1.5,
    },
  };
}

/** Numbers match the accessible city directory without requiring an Arabic glyph plugin. */
export function cityNumberLayer(palette: MapPalette): LayerSpecification {
  return {
    id: 'mamluk-city-numbers',
    source: 'mamluk-cities',
    type: 'symbol',
    minzoom: 7,
    layout: {
      'text-field': ['to-string', ['coalesce', ['get', '__mamlukFeatureNumber'], '']],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
    },
    paint: { 'text-color': palette.border, 'text-halo-color': palette.city, 'text-halo-width': 1 },
  };
}

/** Zoom only changes presentation; importance uses already-authorized metadata. */
const cityDetailFilter: FilterSpecification = [
  'all',
  ['!', ['has', 'point_count']],
  [
    'any',
    ['>=', ['zoom'], 7],
    ['>=', ['coalesce', ['get', 'villageLevel'], 0], 31],
    ['all', ['!', ['has', 'villageLevel']], ['>=', ['coalesce', ['get', 'strategicValue'], 0], 50]],
  ],
];
/** Overlay detail is independent of game rules; metadata is server-issued. */
export function overlayLayers(
  palette: MapPalette,
  symbols = false,
  arabic = false,
  armyDetails = false,
): LayerSpecification[] {
  const layers = LAYER_NAMES.map((name) => mapLayer(name, palette));
  if (!symbols)
    return armyDetails
      ? [
          ...layers.filter((layer) => layer.id !== 'mamluk-fog'),
          ...armyDetailLayers(palette),
          mapLayer('fog', palette),
        ]
      : layers;
  return [
    ...layers.filter(
      (layer) =>
        !['mamluk-cities', 'mamluk-castles', 'mamluk-armies', 'mamluk-fog'].includes(layer.id),
    ),
    {
      id: 'mamluk-city-selection',
      source: 'mamluk-cities',
      type: 'circle',
      minzoom: 4,
      filter: cityDetailFilter,
      paint: {
        'circle-radius': 23,
        'circle-color': palette.city,
        'circle-opacity': 0,
        'circle-stroke-color': palette.city,
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 0],
      },
    },
    {
      id: 'mamluk-clusters',
      source: 'mamluk-cities',
      type: 'circle',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': palette.fog,
        'circle-radius': ['step', ['get', 'point_count'], 17, 100, 23, 1000, 29],
        'circle-stroke-color': palette.city,
        'circle-stroke-width': 1.5,
      },
    },
    {
      id: 'mamluk-cluster-count',
      source: 'mamluk-cities',
      type: 'symbol',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': [
          'concat',
          ['to-string', ['get', 'point_count_abbreviated']],
          arabic
            ? [
                'case',
                ['==', ['get', '__mamlukVillageCount'], ['get', 'point_count']],
                ' قرية',
                ' موقع',
              ]
            : '',
        ],
        'text-font': [arabic ? 'Cairo' : 'Noto Sans Regular'],
        'text-size': 12,
        'text-allow-overlap': false,
      },
      paint: { 'text-color': palette.city },
    },
    {
      id: 'mamluk-capital-selection',
      source: 'mamluk-capitals',
      type: 'circle',
      paint: {
        'circle-radius': 24,
        'circle-color': palette.city,
        'circle-opacity': 0,
        'circle-stroke-color': palette.city,
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 0],
      },
    },
    markerLayer('cities', palette, arabic),
    markerLayer('castles', palette, arabic),
    markerLayer('armies', palette, arabic),
    {
      ...markerLayer('cities', palette, arabic),
      id: 'mamluk-capitals',
      source: 'mamluk-capitals',
      minzoom: 0,
    },
    {
      id: 'mamluk-route-arrows',
      source: 'mamluk-armyRoutes',
      type: 'symbol',
      minzoom: 6,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 100,
        'icon-image': 'mamluk-route-arrow',
        'icon-size': 0.4,
        'icon-allow-overlap': false,
        'icon-rotation-alignment': 'map',
      },
    },
    {
      id: 'mamluk-trade-routes',
      source: 'mamluk-trade-routes',
      type: 'line',
      minzoom: 7,
      paint: {
        'line-color': palette.city,
        'line-width': 1,
        'line-dasharray': [2, 4],
        'line-opacity': 0.6,
      },
    },
    ...(armyDetails ? armyDetailLayers(palette) : []),
    mapLayer('fog', palette),
  ];
}

function markerLayer(
  name: 'cities' | 'castles' | 'armies',
  palette: MapPalette,
  arabic: boolean,
): SymbolLayerSpecification {
  return {
    id: 'mamluk-' + name,
    source: 'mamluk-' + name,
    type: 'symbol',
    minzoom: name === 'armies' ? 8 : name === 'cities' ? 4 : 5,
    filter: name === 'cities' ? cityDetailFilter : ['!', ['has', 'point_count']],
    layout: {
      'icon-image':
        name === 'cities'
          ? [
              'case',
              ['==', ['get', 'villageLevel'], 50],
              'mamluk-capital',
              [
                'match',
                ['get', 'villageVisualTier'],
                1,
                'mamluk-tier-1',
                2,
                'mamluk-tier-2',
                3,
                'mamluk-tier-3',
                4,
                'mamluk-tier-4',
                5,
                'mamluk-tier-5',
                6,
                'mamluk-tier-6',
                'mamluk-tier-5',
              ],
            ]
          : name === 'castles'
            ? 'mamluk-castle'
            : ['case', ['==', ['get', 'own'], true], 'mamluk-own-army', 'mamluk-army'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.52, 8, 0.68, 12, 0.9, 16, 1],
      'icon-allow-overlap': false,
      'icon-ignore-placement': false,
      'icon-padding': 4,
      'symbol-sort-key': ['-', 50, ['coalesce', ['get', 'villageLevel'], 0]],
      'text-field': arabic
        ? [
            'step',
            ['zoom'],
            [
              'case',
              ['>', ['coalesce', ['get', 'villageLevel'], 0], 0],
              ['to-string', ['get', 'villageLevel']],
              '',
            ],
            12,
            [
              'concat',
              ['coalesce', ['get', 'name'], ''],
              [
                'case',
                ['>', ['coalesce', ['get', 'villageLevel'], 0], 0],
                ['concat', ' · مستوى ', ['to-string', ['get', 'villageLevel']]],
                '',
              ],
            ],
          ]
        : ['to-string', ['coalesce', ['get', '__mamlukFeatureNumber'], '']],
      'text-font': [arabic ? 'Cairo' : 'Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 12, 14],
      'text-anchor': 'top',
      'text-offset': [0, 1.7],
      'text-max-width': 10,
      'text-padding': 3,
      'text-optional': true,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
    },
    paint: { 'text-color': palette.city, 'text-halo-color': palette.fog, 'text-halo-width': 1.5 },
  };
}

/** Details share the army source, camera, authorization and expiry lifecycle. */
function armyDetailLayers(palette: MapPalette): LayerSpecification[] {
  const base = {
    source: 'mamluk-armies',
    type: 'symbol' as const,
    filter: ['==', ['get', '__mamlukTraveling'], true] as FilterSpecification,
    minzoom: 4,
  };
  return [
    {
      ...base,
      id: 'mamluk-army-missions',
      layout: {
        'text-field': ['get', '__mamlukMissionSymbol'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 15,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': palette.fog },
    },
    {
      ...base,
      id: 'mamluk-army-direction',
      layout: {
        'text-field': '▲',
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
        'text-offset': [0, -1.7],
        'text-rotate': ['get', '__mamlukBearing'],
        'text-rotation-alignment': 'map',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': ['coalesce', ['get', '__mamlukMissionColor'], palette.army],
        'text-halo-color': palette.fog,
        'text-halo-width': 1,
      },
    },
    {
      ...base,
      id: 'mamluk-army-timers',
      source: 'mamluk-army-timer-labels',
      minzoom: 6,
      layout: {
        'text-field': ['get', '__mamlukEta'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': 2,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: { 'text-color': palette.city, 'text-halo-color': palette.fog, 'text-halo-width': 2 },
    },
  ];
}

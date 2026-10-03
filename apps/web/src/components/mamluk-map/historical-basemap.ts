import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';

/** External geography only; game ownership always comes from the viewport API. */
export const MAP_ASSETS = {
  geography: 'https://tiles.openfreemap.org/planet',
  relief: 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
  naturalEarth: 'https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png',
  arabicFont: '/maplibre/cairo-arabic-wght-normal.woff2',
  latinFont: '/maplibre/cairo-latin-wght-normal.woff2',
} as const;

const colorNames = [
  'water',
  'coast',
  'land',
  'sand',
  'forest',
  'ice',
  'ink',
  'gold',
  'relief',
] as const;
export type MapColors = Readonly<Record<(typeof colorNames)[number], string>>;

export function readMapColors(element: HTMLElement): MapColors {
  const tokens = getComputedStyle(element);
  return Object.fromEntries(
    colorNames.map((name) => [
      name,
      tokens.getPropertyValue(`--map-${name}`).trim() || 'transparent',
    ]),
  ) as MapColors;
}

const arabicName: ExpressionSpecification = [
  'coalesce',
  ['get', 'name:ar'],
  ['get', 'name'],
  ['get', 'name:en'],
  '',
];

function labels(
  id: string,
  sourceLayer: string,
  classes: string[],
  minzoom: number,
  maxzoom: number,
  size: number,
  colors: MapColors,
): LayerSpecification {
  return {
    id,
    type: 'symbol',
    source: 'geography',
    'source-layer': sourceLayer,
    minzoom,
    maxzoom,
    ...(classes.length
      ? { filter: ['match', ['get', 'class'], classes, true, false] as ExpressionSpecification }
      : {}),
    layout: {
      'text-field': arabicName,
      'text-font': ['Cairo'],
      'text-size': size,
      'text-max-width': 9,
      'text-padding': 12,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 10],
    },
    paint: { 'text-color': colors.ink, 'text-halo-color': colors.land, 'text-halo-width': 1.4 },
  };
}

/** Small local style, open vector tiles, relief beneath every tactical overlay. */
export function createHistoricalBasemap(c: MapColors): StyleSpecification {
  return {
    version: 8,
    name: 'أطلس المماليك',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    'font-faces': {
      Cairo: [
        {
          url: MAP_ASSETS.arabicFont,
          'unicode-range': [
            'U+600-6FF',
            'U+750-77F',
            'U+8A0-8FF',
            'U+200C-200E',
            'U+FB50-FDFF',
            'U+FE70-FEFF',
          ],
        },
        { url: MAP_ASSETS.latinFont },
      ],
    },
    sources: {
      geography: {
        type: 'vector',
        url: MAP_ASSETS.geography,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openfreemap.org">OpenFreeMap</a>',
      },
      naturalEarth: {
        type: 'raster',
        tiles: [MAP_ASSETS.naturalEarth],
        tileSize: 256,
        maxzoom: 6,
        attribution: 'Natural Earth',
      },
      relief: {
        type: 'raster-dem',
        tiles: [MAP_ASSETS.relief],
        tileSize: 256,
        maxzoom: 12,
        encoding: 'terrarium',
        attribution:
          '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen terrain sources</a>',
      },
    },
    layers: [
      { id: 'atlas-land', type: 'background', paint: { 'background-color': c.land } },
      {
        id: 'atlas-global-relief',
        type: 'raster',
        source: 'naturalEarth',
        maxzoom: 7,
        paint: { 'raster-opacity': 0.32, 'raster-saturation': -0.7, 'raster-fade-duration': 0 },
      },
      {
        id: 'atlas-landcover',
        type: 'fill',
        source: 'geography',
        'source-layer': 'landcover',
        paint: {
          'fill-color': [
            'match',
            ['get', 'class'],
            'sand',
            c.sand,
            'wood',
            c.forest,
            'grass',
            c.forest,
            'ice',
            c.ice,
            c.land,
          ],
          'fill-opacity': ['match', ['get', 'class'], 'wood', 0.58, 'grass', 0.2, 0.7],
        },
      },
      {
        id: 'atlas-relief',
        type: 'hillshade',
        source: 'relief',
        minzoom: 3,
        paint: {
          'hillshade-exaggeration': 0.38,
          'hillshade-shadow-color': c.relief,
          'hillshade-highlight-color': c.land,
          'hillshade-accent-color': c.sand,
          'hillshade-illumination-anchor': 'map',
          'hillshade-illumination-direction': 315,
        },
      },
      {
        id: 'atlas-water',
        type: 'fill',
        source: 'geography',
        'source-layer': 'water',
        paint: { 'fill-color': c.water },
      },
      {
        id: 'atlas-coast-depth',
        type: 'line',
        source: 'geography',
        'source-layer': 'water',
        paint: {
          'line-color': c.coast,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1, 8, 8],
          'line-opacity': 0.16,
          'line-blur': 2,
        },
      },
      {
        id: 'atlas-coast',
        type: 'line',
        source: 'geography',
        'source-layer': 'water',
        paint: { 'line-color': c.coast, 'line-width': 0.7, 'line-opacity': 0.65 },
      },
      {
        id: 'atlas-rivers',
        type: 'line',
        source: 'geography',
        'source-layer': 'waterway',
        minzoom: 5,
        paint: {
          'line-color': c.water,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 14, 2.5],
        },
      },
      {
        id: 'atlas-roads',
        type: 'line',
        source: 'geography',
        'source-layer': 'transportation',
        minzoom: 10,
        filter: ['match', ['get', 'class'], ['path', 'track', 'minor'], true, false],
        paint: {
          'line-color': c.relief,
          'line-width': 0.8,
          'line-opacity': 0.35,
          'line-dasharray': [3, 3],
        },
      },
      labels('atlas-continents', 'place', ['continent'], 0, 4, 22, c),
      labels('atlas-oceans', 'water_name', ['ocean', 'sea'], 0, 7, 18, {
        ...c,
        ink: c.coast,
        land: c.water,
      }),
      labels('atlas-regions', 'place', ['country', 'state'], 2, 7, 15, c),
      labels('atlas-geographic-cities', 'place', ['city'], 5, 9, 12, c),
      labels('atlas-river-names', 'waterway', [], 10, 24, 12, c),
    ],
  };
}

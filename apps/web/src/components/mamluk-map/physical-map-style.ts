import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/** Resolved host design tokens. No provider or game state belongs in this palette. */
export interface PhysicalMapColors {
  readonly ocean: string;
  readonly land: string;
  readonly forest: string;
  readonly border: string;
  readonly label: string;
}

/** Restyles provider-owned geographic data while preserving sources and credits.
 * Natural Earth relief uses existing OpenFreeMap tiles and overzooms their capped
 * raster source; it never generates terrain or changes settlement coordinates.
 */
export function buildPhysicalMapStyle(
  base: StyleSpecification,
  colors: PhysicalMapColors,
): StyleSpecification {
  if (
    !base ||
    typeof base !== 'object' ||
    base.version !== 8 ||
    !base.sources ||
    typeof base.sources !== 'object' ||
    Array.isArray(base.sources) ||
    !Array.isArray(base.layers) ||
    base.layers.some((layer) => !layer || typeof layer !== 'object')
  )
    throw new Error('Invalid physical map style');
  const style = structuredClone(base);
  const excluded = new Set(['landuse', 'building', 'aeroway', 'aerodrome_label', 'poi', 'park']);
  const layers = style.layers
    .filter((layer) => !('source-layer' in layer && excluded.has(layer['source-layer'] ?? '')))
    .map((layer) => physicalLayer(layer, colors))
    .filter((layer) => layer.maxzoom === undefined || (layer.minzoom ?? 0) < layer.maxzoom);
  return { ...style, layers };
}

function physicalLayer(layer: LayerSpecification, colors: PhysicalMapColors): LayerSpecification {
  if (layer.type === 'background')
    return { ...layer, paint: { ...layer.paint, 'background-color': colors.land } };
  if (layer.type === 'raster' && layer.source === 'ne2_shaded')
    return { ...layer, maxzoom: 24, paint: { ...layer.paint, 'raster-opacity': 0.96 } };
  if (layer.type === 'fill' && layer['source-layer'] === 'water')
    return { ...layer, paint: { ...layer.paint, 'fill-color': colors.ocean } };
  const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined;
  if (layer.type === 'fill' && sourceLayer === 'landcover') {
    const green = /wood|forest|grass|wetland/.test(layer.id);
    return {
      ...layer,
      paint: {
        ...layer.paint,
        'fill-color': green ? colors.forest : colors.land,
        'fill-opacity': green ? 0.24 : 0.18,
      },
    };
  }
  if (layer.type === 'line' && sourceLayer === 'waterway')
    return { ...layer, paint: { ...layer.paint, 'line-color': colors.ocean } };
  if (layer.type === 'line' && sourceLayer === 'boundary')
    return {
      ...layer,
      minzoom: Math.max(layer.minzoom ?? 0, 8),
      paint: {
        ...layer.paint,
        'line-color': colors.border,
        'line-width': 0.7,
        'line-opacity': 0.28,
      },
    };
  if (
    sourceLayer === 'transportation' ||
    sourceLayer === 'transportation_name' ||
    sourceLayer === 'place'
  ) {
    const detailed = { ...layer, minzoom: Math.max(layer.minzoom ?? 0, 10) };
    if (detailed.type === 'symbol')
      return {
        ...detailed,
        paint: {
          ...detailed.paint,
          'text-color': colors.label,
          'text-halo-color': colors.land,
          'text-halo-width': 1.2,
        },
      };
    return detailed;
  }
  return layer;
}

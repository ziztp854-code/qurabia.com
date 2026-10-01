import type { StyleSpecification } from 'maplibre-gl';
import { REFERENCE_IMAGE_CORNERS } from './image-map-calibration';

const REFERENCE_ID = 'mamluk-reference-basemap';

/** The supplied atlas is presentation artwork; game coordinates come from the server. */
export function buildReferenceMapStyle(base: StyleSpecification): StyleSpecification {
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
    throw new Error('Invalid reference map style');
  if (
    Object.hasOwn(base.sources, REFERENCE_ID) ||
    base.layers.some((layer) => layer.id === REFERENCE_ID)
  )
    throw new Error('Reference basemap identifier already exists');
  const style = structuredClone(base);
  return {
    ...style,
    sources: {
      ...style.sources,
      [REFERENCE_ID]: {
        type: 'image',
        url: '/game-art/mamluk-map/reference-basemap.webp',
        coordinates: [
          [...REFERENCE_IMAGE_CORNERS[0]],
          [...REFERENCE_IMAGE_CORNERS[1]],
          [...REFERENCE_IMAGE_CORNERS[2]],
          [...REFERENCE_IMAGE_CORNERS[3]],
        ],
      },
    },
    layers: [
      ...style.layers,
      {
        id: REFERENCE_ID,
        type: 'raster',
        source: REFERENCE_ID,
        paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 },
      },
    ],
  };
}

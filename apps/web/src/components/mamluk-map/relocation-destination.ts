import type { GeoJSONSource, Map as LibreMap } from 'maplibre-gl';
import type { MapPalette } from '@mamluk/maplibre-adapter';

export interface RelocationDestination {
  readonly longitude: number;
  readonly latitude: number;
}

/** Manual drafts keep their precision; world-specific authority remains on the server. */
export function validateDestination(point: RelocationDestination): RelocationDestination | null {
  const { longitude, latitude } = point;
  return Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -179.9 &&
    longitude <= 179.9 &&
    latitude >= -85 &&
    latitude <= 85
    ? { longitude, latitude }
    : null;
}

/** Map taps may use wrapped longitude; the authoritative relocation API still validates world bounds. */
export function normalizeDestination(point: RelocationDestination): RelocationDestination | null {
  if (!Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) return null;
  const longitude = Number((((point.longitude + 180) % 360 + 360) % 360 - 180).toFixed(6));
  const latitude = Number(point.latitude.toFixed(6));
  return validateDestination({ longitude, latitude });
}

const sourceId = 'qurabia-relocation-preview';
const layerIds = [sourceId, `${sourceId}-center`] as const;

/** Transient client preview. It never changes settlement or territory sources. */
export function showDestinationPreview(
  map: LibreMap,
  point: RelocationDestination | null,
  colors: MapPalette,
) {
  if (!point) {
    for (const id of [...layerIds].reverse()) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    return;
  }
  const data = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
        properties: {},
      },
    ],
  };
  const source = map.getSource<GeoJSONSource>(sourceId);
  if (source) source.setData(data);
  else map.addSource(sourceId, { type: 'geojson', data });
  if (!map.getLayer(sourceId))
    map.addLayer({
      id: sourceId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 15,
        'circle-color': colors.fog,
        'circle-opacity': 0.75,
        'circle-stroke-color': colors.city,
        'circle-stroke-width': 3,
      },
    });
  if (!map.getLayer(layerIds[1]))
    map.addLayer({
      id: layerIds[1],
      type: 'circle',
      source: sourceId,
      paint: { 'circle-radius': 5, 'circle-color': colors.city },
    });
}

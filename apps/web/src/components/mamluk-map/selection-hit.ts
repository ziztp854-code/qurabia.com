import type { MapPayload } from '@mamluk/world-map-core';
import type { Map as LibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import type { SelectableLayer, SelectionKey } from './selection';

const selectable: readonly SelectableLayer[] = ['cities', 'castles', 'armies', 'sieges'];
// Settlement artwork is bottom-anchored; target its visible body above the coordinate.
const artworkBodyOffset = 18;

/** Resolve overlapping SDK hit areas using approved coordinates, never click properties. */
export function pickMapSelection(
  map: Pick<LibreMap, 'project' | 'getLayer'>,
  payload: MapPayload | null,
  hits: readonly MapGeoJSONFeature[],
  point: { readonly x: number; readonly y: number },
): SelectionKey | null {
  if (!payload) return null;
  const nearest = hits.reduce<{ key: SelectionKey; distance: number } | null>((best, hit) => {
    const layer = selectable.find((name) => hit.source === `mamluk-${name}`);
    if (!layer || hit.id === undefined) return best;
    const feature = payload.layers[layer].features.find((entry) => entry.id === String(hit.id));
    if (!feature || feature.geometry.type !== 'Point') return best;
    const [longitude, latitude] = feature.geometry.coordinates;
    const anchor = map.project([longitude, latitude]);
    const offset = map.getLayer(`mamluk-${layer}`)?.type === 'symbol' ? artworkBodyOffset : 0;
    const distance = (anchor.x - point.x) ** 2 + (anchor.y - offset - point.y) ** 2;
    if (!Number.isFinite(distance) || (best && distance >= best.distance)) return best;
    return { key: { layer, id: feature.id }, distance };
  }, null);
  return nearest?.key ?? null;
}

import type { BoundingBox } from '@mamluk/world-map-core';
import type { GeoJSONSource, Map as LibreMap, MapMouseEvent } from 'maplibre-gl';
import type { MapPalette } from '@mamluk/maplibre-adapter';
import { mapRequest, MapAuthorizationError } from './map-request';
import { SDK_FEATURE_ID, withFeatureIdentity } from './source-identity';

const sourceId = 'mamluk-overview';
const layerIds = ['mamluk-overview-cells', 'mamluk-overview-count'] as const;
export interface Overview {
  worldId: string;
  revision: string;
  serverTime: number;
  cells: {
    type: 'FeatureCollection';
    features: {
      type: 'Feature';
      id: string;
      geometry: { type: 'Point'; coordinates: [number, number] };
      properties: { count: number; targetVillageId: string | null };
    }[];
  };
}

export function decodeOverview(value: unknown, worldId: string): Overview {
  const result = value as Overview;
  if (
    !result ||
    result.worldId !== worldId ||
    !/^(0|[1-9]\d*)$/.test(result.revision) ||
    !Number.isSafeInteger(result.serverTime) ||
    result.serverTime < 0 ||
    result.cells?.type !== 'FeatureCollection' ||
    !Array.isArray(result.cells.features) ||
    result.cells.features.length > 288
  )
    throw new Error('Invalid world overview');
  const ids = new Set<string>();
  for (const cell of result.cells.features) {
    const p = cell?.properties,
      c = cell?.geometry?.coordinates;
    if (
      cell.type !== 'Feature' ||
      typeof cell.id !== 'string' ||
      !/^cell:\d+:\d+$/.test(cell.id) ||
      ids.has(cell.id) ||
      cell.geometry?.type !== 'Point' ||
      !Array.isArray(c) ||
      c.length !== 2 ||
      !c.every(Number.isFinite) ||
      Math.abs(c[0]) > 180 ||
      Math.abs(c[1]) > 90 ||
      !p ||
      !Number.isSafeInteger(p.count) ||
      p.count < 1 ||
      !(
        p.targetVillageId === null ||
        (p.count === 1 && typeof p.targetVillageId === 'string' && p.targetVillageId.length <= 128)
      )
    )
      throw new Error('Invalid world overview cell');
    ids.add(cell.id);
  }
  // Reconstruct the exact public allowlist; never forward extra server fields to a map source.
  return {
    worldId,
    revision: result.revision,
    serverTime: result.serverTime,
    cells: {
      type: 'FeatureCollection',
      features: result.cells.features.map((cell) => ({
        type: 'Feature',
        id: cell.id,
        geometry: { type: 'Point', coordinates: [...cell.geometry.coordinates] },
        properties: {
          count: cell.properties.count,
          targetVillageId: cell.properties.targetVillageId,
        },
      })),
    },
  };
}

export function createWorldOverview(
  map: LibreMap,
  worldId: string,
  palette: MapPalette,
  visibilityFor: (layerId: string) => 'visible' | 'none' | undefined = () => undefined,
  onPayload: (payload: Overview | null) => void = () => {},
) {
  let generation = 0,
    disposed = false;
  let accepted: Overview | null = null;
  let signature = '';
  const clear = () => {
    for (const id of [...layerIds].reverse()) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    signature = '';
    onPayload(null);
  };
  return {
    hide() {
      generation++;
      clear();
    },
    dispose() {
      disposed = true;
      generation++;
      clear();
    },
    async load(bounds: BoundingBox, signal: AbortSignal) {
      const token = ++generation;
      const query = new URLSearchParams({
        worldId,
        ...Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, String(value)])),
      });
      let response: Response;
      try {
        response = await mapRequest(`/api/kingdoms/world-map/overview?${query}`, signal);
      } catch (error) {
        if (
          !signal.aborted &&
          !disposed &&
          token === generation &&
          error instanceof MapAuthorizationError
        )
          clear();
        throw error;
      }
      if (signal.aborted || disposed || token !== generation) return false;
      if (!response.ok) {
        clear();
        throw new Error('World overview unavailable');
      }
      const next = decodeOverview(await response.json(), worldId);
      if (signal.aborted || disposed || token !== generation) return false;
      if (
        accepted &&
        (BigInt(next.revision) < BigInt(accepted.revision) ||
          (next.revision === accepted.revision && next.serverTime < accepted.serverTime))
      )
        return Boolean(map.getSource(sourceId));
      accepted = next;
      const current = map.getSource<GeoJSONSource>(sourceId);
      const nextSignature = JSON.stringify(next.cells);
      if (current) {
        if (signature !== nextSignature) current.setData(withFeatureIdentity(next.cells));
      } else
        map.addSource(sourceId, {
          type: 'geojson',
          data: withFeatureIdentity(next.cells),
          promoteId: SDK_FEATURE_ID,
        });
      signature = nextSignature;
      if (!map.getLayer(layerIds[0]))
        map.addLayer({
          id: layerIds[0],
          type: 'circle',
          source: sourceId,
          ...(visibilityFor(layerIds[0])
            ? { layout: { visibility: visibilityFor(layerIds[0])! } }
            : {}),
          paint: {
            'circle-color': palette.city,
            'circle-stroke-color': palette.border,
            'circle-stroke-width': 1.5,
            'circle-radius': ['step', ['get', 'count'], 15, 20, 20, 100, 25],
          },
        });
      if (!map.getLayer(layerIds[1]))
        map.addLayer({
          id: layerIds[1],
          type: 'symbol',
          source: sourceId,
          layout: {
            ...(visibilityFor(layerIds[1]) ? { visibility: visibilityFor(layerIds[1])! } : {}),
            'text-field': ['concat', ['to-string', ['get', 'count']], ' قرية'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': palette.fog },
        });
      onPayload(next);
      return true;
    },
    click(event: MapMouseEvent): boolean {
      if (!accepted || !map.getLayer(layerIds[0])) return false;
      const hit = map
        .queryRenderedFeatures(event.point, { layers: [...layerIds] })
        .find((feature) => accepted!.cells.features.some((cell) => cell.id === feature.id));
      const cell = accepted.cells.features.find((cell) => cell.id === hit?.id);
      if (!cell) return false;
      map.easeTo({
        center: cell.geometry.coordinates,
        zoom: cell.properties.count === 1 ? 9 : 5,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
      });
      return true;
    },
  };
}

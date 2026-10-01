import {
  MapLibreAdapter,
  ViewportLoader,
  type MapLibrePort,
  type MapPalette,
} from '@mamluk/maplibre-adapter';
import { parseMapPayload, type MapPayload, type MapProjection } from '@mamluk/world-map-core';
import type {
  AddLayerObject,
  LayerSpecification,
  Map as LibreMap,
  MapMouseEvent,
  Source,
} from 'maplibre-gl';
import type { SelectionKey, SelectableLayer } from './selection';
import { SDK_FEATURE_ID, withFeatureIdentity, withSourceIdentity } from './source-identity';
import type { SettlementPresentation } from './settlement-presentation';

export interface MapSessionCallbacks {
  readonly onPayload: (payload: MapPayload | null) => void;
  readonly onSelection: (key: SelectionKey | null) => void;
  readonly onStatus: (status: 'loading' | 'ready' | 'zoom' | 'error') => void;
}

function isStyleLayer(layer: AddLayerObject): layer is LayerSpecification {
  return layer.type !== 'custom' && (!('source' in layer) || typeof layer.source === 'string');
}

/** SDK 6 emits movement events even when the projection does not change. */
function presentationPort(
  map: LibreMap,
  palette: MapPalette,
  settlements?: Pick<SettlementPresentation, 'layer'>,
  initialStyleReady?: boolean,
) {
  // SDK isStyleLoaded also waits for tiles. Overlay removal must not wait for them.
  let styleReady = initialStyleReady ?? map.isStyleLoaded();
  const onStyleReady = () => {
    styleReady = true;
  };
  map.on('style.load', onStyleReady);
  const port: MapLibrePort = {
    isStyleLoaded: () => styleReady,
    getSource: <TSource extends Source>(id: string) => {
      const source = map.getSource<TSource>(id);
      return source && id.startsWith('mamluk-') ? withSourceIdentity(source) : source;
    },
    addSource: (id, source) =>
      map.addSource(
        id,
        id.startsWith('mamluk-') && source.type === 'geojson'
          ? { ...source, data: withFeatureIdentity(source.data), promoteId: SDK_FEATURE_ID }
          : source,
      ),
    getLayer: map.getLayer.bind(map),
    addLayer: (layer) => {
      // Fog shades the basemap; every overlay already passed the server's policy.
      const presented =
        layer.id === 'mamluk-fog' && layer.type === 'fill'
          ? { ...layer, paint: { ...layer.paint, 'fill-opacity': 0.14 } }
          : isStyleLayer(layer)
            ? (settlements?.layer(layer) ?? layer)
            : layer;
      map.addLayer(presented, layer.id === 'mamluk-fog' ? 'mamluk-territories' : undefined);
      if (layer.id === 'mamluk-territories') {
        // Only outline approved server polygons, sharing the adapter's expiry lifecycle.
        map.addLayer({
          id: 'mamluk-village-borders',
          type: 'line',
          source: 'mamluk-territories',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': palette.city, 'line-width': 2.5, 'line-opacity': 0.9 },
        });
      }
      return map;
    },
    removeLayer: (id) => {
      if (id === 'mamluk-territories' && map.getLayer('mamluk-village-borders'))
        map.removeLayer('mamluk-village-borders');
      return map.removeLayer(id);
    },
    removeSource: map.removeSource.bind(map),
    setProjection: (projection) => {
      if (map.getProjection()?.type === projection.type) return map;
      return map.setProjection(projection);
    },
    setStyle: (style, options) => {
      styleReady = false;
      return map.setStyle(style, options);
    },
    on: map.on.bind(map),
    off: map.off.bind(map),
    getBounds: map.getBounds.bind(map),
    project: map.project.bind(map),
    unproject: map.unproject.bind(map),
  };
  return { port, dispose: () => map.off('style.load', onStyleReady) };
}

/** Observes accepted snapshots only; this class cannot compute game state. */
class ObservedAdapter extends MapLibreAdapter {
  private replacing = false;
  private accepted: Pick<MapPayload, 'revision' | 'serverTime'> | null = null;
  constructor(
    map: MapLibrePort,
    palette: MapPalette,
    private readonly receive: MapSessionCallbacks['onPayload'],
  ) {
    super(map, { palette });
  }
  override render(payload: MapPayload, deliveryAgeMs = 0): void {
    const stale =
      this.accepted &&
      (BigInt(payload.revision) < BigInt(this.accepted.revision) ||
        (payload.revision === this.accepted.revision &&
          payload.serverTime < this.accepted.serverTime));
    if (stale) return;
    this.replacing = true;
    try {
      super.render(payload, deliveryAgeMs);
      this.accepted = { revision: payload.revision, serverTime: payload.serverTime };
      this.receive(payload);
    } finally {
      this.replacing = false;
    }
  }
  override clear(): void {
    super.clear();
    if (!this.replacing) this.receive(null);
  }
  override resetSession(worldId: string): void {
    super.resetSession(worldId);
    this.accepted = null;
  }
}

const layers: readonly SelectableLayer[] = ['cities', 'castles', 'armies', 'sieges'];
const recoveryDelaysMs = [1000, 2000, 5000] as const;
export function createMapSession(
  map: LibreMap,
  worldId: string,
  projection: MapProjection,
  palette: MapPalette,
  callbacks: MapSessionCallbacks,
  settlements?: Pick<SettlementPresentation, 'layer'>,
  initialStyleReady?: boolean,
) {
  let disposed = false;
  let recoveryAttempts = 0;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelRecovery = () => {
    clearTimeout(recoveryTimer);
    recoveryTimer = undefined;
  };
  const presentation = presentationPort(map, palette, settlements, initialStyleReady);
  const adapter = new ObservedAdapter(presentation.port, palette, (payload) => {
    if (disposed) return;
    callbacks.onPayload(payload);
    if (payload) {
      cancelRecovery();
      recoveryAttempts = 0;
      callbacks.onStatus('ready');
    }
  });
  adapter.resetSession(worldId);
  adapter.setProjection(projection);
  const loader = new ViewportLoader(map, adapter, {
    load: async (bounds, signal) => {
      // A pending recovery must never interrupt a newer pan or manual request.
      cancelRecovery();
      callbacks.onStatus('loading');
      const query = new URLSearchParams({
        worldId,
        ...Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, String(value)])),
      });
      const response = await fetch(`/api/kingdoms/world-map/viewport?${query}`, {
        signal,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Map request unavailable');
      return parseMapPayload(await response.json());
    },
    onError: () => {
      if (disposed) return;
      callbacks.onStatus('error');
      const delay = recoveryDelaysMs[recoveryAttempts];
      if (delay === undefined) return;
      recoveryAttempts += 1;
      recoveryTimer = setTimeout(() => {
        recoveryTimer = undefined;
        if (!disposed) void loader.refresh();
      }, delay);
    },
  });
  const onMove = () => {
    if (disposed) return;
    cancelRecovery();
    callbacks.onSelection(null);
    const bounds = adapter.getViewportBounds();
    const width =
      bounds.east > bounds.west ? bounds.east - bounds.west : 360 - bounds.west + bounds.east;
    callbacks.onStatus(width > 90 || bounds.north - bounds.south > 90 ? 'zoom' : 'loading');
  };
  const onClick = (event: MapMouseEvent) => {
    const visibleLayers = layers.map((layer) => `mamluk-${layer}`).filter((id) => map.getLayer(id));
    if (!visibleLayers.length) return;
    const feature = map.queryRenderedFeatures(event.point, { layers: visibleLayers })[0];
    const layer = layers.find((name) => feature?.source === `mamluk-${name}`);
    callbacks.onSelection(
      feature && layer && feature.id !== undefined ? { layer, id: String(feature.id) } : null,
    );
  };
  const onStyleLoad = () => void loader.refresh();
  map.on('style.load', onStyleLoad);
  map.on('moveend', onMove);
  map.on('click', onClick);
  if (presentation.port.isStyleLoaded()) void loader.refresh();
  return {
    adapter,
    loader,
    dispose: () => {
      disposed = true;
      cancelRecovery();
      loader.dispose();
      adapter.dispose();
      presentation.dispose();
      map.off('style.load', onStyleLoad);
      map.off('moveend', onMove);
      map.off('click', onClick);
    },
  };
}

import {
  MapLibreAdapter,
  ViewportLoader,
  type MapLibrePort,
  type MapPalette,
} from '@mamluk/maplibre-adapter';
import {
  parseMapPayload,
  type BoundingBox,
  type MapPayload,
  type MapProjection,
} from '@mamluk/world-map-core';
import type {
  AddLayerObject,
  GeoJSONSource,
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
  retainPublicLayers: () => boolean = () => false,
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
      if (retainPublicLayers() && (id === 'mamluk-cities' || id === 'mamluk-territories'))
        return map;
      if (id === 'mamluk-territories' && map.getLayer('mamluk-village-borders'))
        map.removeLayer('mamluk-village-borders');
      return map.removeLayer(id);
    },
    removeSource: (id) =>
      retainPublicLayers() && (id === 'mamluk-cities' || id === 'mamluk-territories')
        ? map
        : map.removeSource(id),
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
  private publicBounds: BoundingBox | null = null;
  private publicCities: Parameters<GeoJSONSource['setData']>[0] | null = null;
  constructor(
    private readonly port: MapLibrePort,
    palette: MapPalette,
    private readonly receive: MapSessionCallbacks['onPayload'],
    private readonly isPublic: (payload: MapPayload) => boolean,
    private readonly retainPublicLayers: (retain: boolean) => void,
  ) {
    super(port, { palette });
  }
  override render(payload: MapPayload, deliveryAgeMs = 0): void {
    const stale =
      this.accepted &&
      (BigInt(payload.revision) < BigInt(this.accepted.revision) ||
        (payload.revision === this.accepted.revision &&
          payload.serverTime < this.accepted.serverTime));
    if (stale) return;
    if (!this.isPublic(payload)) this.clearPublic();
    this.replacing = true;
    try {
      super.render(payload, deliveryAgeMs);
      this.publicBounds = this.isPublic(payload) ? { ...payload.bounds } : null;
      this.publicCities = this.publicBounds ? publicCityPresentation(payload) : null;
      this.retainPublicLayers(this.publicBounds !== null);
      this.accepted = { revision: payload.revision, serverTime: payload.serverTime };
      this.receive(payload);
    } catch (error) {
      this.publicBounds = null;
      this.publicCities = null;
      this.retainPublicLayers(false);
      super.clear();
      this.receive(null);
      throw error;
    } finally {
      this.replacing = false;
    }
  }
  override clear(): void {
    if (this.publicBounds && !sameBounds(this.publicBounds, this.getViewportBounds())) {
      this.publicBounds = null;
      this.publicCities = null;
      this.retainPublicLayers(false);
    }
    super.clear();
    // Current snapshot details expire; only the explicitly public city allowlist survives.
    if (!this.replacing && this.publicCities) {
      try {
        this.port.getSource<GeoJSONSource>('mamluk-cities')?.setData(this.publicCities);
      } catch {
        // If sanitization fails, remove public sources too; never keep their old private attributes.
        this.publicBounds = null;
        this.publicCities = null;
        this.retainPublicLayers(false);
        super.clear();
      }
    }
    if (!this.replacing) this.receive(null);
  }
  override resetSession(worldId: string): void {
    this.clearPublic();
    super.resetSession(worldId);
    this.accepted = null;
  }
  /** Public retention is presentation only: current detail payloads and all private sources still clear. */
  clearPublic(): void {
    this.publicBounds = null;
    this.publicCities = null;
    this.retainPublicLayers(false);
    this.clear();
  }
}

function publicCityPresentation(payload: MapPayload): Parameters<GeoJSONSource['setData']>[0] {
  return {
    type: 'FeatureCollection',
    features: payload.layers.cities.features.map((feature) => ({
      type: 'Feature',
      id: feature.id,
      geometry: { type: 'Point', coordinates: [...feature.geometry.coordinates] },
      properties: {
        name: feature.properties.name,
        regionId: feature.properties.regionId,
        ownerPlayerId: feature.properties.ownerPlayerId,
        ownerSultanateId: feature.properties.ownerSultanateId,
      },
    })),
  };
}

function sameBounds(left: BoundingBox, right: BoundingBox): boolean {
  return (
    left.west === right.west &&
    left.east === right.east &&
    left.south === right.south &&
    left.north === right.north
  );
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
  let retainPublicLayers = false;
  const publicPayloads = new WeakSet<MapPayload>();
  const cancelRecovery = () => {
    clearTimeout(recoveryTimer);
    recoveryTimer = undefined;
  };
  const presentation = presentationPort(
    map,
    palette,
    settlements,
    initialStyleReady,
    () => retainPublicLayers,
  );
  const adapter = new ObservedAdapter(
    presentation.port,
    palette,
    (payload) => {
      if (disposed) return;
      callbacks.onPayload(payload);
      if (payload) {
        cancelRecovery();
        recoveryAttempts = 0;
        callbacks.onStatus('ready');
      }
    },
    (payload) => publicPayloads.has(payload),
    (retain) => {
      retainPublicLayers = retain;
    },
  );
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
      const payload = parseMapPayload(await response.json());
      if (response.headers?.get('X-Mamluk-Public-Settlements') === '1') publicPayloads.add(payload);
      return payload;
    },
    onError: () => {
      if (disposed) return;
      adapter.clearPublic();
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
    adapter.clearPublic();
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
  const onStyleLoad = () => {
    adapter.clearPublic();
    void loader.refresh();
  };
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
      adapter.clearPublic();
      loader.dispose();
      adapter.dispose();
      presentation.dispose();
      map.off('style.load', onStyleLoad);
      map.off('moveend', onMove);
      map.off('click', onClick);
    },
  };
}

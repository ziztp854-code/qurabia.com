import type {
  GeoJSONSource,
  Map as LibreMap,
  GeoJSONSourceSpecification,
  StyleSpecification,
} from 'maplibre-gl' with { 'resolution-mode': 'import' };
import type {
  BoundingBox,
  Coordinates,
  MapPayload,
  MapProjection,
  MapProjectionAdapter,
} from '@mamluk/world-map-core';
import { DEFAULT_PALETTE, LAYER_NAMES, overlayLayers, type MapPalette } from './styles';

/** Concrete SDK boundary; a MapLibre Map satisfies this type without a wrapper. */
export type MapLibrePort = Pick<
  LibreMap,
  | 'isStyleLoaded'
  | 'getSource'
  | 'addSource'
  | 'getLayer'
  | 'addLayer'
  | 'removeLayer'
  | 'removeSource'
  | 'setProjection'
  | 'setStyle'
  | 'on'
  | 'off'
  | 'getBounds'
  | 'project'
  | 'unproject'
> &
  Partial<Pick<LibreMap, 'setFeatureState'>>;

export interface AdapterOptions {
  readonly palette?: MapPalette;
  readonly symbolMarkers?: boolean;
  readonly arabicLabels?: boolean;
  readonly now?: () => number;
  readonly schedule?: (task: () => void, delay: number) => () => void;
  readonly onExpire?: () => void;
}

export interface AdapterRenderMetrics {
  /** UTF-8 bytes of the authorized wire-shaped payload; excludes basemap tiles. */
  readonly payloadBytes: number;
  /** Submitted authorized features, not MapLibre's post-collision rendered count. */
  readonly featureCount: number;
  /** Synchronous source submission time; GPU/worker completion is asynchronous. */
  readonly sourceUpdateMs: number;
  readonly renderMs: number;
}
const empty = (): GeoJSONSourceSpecification['data'] => ({
  type: 'FeatureCollection',
  features: [],
});
const wrap = (longitude: number) => ((((longitude + 180) % 360) + 360) % 360) - 180;

export class MapLibreAdapter implements MapProjectionAdapter {
  private metrics: AdapterRenderMetrics | undefined;
  get latestRenderMetrics(): AdapterRenderMetrics | undefined {
    return this.metrics ? { ...this.metrics } : undefined;
  }

  private projection: MapProjection = 'mercator';
  private snapshot: MapPayload | undefined;
  private worldId: string | undefined;
  private revision: bigint | undefined;
  private serverTime: number | undefined;
  private deadline = 0;
  private disposed = false;
  private cancelExpiry: (() => void) | undefined;
  private readonly sourceSignatures = new Map<string, string>();
  private readonly now: () => number;
  private readonly schedule: (task: () => void, delay: number) => () => void;
  private readonly palette: MapPalette;
  private readonly onStyleLoad = () => {
    if (this.disposed || !this.map.isStyleLoaded()) return;
    this.map.setProjection({ type: this.projection });
    this.restore();
  };

  constructor(
    private readonly map: MapLibrePort,
    private readonly options: AdapterOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.schedule =
      options.schedule ??
      ((task, delay) => {
        const timer = setTimeout(task, delay);
        return () => clearTimeout(timer);
      });
    this.palette = options.palette ?? DEFAULT_PALETTE;
    map.on('style.load', this.onStyleLoad);
  }

  /** Call on login/world changes, after aborting requests from the previous session. */
  resetSession(worldId: string): void {
    this.assertActive();
    if (!worldId.trim()) throw new Error('World ID is required');
    this.clear();
    this.selection = undefined;
    this.metrics = undefined;
    this.worldId = worldId;
    this.revision = undefined;
    this.serverTime = undefined;
    this.deadline = 0;
  }

  setProjection(projection: MapProjection): void {
    this.assertActive();
    this.projection = projection;
    if (this.map.isStyleLoaded()) this.map.setProjection({ type: projection });
  }

  setBasemap(style: string | StyleSpecification): void {
    this.assertActive();
    this.map.setStyle(style);
  }

  project(coordinates: Coordinates): { readonly x: number; readonly y: number } {
    this.assertActive();
    return this.map.project([coordinates.longitude, coordinates.latitude]);
  }

  unproject(point: { readonly x: number; readonly y: number }): Coordinates {
    this.assertActive();
    const location = this.map.unproject([point.x, point.y]);
    return { longitude: wrap(location.lng), latitude: location.lat };
  }

  getViewportBounds(): BoundingBox {
    this.assertActive();
    const bounds = this.map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    return {
      west: east - west >= 360 ? -180 : wrap(west),
      east: east - west >= 360 ? 180 : wrap(east),
      south: Math.max(-90, bounds.getSouth()),
      north: Math.min(90, bounds.getNorth()),
    };
  }

  render(payload: MapPayload, deliveryAgeMs = 0): void {
    this.assertActive();
    if (payload.worldId !== this.worldId) {
      this.clear();
      throw new Error('Payload does not belong to the active world');
    }
    if (payload.schemaVersion !== 1 || !/^(0|[1-9]\d*)$/.test(payload.revision)) {
      this.clear();
      throw new Error('Unsupported map payload');
    }
    const revision = BigInt(payload.revision);
    if (this.revision !== undefined && revision < this.revision) return;
    if (
      revision === this.revision &&
      this.serverTime !== undefined &&
      payload.serverTime < this.serverTime
    )
      return;
    const started = performance.now();
    const ttl = this.remainingTtl(payload, revision, deliveryAgeMs);
    if (
      this.selection &&
      !payload.layers[this.selection.name].features.some(
        (feature) => feature.id === this.selection!.id,
      )
    ) {
      this.applySelection(false);
      this.selection = undefined;
    }
    this.cancelExpiry?.();
    this.snapshot = structuredClone(payload);
    this.revision = revision;
    this.serverTime = payload.serverTime;
    this.deadline = this.now() + ttl;
    this.cancelExpiry = this.schedule(() => this.expire(), ttl);
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    const featureCount = LAYER_NAMES.reduce(
      (count, name) => count + payload.layers[name].features.length,
      0,
    );
    let sourceUpdateMs: number;
    try {
      sourceUpdateMs = this.restore();
    } catch (error) {
      this.clear();
      throw error;
    }
    this.metrics = {
      payloadBytes,
      featureCount,
      sourceUpdateMs,
      renderMs: performance.now() - started,
    };
  }

  private remainingTtl(payload: MapPayload, revision: bigint, deliveryAgeMs: number): number {
    const issuedTtl = payload.expiresAt - payload.serverTime - deliveryAgeMs;
    const ttl =
      revision === this.revision && payload.serverTime === this.serverTime
        ? Math.min(issuedTtl, this.deadline - this.now())
        : issuedTtl;
    if (!Number.isFinite(deliveryAgeMs) || deliveryAgeMs < 0) {
      this.clear();
      throw new Error('Invalid delivery age');
    }
    if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 2147483647) {
      this.clear();
      throw new Error('Map payload is expired');
    }
    return ttl;
  }

  clear(): void {
    this.cancelExpiry?.();
    this.cancelExpiry = undefined;
    this.snapshot = undefined;
    this.sourceSignatures.clear();
    this.selection = undefined;
    if (this.disposed || !this.map.isStyleLoaded()) return;
    for (const layer of this.layers().reverse()) {
      if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id);
    }
    for (const name of [...LAYER_NAMES, 'capitals', 'trade-routes']) {
      if (this.source(name)) this.map.removeSource('mamluk-' + name);
    }
  }

  setSelectedFeature(name: 'cities' | 'sultanateBorders', id: string | null): void {
    this.assertActive();
    this.applySelection(false);
    this.selection = id === null ? undefined : { name, id };
    this.applySelection();
  }

  private selection: { name: 'cities' | 'sultanateBorders'; id: string } | undefined;
  private applySelection(selected = true): void {
    if (!this.selection) return;
    const sources =
      this.selection.name === 'cities' ? ['cities', 'capitals'] : [this.selection.name];
    for (const name of sources) {
      if (this.map.getSource('mamluk-' + name))
        this.map.setFeatureState?.(
          { source: 'mamluk-' + name, id: this.selection.id },
          { selected },
        );
    }
  }
  private layers() {
    return overlayLayers(this.palette, this.options.symbolMarkers, this.options.arabicLabels);
  }
  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.map.off('style.load', this.onStyleLoad);
    if (this.map.isStyleLoaded()) {
      for (const name of [...LAYER_NAMES].reverse()) {
        const id = `mamluk-${name}`;
        if (this.map.getLayer(id)) this.map.removeLayer(id);
        if (this.map.getSource(id)) this.map.removeSource(id);
      }
    }
    this.disposed = true;
  }

  private restore(): number {
    if (this.disposed || !this.map.isStyleLoaded()) return 0;
    const started = performance.now();
    if (this.snapshot && this.now() >= this.deadline) this.expire();
    for (const name of LAYER_NAMES) {
      const id = `mamluk-${name}`;
      const data = this.snapshot ? this.copyData(this.presentationData(name)) : empty();
      const signature = JSON.stringify(data);
      const source = this.source(name);
      if (source) {
        if (this.sourceSignatures.get(name) !== signature) source.setData(data);
      } else
        this.map.addSource(id, {
          type: 'geojson',
          data,
          ...(name === 'cities' && this.options.symbolMarkers
            ? {
                cluster: true,
                clusterRadius: 48,
                clusterMaxZoom: 9,
                clusterProperties: {
                  __mamlukVillageCount: ['+', ['case', ['has', 'villageLevel'], 1, 0]],
                },
              }
            : {}),
        });
      this.sourceSignatures.set(name, signature);
    }
    if (this.options.symbolMarkers) {
      const capitals = this.snapshot
        ? {
            type: 'FeatureCollection' as const,
            features: this.snapshot.layers.cities.features.filter(
              (feature) => feature.properties.villageLevel === 50,
            ),
          }
        : { type: 'FeatureCollection' as const, features: [] };
      for (const [name, data] of [
        ['capitals', this.copyData(capitals)],
        ['trade-routes', empty()],
      ] as const) {
        const source = this.source(name);
        const signature = JSON.stringify(data);
        if (source) {
          if (this.sourceSignatures.get(name) !== signature) source.setData(data);
        } else this.map.addSource('mamluk-' + name, { type: 'geojson', data });
        this.sourceSignatures.set(name, signature);
      }
    }
    for (const layer of this.layers()) {
      if (!this.map.getLayer(layer.id)) this.map.addLayer(layer);
    }
    this.applySelection();
    return performance.now() - started;
  }
  private presentationData(name: keyof MapPayload['layers']): MapPayload['layers']['cities'] {
    const data = this.snapshot!.layers[name];
    if (name === 'cities' && this.options.symbolMarkers)
      return {
        ...data,
        features: data.features.filter((feature) => feature.properties.villageLevel !== 50),
      };
    if (name !== 'territories' && name !== 'sultanateBorders') return data;
    const colors = [
      this.palette.territory,
      this.palette.army,
      this.palette.castle,
      this.palette.siege,
      this.palette.visible,
    ];
    return {
      ...data,
      features: data.features.map((feature) => {
        const owner =
          feature.properties.ownerSultanateId ??
          feature.properties.sultanateId ??
          feature.properties.ownerPlayerId;
        const hash =
          typeof owner === 'string'
            ? Array.from(owner).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0)
            : 0;
        return {
          ...feature,
          properties: { ...feature.properties, __mamlukOwnerColor: colors[hash % colors.length]! },
        };
      }),
    };
  }
  private copyData(data: MapPayload['layers']['cities']): GeoJSONSourceSpecification['data'] {
    // JSON cloning bridges our immutable RFC 7946 contracts to the SDK's mutable types.
    return JSON.parse(JSON.stringify(data)) as GeoJSONSourceSpecification['data'];
  }

  private source(name: string): GeoJSONSource | undefined {
    const source = this.map.getSource(`mamluk-${name}`);
    if (!source) return undefined;
    if (source.type !== 'geojson') throw new Error('Map source ID collision');
    return source as GeoJSONSource;
  }

  private expire(): void {
    if (!this.snapshot) return;
    this.clear();
    this.options.onExpire?.();
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Map adapter has been disposed');
  }
}

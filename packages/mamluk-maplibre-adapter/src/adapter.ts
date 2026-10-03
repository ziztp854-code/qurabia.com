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
import { DEFAULT_PALETTE, LAYER_NAMES, mapLayer, type MapPalette } from './styles';

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
>;

export interface AdapterOptions {
  readonly palette?: MapPalette;
  readonly now?: () => number;
  readonly schedule?: (task: () => void, delay: number) => () => void;
  readonly onExpire?: () => void;
}

const empty = (): GeoJSONSourceSpecification['data'] => ({
  type: 'FeatureCollection',
  features: [],
});
const wrap = (longitude: number) => ((((longitude + 180) % 360) + 360) % 360) - 180;

export class MapLibreAdapter implements MapProjectionAdapter {
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
  private readonly onStyleLoad = () => this.restore();

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
    const ttl = this.remainingTtl(payload, revision, deliveryAgeMs);
    this.cancelExpiry?.();
    this.cancelExpiry = undefined;
    this.snapshot = structuredClone(payload);
    this.revision = revision;
    this.serverTime = payload.serverTime;
    this.deadline = this.now() + ttl;
    this.cancelExpiry = this.schedule(() => this.expire(), ttl);
    try {
      this.restore();
    } catch (error) {
      this.clear();
      throw error;
    }
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
    if (this.disposed || !this.map.isStyleLoaded()) return;
    for (const name of [...LAYER_NAMES].reverse()) {
      const id = `mamluk-${name}`;
      if (this.map.getLayer(id)) this.map.removeLayer(id);
      if (this.source(name)) this.map.removeSource(id);
    }
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

  private restore(): void {
    if (this.disposed || !this.map.isStyleLoaded()) return;
    if (this.snapshot && this.now() >= this.deadline) this.expire();
    this.map.setProjection({ type: this.projection });
    for (const name of LAYER_NAMES) {
      const id = `mamluk-${name}`;
      const data = this.snapshot ? this.snapshot.layers[name] : empty();
      const signature = JSON.stringify(data);
      const source = this.source(name);
      if (source) {
        if (this.sourceSignatures.get(name) !== signature) source.setData(JSON.parse(signature));
      } else this.map.addSource(id, { type: 'geojson', data: JSON.parse(signature) });
      this.sourceSignatures.set(name, signature);
      if (!this.map.getLayer(id)) this.map.addLayer(mapLayer(name, this.palette));
    }
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

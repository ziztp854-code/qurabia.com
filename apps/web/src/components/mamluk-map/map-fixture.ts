import type { MapPayload } from '@mamluk/world-map-core';
import type { Map as LibreMap } from 'maplibre-gl';

/** Fake only at the external MapLibre SDK boundary. */
export class MapSdkFixture {
  static instances: MapSdkFixture[] = [];
  static failCreation = false;
  static workerUrl: string | null = null;
  readonly workerUrlAtCreation: string | null;
  readonly initialCamera: { center?: readonly number[]; zoom?: number };
  lastCamera: { center?: readonly number[]; zoom?: number; duration?: number } | null = null;
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  readonly sources = new Map<
    string,
    { type: string; data: unknown; setData: (data: unknown) => void }
  >();
  readonly layers = new Map<string, unknown>();
  readonly images = new Map<string, unknown>();
  readonly canvas = document.createElement('canvas');
  bounds = { west: 28, south: 25, east: 40, north: 36 };
  projection = 'mercator';
  styleLoaded = true;
  removed = false;
  clicked: { source: string; id: string }[] = [];
  constructor(options?: { container?: HTMLElement; center?: readonly number[]; zoom?: number }) {
    this.workerUrlAtCreation = MapSdkFixture.workerUrl;
    this.initialCamera = { center: options?.center, zoom: options?.zoom };
    if (MapSdkFixture.failCreation) throw new Error('WebGL unavailable');
    MapSdkFixture.instances.push(this);
    options?.container?.append(this.canvas);
  }
  asMap(): LibreMap {
    return this as unknown as LibreMap;
  }
  on(event: string, listener: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }
  off(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }
  fire(event: string, value?: unknown) {
    this.listeners.get(event)?.forEach((listener) => listener(value));
  }
  isStyleLoaded() {
    return this.styleLoaded;
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  readonly layoutCalls: [string, string, unknown][] = [];
  setLayoutProperty(id: string, name: string, value: unknown) {
    this.layoutCalls.push([id, name, value]);
    const layer = this.layers.get(id) as { layout?: Record<string, unknown> } | undefined;
    if (layer) layer.layout = { ...layer.layout, [name]: value };
  }
  getLayer(id: string) {
    return this.layers.get(id);
  }
  addSource(id: string, source: { data: unknown; type: string }) {
    this.sources.set(id, {
      ...source,
      setData: (data: unknown) => {
        this.sources.get(id)!.data = data;
      },
    });
  }
  removeSource(id: string) {
    this.sources.delete(id);
  }
  addLayer(layer: { id: string }, beforeId?: string) {
    if (!beforeId || !this.layers.has(beforeId)) {
      this.layers.set(layer.id, layer);
      return;
    }
    const previous = [...this.layers.entries()];
    this.layers.clear();
    for (const [id, current] of previous) {
      if (id === beforeId) this.layers.set(layer.id, layer);
      this.layers.set(id, current);
    }
  }
  removeLayer(id: string) {
    this.layers.delete(id);
  }
  setProjection(value: { type: string }) {
    this.projection = value.type;
  }
  getProjection() {
    return { type: this.projection };
  }
  setStyle() {
    this.fire('style.load');
  }
  async loadImage() {
    return { data: { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) } };
  }
  addImage(id: string, data: unknown) {
    this.images.set(id, data);
  }
  hasImage(id: string) {
    return this.images.has(id);
  }
  project(point: [number, number]) {
    return { x: point[0], y: point[1] };
  }
  unproject(point: [number, number]) {
    return { lng: point[0], lat: point[1] };
  }
  getBounds() {
    return {
      getWest: () => this.bounds.west,
      getEast: () => this.bounds.east,
      getSouth: () => this.bounds.south,
      getNorth: () => this.bounds.north,
    };
  }
  queryRenderedFeatures() {
    return this.clicked;
  }
  getCanvas() {
    return this.canvas;
  }
  zoomIn() {
    this.fire('moveend');
  }
  zoomOut() {
    this.fire('moveend');
  }
  easeTo(camera?: { center?: readonly number[]; zoom?: number; duration?: number }) {
    this.lastCamera = camera ?? null;
    this.fire('moveend');
  }
  remove() {
    this.removed = true;
    this.listeners.clear();
    this.canvas.remove();
  }
}

export function approvedPayload(worldId = 'world', revision = '1'): MapPayload {
  const empty = { type: 'FeatureCollection' as const, features: [] };
  return {
    schemaVersion: 1,
    worldId,
    revision,
    serverTime: 2000,
    expiresAt: 10000,
    bounds: { west: 28, south: 25, east: 40, north: 36 },
    layers: {
      cities: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'cairo',
            geometry: { type: 'Point', coordinates: [31.2357, 30.0444] },
            properties: {
              kind: 'city',
              name: 'القاهرة',
              regionId: 'egypt',
              ownerPlayerId: 'viewer',
              ownerSultanateId: null,
              fortificationLevel: 4,
              strategicValue: 90,
            },
          },
        ],
      },
      castles: empty,
      armies: empty,
      armyRoutes: empty,
      territories: empty,
      sultanateBorders: empty,
      sieges: empty,
      visibility: empty,
      fog: empty,
    },
  };
}

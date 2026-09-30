import type { MapPayload } from '@mamluk/world-map-core';
import type { MapLibrePort } from '../src/adapter';

export class FakeMap {
  ready = true;
  projection = 'mercator';
  layers = new Set<string>();
  sources = new Map<string, { type: 'geojson'; data: any; setData: (data: any) => void }>();
  listeners = new Map<string, Set<() => void>>();
  bounds = { west: 170, east: 190, south: -10, north: 10 };
  port(): MapLibrePort {
    return this as unknown as MapLibrePort;
  }
  isStyleLoaded() {
    return this.ready;
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  getLayer(id: string) {
    return this.layers.has(id);
  }
  addSource(id: string, source: { type: 'geojson'; data: any }) {
    this.sources.set(id, {
      ...source,
      setData: (data: any) => {
        this.sources.get(id)!.data = data;
      },
    });
  }
  addLayer(layer: { id: string }) {
    this.layers.add(layer.id);
  }
  removeLayer(id: string) {
    this.layers.delete(id);
  }
  removeSource(id: string) {
    this.sources.delete(id);
  }
  setProjection(value: { type: string }) {
    this.projection = value.type;
  }
  setStyle() {
    this.sources.clear();
    this.layers.clear();
    this.ready = false;
  }
  on(event: string, listener: () => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }
  off(event: string, listener: () => void) {
    this.listeners.get(event)?.delete(listener);
  }
  fire(event: string) {
    this.listeners.get(event)?.forEach((listener) => listener());
  }
  project(value: [number, number]) {
    return { x: value[0], y: value[1] };
  }
  unproject(value: [number, number]) {
    return { lng: value[0], lat: value[1] };
  }
  getBounds() {
    return {
      getWest: () => this.bounds.west,
      getEast: () => this.bounds.east,
      getSouth: () => this.bounds.south,
      getNorth: () => this.bounds.north,
    };
  }
  data(name: string) {
    return this.sources.get(`mamluk-${name}`)?.data ?? { type: 'FeatureCollection', features: [] };
  }
}

export function payload(revision = '1', army = false): MapPayload {
  const empty = { type: 'FeatureCollection' as const, features: [] };
  return {
    schemaVersion: 1,
    worldId: 'world',
    revision,
    serverTime: 1000,
    expiresAt: 11000,
    bounds: { west: 20, east: 40, south: 20, north: 40 },
    layers: {
      cities: empty,
      castles: empty,
      territories: empty,
      sultanateBorders: empty,
      armies: {
        type: 'FeatureCollection',
        features: army
          ? [
              {
                type: 'Feature',
                id: 'army',
                geometry: { type: 'Point', coordinates: [31, 30] },
                properties: { armyId: 'army', status: 'moving' },
              },
            ]
          : [],
      },
      armyRoutes: empty,
      sieges: empty,
      visibility: empty,
      fog: empty,
    },
  };
}

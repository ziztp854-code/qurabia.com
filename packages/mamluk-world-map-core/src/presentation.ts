import type { FeatureCollection } from './geojson';
import type { BoundingBox, Coordinates } from './models';

export interface MapLayers {
  readonly cities: FeatureCollection;
  readonly castles: FeatureCollection;
  readonly territories: FeatureCollection;
  readonly sultanateBorders: FeatureCollection;
  readonly armies: FeatureCollection;
  readonly armyRoutes: FeatureCollection;
  readonly sieges: FeatureCollection;
  readonly visibility: FeatureCollection;
  readonly fog: FeatureCollection;
}
export interface MapPayload {
  readonly schemaVersion: 1;
  readonly worldId: string;
  readonly revision: string;
  readonly serverTime: number;
  readonly expiresAt: number;
  readonly bounds: BoundingBox;
  readonly layers: MapLayers;
}
export type MapProjection = 'globe' | 'mercator';
/** Presentation only. No methods can compute or mutate game state. */
export interface MapProjectionAdapter {
  setProjection(projection: MapProjection): void;
  project(coordinates: Coordinates): { readonly x: number; readonly y: number };
  unproject(point: { readonly x: number; readonly y: number }): Coordinates;
  getViewportBounds(): BoundingBox;
  render(payload: MapPayload): void;
  clear(): void;
  dispose(): void;
}

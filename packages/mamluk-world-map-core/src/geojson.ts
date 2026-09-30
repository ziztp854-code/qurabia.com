/** RFC 7946 / WGS84: longitude first, latitude second; no screen coordinates. */
export type Position = readonly [longitude: number, latitude: number];
export interface PointGeometry {
  readonly type: 'Point';
  readonly coordinates: Position;
}
export interface LineStringGeometry {
  readonly type: 'LineString';
  readonly coordinates: readonly Position[];
}
export interface MultiLineStringGeometry {
  readonly type: 'MultiLineString';
  readonly coordinates: readonly (readonly Position[])[];
}
export interface PolygonGeometry {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly Position[])[];
}
export interface MultiPolygonGeometry {
  readonly type: 'MultiPolygon';
  readonly coordinates: readonly (readonly (readonly Position[])[])[];
}
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;
export type Geometry = PointGeometry | LineStringGeometry | MultiLineStringGeometry | AreaGeometry;
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export interface Feature<G extends Geometry = Geometry, P = Readonly<Record<string, JsonValue>>> {
  readonly type: 'Feature';
  readonly id: string;
  readonly geometry: G;
  readonly properties: P;
}
export interface FeatureCollection<
  G extends Geometry = Geometry,
  P = Readonly<Record<string, JsonValue>>,
> {
  readonly type: 'FeatureCollection';
  readonly features: readonly Feature<G, P>[];
}

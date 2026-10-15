import type { GeoJSONSource, Source } from 'maplibre-gl';
import type { FeatureCollection, Geometry } from '@mamluk/world-map-core';
import type { FeatureCollection as SdkCollection, Geometry as SdkGeometry } from 'geojson';

type SdkGeoJson = Parameters<GeoJSONSource['setData']>[0];
type SdkFeature = SdkCollection['features'][number];
export type NullableCollection = Omit<SdkCollection, 'features'> & {
  features: (Omit<SdkFeature, 'geometry'> & { geometry: SdkGeometry | null })[];
};

export const SDK_FEATURE_ID = '__mamlukFeatureId';

/** Copy immutable domain coordinates at the mutable SDK boundary. */
function sdkGeometry(geometry: Geometry | SdkGeometry): SdkGeometry {
  switch (geometry.type) {
    case 'Point':
      return { ...geometry, coordinates: [...geometry.coordinates] };
    case 'MultiPoint':
    case 'LineString':
      return { ...geometry, coordinates: geometry.coordinates.map((point) => [...point]) };
    case 'MultiLineString':
    case 'Polygon':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((line) => line.map((point) => [...point])),
      };
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((line) => line.map((point) => [...point])),
        ),
      };
    case 'GeometryCollection':
      return { ...geometry, geometries: geometry.geometries.map(sdkGeometry) };
  }
}

export function sdkFeatureCollection(
  data: FeatureCollection | SdkCollection,
): SdkCollection;
export function sdkFeatureCollection(
  data: FeatureCollection | NullableCollection,
): NullableCollection;
export function sdkFeatureCollection(
  data: FeatureCollection | NullableCollection,
): NullableCollection {
  return {
    ...data,
    features: data.features.map((feature) => ({
      ...feature,
      geometry: feature.geometry === null ? null : sdkGeometry(feature.geometry),
    })),
  };
}

/** GeoJSON-vt serializes feature.id numerically; promotion preserves domain string IDs. */
export function withFeatureIdentity(data: SdkGeoJson): SdkGeoJson {
  if (typeof data === 'string' || data.type !== 'FeatureCollection') return data;
  return {
    ...data,
    features: data.features.map((feature) => ({
      ...feature,
      properties: { ...feature.properties, [SDK_FEATURE_ID]: feature.id },
    })),
  };
}

/** Keep every SDK receiver bound while enriching subsequent setData copies. */
export function withSourceIdentity<T extends Source>(
  source: T,
  present: (data: SdkGeoJson) => SdkGeoJson = (data) => data,
): T {
  if (source.type !== 'geojson') return source;
  return new Proxy(source, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === 'setData' && typeof value === 'function') {
        return (data: SdkGeoJson) =>
          Reflect.apply(value, target, [withFeatureIdentity(present(data))]);
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

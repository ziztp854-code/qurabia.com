import type { GeoJSONSource, Source } from 'maplibre-gl';
import type { Feature } from '@mamluk/world-map-core';

type SdkGeoJson = Parameters<GeoJSONSource['setData']>[0];

export const SDK_FEATURE_ID = '__mamlukFeatureId';

/** GeoJSON-vt serializes feature.id numerically; promotion preserves domain string IDs. */
export function withFeatureIdentity(data: SdkGeoJson): SdkGeoJson {
  if (typeof data === 'string' || data.type !== 'FeatureCollection') return data;
  return {
    ...data,
    features: data.features.map((feature: Feature) => ({
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

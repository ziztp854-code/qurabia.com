// Test-only witness of the real SDK source and rendered markers; never imported by app routes.
import { Map as LibreMap } from 'maplibre-gl';
declare global {
  interface Window {
    __abandonedMap?: {
      snapshot: () => { count: number; ids: string[]; selectedIds: string[] };
      point: () => { x: number; y: number } | null;
    };
  }
}
const original = LibreMap.prototype.addControl;
LibreMap.prototype.addControl = function (...args: Parameters<typeof original>) {
  const result = original.apply(this, args);
  window.__abandonedMap = {
    snapshot: () => {
      const source = this.getStyle().sources['abandoned-villages'];
      const data = source?.type === 'geojson' ? source.data : undefined;
      if (!data || typeof data === 'string' || data.type !== 'FeatureCollection')
        return { count: 0, ids: [], selectedIds: [] };
      return {
        count: data.features.length,
        ids: data.features.map((feature: { id?: string | number }) => String(feature.id)),
        selectedIds: data.features
          .filter(
            (feature: { properties?: { selected?: unknown } }) =>
              feature.properties?.selected === true,
          )
          .map((feature: { id?: string | number }) => String(feature.id)),
      };
    },
    point: () => {
      const feature = this.queryRenderedFeatures(undefined, { layers: ['abandoned-markers'] }).find(
        (feature) => feature.geometry.type === 'Point',
      );
      if (!feature || feature.geometry.type !== 'Point') return null;
      const point = this.project([
        feature.geometry.coordinates[0]!,
        feature.geometry.coordinates[1]!,
      ]);
      return { x: point.x, y: point.y };
    },
  };
  return result;
};

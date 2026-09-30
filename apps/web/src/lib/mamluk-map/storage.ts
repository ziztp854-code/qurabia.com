import type {
  Army,
  AreaGeometry,
  BoundingBox,
  Castle,
  City,
  SiegeMarker,
  SultanateTerritory,
  Territory,
  VisibilityRegion,
} from '@mamluk/world-map-core';
import { validateArea, validateCoordinates } from '@mamluk/world-map-core/server';

export interface StoredMapRecord<T> extends BoundingBox {
  readonly value: T;
}
export interface StoredVisibilityGrant {
  readonly region: VisibilityRegion;
  readonly visibleTerritoryIds: readonly string[];
  readonly visibleSultanateTerritoryIds: readonly string[];
}
/** Optional geographic read model inside the existing authoritative KingdomWorld.state aggregate. */
export interface MamlukMapState {
  readonly version: 1;
  readonly cities: readonly StoredMapRecord<City>[];
  readonly castles: readonly StoredMapRecord<Castle>[];
  readonly territories: readonly StoredMapRecord<Territory>[];
  readonly sultanateTerritories: readonly StoredMapRecord<SultanateTerritory>[];
  readonly armies: readonly StoredMapRecord<Army>[];
  readonly sieges: readonly StoredMapRecord<SiegeMarker>[];
  readonly visibility: readonly StoredMapRecord<StoredVisibilityGrant>[];
}

type StorableMapValue =
  City | Castle | Territory | SultanateTerritory | Army | SiegeMarker | StoredVisibilityGrant;

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function geographicExtent(geometry: AreaGeometry): BoundingBox {
  validateArea(geometry);
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const intervals = polygons
    .map((polygon) => {
      const longitudes = polygon[0]!.map((point) => point[0]);
      return { west: Math.min(...longitudes), east: Math.max(...longitudes) };
    })
    .sort((a, b) => a.west - b.west);
  const merged = intervals.reduce<{ west: number; east: number }[]>((result, interval) => {
    const last = result.at(-1);
    return !last || interval.west > last.east
      ? [...result, interval]
      : [...result.slice(0, -1), { west: last.west, east: Math.max(last.east, interval.east) }];
  }, []);
  const gaps = merged.map((interval, index) => ({
    length:
      merged[(index + 1) % merged.length]!.west +
      (index === merged.length - 1 ? 360 : 0) -
      interval.east,
    west: merged[(index + 1) % merged.length]!.west,
    east: interval.east,
  }));
  const gap = gaps.reduce(
    (largest, item) => (item.length > largest.length ? item : largest),
    gaps[0]!,
  );
  const latitudes = polygons.flatMap((polygon) => polygon[0]!.map((point) => point[1]));
  return {
    west: gap.length > 0 ? gap.west : -180,
    east: gap.length > 0 ? gap.east : 180,
    south: Math.min(...latitudes),
    north: Math.max(...latitudes),
  };
}

function extentOf(value: StorableMapValue): BoundingBox {
  if ('region' in value) return geographicExtent(value.region.geometry);
  if ('geometry' in value) return geographicExtent(value.geometry);
  const point = 'position' in value ? value.position : value;
  validateCoordinates(point);
  return {
    west: point.longitude,
    east: point.longitude,
    south: point.latitude,
    north: point.latitude,
  };
}

function validateExtent(bounds: BoundingBox): void {
  validateCoordinates({ longitude: bounds.west, latitude: bounds.south });
  validateCoordinates({ longitude: bounds.east, latitude: bounds.north });
  if (bounds.south > bounds.north) throw new RangeError('Invalid stored geographic extent');
}

function longitudeIntervals(bounds: BoundingBox): readonly (readonly [number, number])[] {
  return bounds.west > bounds.east
    ? [
        [bounds.west, 180],
        [-180, bounds.east],
      ]
    : [[bounds.west, bounds.east]];
}

function includesExtent(outer: BoundingBox, inner: BoundingBox): boolean {
  const outerIntervals = longitudeIntervals(outer);
  return (
    outer.south <= inner.south &&
    outer.north >= inner.north &&
    longitudeIntervals(inner).every(([west, east]) =>
      outerIntervals.some(
        ([outerWest, outerEast]) =>
          (outerWest <= west && outerEast >= east) ||
          (west === east && Math.abs(west) === 180 && outerWest <= -west && outerEast >= -east),
      ),
    )
  );
}

/** Zero-area point extents are valid storage indexes; viewport requests must have positive area. */
export function storeMapRecord<T extends StorableMapValue>(
  value: T,
  bounds?: BoundingBox,
): StoredMapRecord<T> {
  const actual = extentOf(value);
  const extent = bounds ?? actual;
  validateExtent(extent);
  if (!includesExtent(extent, actual))
    throw new RangeError('Stored extent must include its geographic feature');
  return freeze({ ...extent, value: structuredClone(value) });
}

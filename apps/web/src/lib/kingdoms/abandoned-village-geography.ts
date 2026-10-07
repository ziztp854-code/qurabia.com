import { z } from 'zod';
import { abandonedRegions, type AbandonedRegion } from './abandoned-village-types';

export type GeographicPoint = Readonly<{ longitude: number; latitude: number }>;
type Coordinate = readonly [number, number];
type Polygon = readonly (readonly Coordinate[])[];
type Bounds = Readonly<{ west: number; south: number; east: number; north: number }>;
export interface AbandonedGeographicMask {
  readonly version: string;
  readonly bounds: Bounds;
  readonly countries: readonly {
    readonly code: string;
    readonly region: AbandonedRegion;
    readonly polygons: readonly Polygon[];
  }[];
  readonly land: readonly Polygon[];
  readonly water: readonly Polygon[];
}
const coordinateSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
const polygonSchema = z.array(z.array(coordinateSchema).min(4).max(400000)).min(1).max(5000);
const maskSchema = z.object({
  version: z.string().min(1).max(200),
  bounds: z
    .object({
      west: z.number().finite().min(-180).max(180),
      east: z.number().finite().min(-180).max(180),
      south: z.number().finite().min(-90).max(90),
      north: z.number().finite().min(-90).max(90),
    })
    .refine((bounds) => bounds.west < bounds.east && bounds.south < bounds.north),
  countries: z
    .array(
      z.object({
        code: z.string().min(1).max(10),
        region: z.enum(abandonedRegions),
        polygons: z.array(polygonSchema).max(5000),
      }),
    )
    .max(32),
  land: z.array(polygonSchema).max(5000),
  water: z.array(polygonSchema).max(5000),
});
export const parseAbandonedGeographicMask = (input: unknown) => maskSchema.parse(input);
export const ABANDONED_COAST_BUFFER_KM = 5;
export const ABANDONED_SITE_SEPARATION_KM = 20;
export const ABANDONED_PLAYER_SEPARATION_KM = 2;

const radians = (value: number) => (value * Math.PI) / 180;
export function geographicDistanceKm(a: GeographicPoint, b: GeographicPoint): number {
  const dLatitude = radians(b.latitude - a.latitude);
  const dLongitude = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLongitude / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function ringContains(ring: readonly Coordinate[], point: GeographicPoint): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (
      a[1] > point.latitude !== b[1] > point.latitude &&
      point.longitude < ((b[0] - a[0]) * (point.latitude - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function contains(polygon: Polygon, point: GeographicPoint): boolean {
  return (
    ringContains(polygon[0]!, point) && !polygon.slice(1).some((ring) => ringContains(ring, point))
  );
}
function boundsOf(polygon: Polygon): Bounds {
  return polygon[0]!.reduce(
    (bounds, [x, y]) => ({
      west: Math.min(bounds.west, x),
      east: Math.max(bounds.east, x),
      south: Math.min(bounds.south, y),
      north: Math.max(bounds.north, y),
    }),
    { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity },
  );
}
function inBounds(bounds: Bounds, point: GeographicPoint): boolean {
  return (
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east &&
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north
  );
}

/** Local tangent-plane segment distance; conservative 5km inset avoids shoreline ambiguity. */
function boundaryDistanceKm(polygon: Polygon, point: GeographicPoint): number {
  const xScale = 111.195 * Math.cos(radians(point.latitude)),
    yScale = 111.195;
  let closest = Infinity;
  for (const ring of polygon)
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!,
        b = ring[i]!;
      const ax = (a[0] - point.longitude) * xScale,
        ay = (a[1] - point.latitude) * yScale;
      const bx = (b[0] - point.longitude) * xScale,
        by = (b[1] - point.latitude) * yScale;
      const dx = bx - ax,
        dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      closest = Math.min(closest, Math.hypot(ax + t * dx, ay + t * dy));
    }
  return closest;
}

function indexed(polygons: readonly Polygon[]) {
  return polygons.map((polygon) => ({ polygon, bounds: boundsOf(polygon) }));
}

/** Server provisioning injects a geographic snapshot; client game bundles use DTOs only. */
export function abandonedPlacementDomain(input: unknown) {
  const mask = parseAbandonedGeographicMask(input);
  if (
    !mask.version ||
    mask.land.length > 5000 ||
    mask.water.length > 5000 ||
    mask.countries.length > 32
  )
    throw new Error('Geographic mask budget exceeded');
  let coordinates = 0;
  for (const polygon of [
    ...mask.land,
    ...mask.water,
    ...mask.countries.flatMap((country) => country.polygons),
  ]) {
    if (!polygon.length) throw new Error('Empty geographic polygon');
    for (const ring of polygon) {
      if (ring.length < 4 || ring[0]![0] !== ring.at(-1)![0] || ring[0]![1] !== ring.at(-1)![1])
        throw new Error('Invalid geographic ring');
      for (const [x, y] of ring) {
        if (
          ++coordinates > 400000 ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          Math.abs(x) > 180 ||
          Math.abs(y) > 90
        )
          throw new Error('Invalid geographic coordinate budget');
      }
    }
  }
  const land = indexed(mask.land),
    water = indexed(mask.water);
  const countries = mask.countries.map((country) => ({
    ...country,
    indexed: indexed(country.polygons),
  }));
  const matching = (items: ReturnType<typeof indexed>, point: GeographicPoint) =>
    items.find((item) => inBounds(item.bounds, point) && contains(item.polygon, point));
  return {
    version: mask.version,
    bounds: mask.bounds,
    locate(point: GeographicPoint, region?: AbandonedRegion) {
      if (
        !Number.isFinite(point.longitude) ||
        !Number.isFinite(point.latitude) ||
        !inBounds(mask.bounds, point)
      )
        return null;
      const country = countries.find(
        (country) => (!region || country.region === region) && matching(country.indexed, point),
      );
      if (!country || matching(water, point)) return null;
      const onLand = matching(land, point);
      if (!onLand) return null;
      const clearanceKm = boundaryDistanceKm(onLand.polygon, point);
      return clearanceKm >= ABANDONED_COAST_BUFFER_KM
        ? { countryCode: country.code, region: country.region, clearanceKm }
        : null;
    },
  };
}
export type AbandonedPlacementDomain = ReturnType<typeof abandonedPlacementDomain>;

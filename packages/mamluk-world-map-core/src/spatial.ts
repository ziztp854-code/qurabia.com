import type { BoundingBox, Coordinates } from './models';
import type {
  AreaGeometry,
  LineStringGeometry,
  MultiLineStringGeometry,
  Position,
} from './geojson';
import { difference, intersection, union, type MultiPolygon } from 'polygon-clipping';

const EPSILON = 1e-10;
type Ring = readonly Position[];
type AreaPolygon = readonly Ring[];

function polygonsOf(geometry: AreaGeometry): readonly AreaPolygon[] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function clippingInput(geometry: AreaGeometry): MultiPolygon {
  return polygonsOf(geometry).map((polygon) =>
    polygon.map((ring) => ring.map((point) => [point[0], point[1]])),
  );
}

export function validateCoordinates(value: Coordinates): void {
  if (
    !value ||
    !Number.isFinite(value.longitude) ||
    !Number.isFinite(value.latitude) ||
    value.longitude < -180 ||
    value.longitude > 180 ||
    value.latitude < -90 ||
    value.latitude > 90
  ) {
    throw new RangeError('Coordinates must be finite WGS84 longitude / latitude values.');
  }
}

export function coordinates(longitude: number, latitude: number): Coordinates {
  const value = { longitude, latitude };
  validateCoordinates(value);
  return Object.freeze(value);
}

export function validateBounds(bounds: BoundingBox): void {
  if (!bounds) throw new RangeError('A bounding box is required.');
  validateCoordinates({ longitude: bounds.west, latitude: bounds.south });
  validateCoordinates({ longitude: bounds.east, latitude: bounds.north });
  if (
    bounds.south >= bounds.north ||
    bounds.west === bounds.east ||
    (bounds.west === 180 && bounds.east === -180)
  ) {
    throw new RangeError('Bounding boxes must have positive geographic area.');
  }
}

export function containsPoint(bounds: BoundingBox, point: Coordinates): boolean {
  validateBounds(bounds);
  validateCoordinates(point);
  if (point.latitude < bounds.south || point.latitude > bounds.north) return false;
  const containsLongitude = (longitude: number) =>
    bounds.west <= bounds.east
      ? longitude >= bounds.west && longitude <= bounds.east
      : longitude >= bounds.west || longitude <= bounds.east;
  return (
    containsLongitude(point.longitude) ||
    (Math.abs(point.longitude) === 180 && containsLongitude(-point.longitude))
  );
}

function rectangle(
  west: number,
  east: number,
  south: number,
  north: number,
): readonly Position[][] {
  return [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ];
}

/** Geographic boxes crossing the dateline are represented as seam-safe polygons. */
export function boundsGeometry(bounds: BoundingBox): AreaGeometry {
  validateBounds(bounds);
  const intervals =
    bounds.west > bounds.east
      ? [
          [bounds.west, 180],
          [-180, bounds.east],
        ]
      : [[bounds.west, bounds.east]];
  const polygons = intervals.flatMap(([west, east]) => {
    if (west === undefined || east === undefined || west === east) return [];
    return east - west > 180
      ? [
          rectangle(west, (west + east) / 2, bounds.south, bounds.north),
          rectangle((west + east) / 2, east, bounds.south, bounds.north),
        ]
      : [rectangle(west, east, bounds.south, bounds.north)];
  });
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0]! }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function signedArea(ring: Ring): number {
  return (
    ring.slice(0, -1).reduce((sum, point, index) => {
      const next = ring[index + 1]!;
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2
  );
}

function polygonArea(polygon: AreaPolygon): number {
  return (
    Math.abs(signedArea(polygon[0]!)) -
    polygon.slice(1).reduce((total, hole) => total + Math.abs(signedArea(hole)), 0)
  );
}

function cross(a: Position, b: Position, point: Position): number {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
}

function onSegment(point: Position, a: Position, b: Position): boolean {
  return (
    Math.abs(cross(a, b, point)) <= EPSILON &&
    point[0] >= Math.min(a[0], b[0]) - EPSILON &&
    point[0] <= Math.max(a[0], b[0]) + EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + EPSILON
  );
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  if (
    Math.max(a[0], b[0]) < Math.min(c[0], d[0]) - EPSILON ||
    Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - EPSILON ||
    Math.max(a[1], b[1]) < Math.min(c[1], d[1]) - EPSILON ||
    Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - EPSILON
  )
    return false;
  const first = cross(a, b, c),
    second = cross(a, b, d);
  const third = cross(c, d, a),
    fourth = cross(c, d, b);
  return (
    (first * second < 0 && third * fourth < 0) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b) ||
    onSegment(a, c, d) ||
    onSegment(b, c, d)
  );
}

/** -1 outside, 0 on the boundary, 1 inside. */
function ringLocation(point: Position, ring: Ring): -1 | 0 | 1 {
  let inside = false;
  for (let index = 0; index < ring.length - 1; index++) {
    const a = ring[index]!,
      b = ring[index + 1]!;
    if (onSegment(point, a, b)) return 0;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside ? 1 : -1;
}

function ringsIntersect(first: Ring, second: Ring): boolean {
  return first
    .slice(0, -1)
    .some((a, index) =>
      second
        .slice(0, -1)
        .some((c, secondIndex) =>
          segmentsIntersect(a, first[index + 1]!, c, second[secondIndex + 1]!),
        ),
    );
}

function ringSelfIntersects(ring: Ring): boolean {
  const edges = ring
    .slice(0, -1)
    .map((start, index) => ({
      start,
      end: ring[index + 1]!,
      index,
      west: Math.min(start[0], ring[index + 1]![0]),
      east: Math.max(start[0], ring[index + 1]![0]),
    }))
    .sort((a, b) => a.west - b.west);
  for (let index = 0; index < edges.length; index++) {
    const edge = edges[index]!;
    for (let other = index + 1; other < edges.length; other++) {
      const candidate = edges[other]!;
      if (candidate.west > edge.east + EPSILON) break;
      const separation = Math.abs(edge.index - candidate.index);
      if (separation === 1 || separation === edges.length - 1) continue;
      if (segmentsIntersect(edge.start, edge.end, candidate.start, candidate.end)) return true;
    }
  }
  return false;
}

function validateRing(ring: Ring): void {
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10_000) {
    throw new RangeError('Area rings require 4 to 10000 closed positions.');
  }
  for (const point of ring) {
    if (!Array.isArray(point) || point.length !== 2)
      throw new RangeError('Area positions must be longitude / latitude pairs.');
    validateCoordinates({ longitude: point[0], latitude: point[1] });
  }
  const first = ring[0]!,
    last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1] || Math.abs(signedArea(ring)) <= EPSILON) {
    throw new RangeError('Area rings must be closed and have nonzero area.');
  }
  for (let index = 0; index < ring.length - 1; index++) {
    const a = ring[index]!,
      b = ring[index + 1]!;
    if (Math.abs(a[0] - b[0]) > 180 || (a[0] === b[0] && a[1] === b[1])) {
      throw new RangeError(
        'Split antimeridian crossings and remove duplicate consecutive positions.',
      );
    }
  }
  if (ringSelfIntersects(ring)) throw new RangeError('Area rings must not self-intersect.');
}

/** Validates seam-safe simple polygons. Either winding is accepted; projection normalizes output. */
export function validateArea(geometry: AreaGeometry): void {
  if (
    !geometry ||
    (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length === 0
  ) {
    throw new RangeError('A nonempty Polygon or MultiPolygon is required.');
  }
  const polygons = polygonsOf(geometry);
  if (polygons.length > 1000) throw new RangeError('An area cannot exceed 1000 polygons.');
  const positionCount = polygons.reduce(
    (total, polygon) => total + polygon.reduce((count, ring) => count + ring.length, 0),
    0,
  );
  if (positionCount > 20_000)
    throw new RangeError('An area cannot exceed 20000 positions in total.');
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0 || polygon.length > 1000)
      throw new RangeError('A polygon must contain a bounded exterior and holes.');
    polygon.forEach(validateRing);
    const exterior = polygon[0]!;
    for (let index = 1; index < polygon.length; index++) {
      const hole = polygon[index]!;
      if (ringLocation(hole[0]!, exterior) !== 1 || ringsIntersect(exterior, hole))
        throw new RangeError('Holes must lie strictly inside their exterior.');
      for (let other = 1; other < index; other++) {
        const previous = polygon[other]!;
        if (
          ringsIntersect(previous, hole) ||
          ringLocation(hole[0]!, previous) !== -1 ||
          ringLocation(previous[0]!, hole) !== -1
        ) {
          throw new RangeError('Polygon holes must not overlap.');
        }
      }
    }
  }
  // The clipping engine also verifies that every area can be processed for viewport/fog projection.
  const normalized = union(clippingInput(geometry));
  if (normalized.length === 0) throw new RangeError('The area must have a nonempty interior.');
  const inputArea = polygons.reduce((total, polygon) => total + polygonArea(polygon), 0);
  const unionArea = normalized.reduce((total, polygon) => total + polygonArea(polygon), 0);
  if (Math.abs(inputArea - unionArea) > EPSILON * Math.max(1, inputArea)) {
    throw new RangeError('MultiPolygon interiors must not overlap.');
  }
}

export function pointInArea(point: Coordinates, geometry: AreaGeometry): boolean {
  validateCoordinates(point);
  validateArea(geometry);
  const positions: Position[] = [[point.longitude, point.latitude]];
  if (Math.abs(point.longitude) === 180) positions.push([-point.longitude, point.latitude]);
  return positions.some((position) =>
    polygonsOf(geometry).some(
      (polygon) =>
        ringLocation(position, polygon[0]!) !== -1 &&
        polygon.slice(1).every((hole) => ringLocation(position, hole) === -1),
    ),
  );
}

/** Prepares a private immutable area snapshot for repeated server visibility checks. */
export function prepareArea(geometry: AreaGeometry): (point: Coordinates) => boolean {
  validateArea(geometry);
  const polygons = Object.freeze(
    polygonsOf(geometry).map((polygon) => {
      const rings = Object.freeze(
        polygon.map((ring) =>
          Object.freeze(ring.map((point) => Object.freeze([point[0], point[1]] as const))),
        ),
      );
      const exterior = rings[0]!;
      return Object.freeze({
        rings,
        west: Math.min(...exterior.map((point) => point[0])),
        east: Math.max(...exterior.map((point) => point[0])),
        south: Math.min(...exterior.map((point) => point[1])),
        north: Math.max(...exterior.map((point) => point[1])),
      });
    }),
  );
  return (point: Coordinates): boolean => {
    validateCoordinates(point);
    const positions: Position[] = [[point.longitude, point.latitude]];
    if (Math.abs(point.longitude) === 180) positions.push([-point.longitude, point.latitude]);
    return positions.some((position) =>
      polygons.some(
        (polygon) =>
          position[0] >= polygon.west - EPSILON &&
          position[0] <= polygon.east + EPSILON &&
          position[1] >= polygon.south - EPSILON &&
          position[1] <= polygon.north + EPSILON &&
          ringLocation(position, polygon.rings[0]!) !== -1 &&
          polygon.rings.slice(1).every((hole) => ringLocation(position, hole) === -1),
      ),
    );
  };
}

function projectedArea(polygons: MultiPolygon): AreaGeometry | null {
  if (polygons.length === 0) return null;
  // Clipping can merge neighboring rectangles into a world-spanning ring. Split again for RFC 7946.
  const safe = polygons.flatMap((polygon) => {
    const longitudes = polygon[0]!.map((point) => point[0]);
    if (Math.max(...longitudes) - Math.min(...longitudes) <= 180) return [polygon];
    return [
      ...intersection(
        polygon,
        clippingInput(boundsGeometry({ west: -180, south: -90, east: 0, north: 90 })),
      ),
      ...intersection(
        polygon,
        clippingInput(boundsGeometry({ west: 0, south: -90, east: 180, north: 90 })),
      ),
    ];
  });
  return safe.length === 1
    ? { type: 'Polygon', coordinates: safe[0]! }
    : { type: 'MultiPolygon', coordinates: safe };
}

export function clipArea(geometry: AreaGeometry, bounds: BoundingBox): AreaGeometry | null {
  validateArea(geometry);
  return projectedArea(
    intersection(clippingInput(geometry), clippingInput(boundsGeometry(bounds))),
  );
}

/** Returns true only for a positive-area intersection, including the geometry's holes. */
export function intersectsBounds(geometry: AreaGeometry, bounds: BoundingBox): boolean {
  return clipArea(geometry, bounds) !== null;
}

/** Server projection: subtracts the union of already-authorized visibility areas from the viewport. */
export function fogGeometry(
  bounds: BoundingBox,
  visibleAreas: readonly AreaGeometry[],
): AreaGeometry | null {
  const viewport = clippingInput(boundsGeometry(bounds));
  visibleAreas.forEach(validateArea);
  const inputs = visibleAreas.map(clippingInput);
  const visible = inputs.length === 0 ? [] : union(inputs[0]!, ...inputs.slice(1));
  return projectedArea(visible.length === 0 ? viewport : difference(viewport, visible));
}

/** Splits visual route segments only. It never derives an authoritative army position or travel time. */
export function lineGeometry(
  points: readonly Coordinates[],
): LineStringGeometry | MultiLineStringGeometry {
  if (points.length < 2) throw new RangeError('Routes require at least two coordinates.');
  points.forEach(validateCoordinates);
  const lines: Position[][] = [];
  let current: Position[] = [[points[0]!.longitude, points[0]!.latitude]];
  for (const point of points.slice(1)) {
    const previous = current[current.length - 1]!;
    const next: Position = [point.longitude, point.latitude];
    const delta = next[0] - previous[0];
    if (Math.abs(delta) <= 180) {
      current.push(next);
      continue;
    }
    const unwrappedLongitude = next[0] + (delta > 180 ? -360 : 360);
    const seam = delta > 180 ? -180 : 180;
    if (unwrappedLongitude === previous[0]) {
      current.push([previous[0], next[1]]);
      continue;
    }
    const fraction = (seam - previous[0]) / (unwrappedLongitude - previous[0]);
    const latitude = previous[1] + fraction * (next[1] - previous[1]);
    if (fraction > 0) current.push([seam, latitude]);
    if (current.length > 1) lines.push(current);
    current = [[-seam, latitude]];
    if (fraction < 1) current.push(next);
  }
  if (current.length > 1) lines.push(current);
  return lines.length === 1
    ? { type: 'LineString', coordinates: lines[0]! }
    : { type: 'MultiLineString', coordinates: lines };
}

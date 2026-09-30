import { describe, expect, it } from 'vitest';
import {
  boundsGeometry,
  containsPoint,
  coordinates,
  validateBounds,
  validateCoordinates,
} from '../src/spatial';
import { pointInArea, prepareArea, validateArea } from '../src/spatial';
import { clipArea, fogGeometry, intersectsBounds } from '../src/spatial';
import { lineGeometry } from '../src/spatial';
import type { AreaGeometry, Position } from '../src/geojson';

const ring = (west: number, south: number, east: number, north: number): readonly Position[] => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
];
const area = (west: number, south: number, east: number, north: number): AreaGeometry => ({
  type: 'Polygon',
  coordinates: [ring(west, south, east, north)],
});
const withHole: AreaGeometry = {
  type: 'Polygon',
  coordinates: [ring(0, 0, 10, 10), ring(3, 3, 7, 7)],
};

describe('WGS84 longitude / latitude coordinates', () => {
  it('preserves Cairo real-world coordinates as immutable values', () => {
    const point = coordinates(31.2357, 30.0444);
    expect(point).toEqual({ longitude: 31.2357, latitude: 30.0444 });
    expect(Object.isFrozen(point)).toBe(true);
    expect(() => validateCoordinates(point)).not.toThrow();
  });

  it.each([
    [181, 0],
    [-181, 0],
    [0, 91],
    [0, -91],
    [NaN, 0],
    [0, Infinity],
  ])('rejects invalid coordinate (%s, %s)', (longitude, latitude) => {
    expect(() => coordinates(longitude, latitude)).toThrow();
  });
});

describe('territory and visibility areas', () => {
  it('includes exterior boundaries but excludes holes and their boundaries', () => {
    expect(() => validateArea(withHole)).not.toThrow();
    expect(pointInArea(coordinates(1, 1), withHole)).toBe(true);
    expect(pointInArea(coordinates(0, 5), withHole)).toBe(true);
    expect(pointInArea(coordinates(5, 5), withHole)).toBe(false);
    expect(pointInArea(coordinates(3, 5), withHole)).toBe(false);
    expect(pointInArea(coordinates(20, 5), withHole)).toBe(false);
  });

  it('accepts either ring winding and a seam-safe world or dateline polygon', () => {
    const reversed = { type: 'Polygon', coordinates: [[...ring(0, 0, 5, 5)].reverse()] } as const;
    expect(pointInArea(coordinates(1, 1), reversed)).toBe(true);
    expect(() =>
      validateArea(boundsGeometry({ west: -180, east: 180, south: -90, north: 90 })),
    ).not.toThrow();
    const dateline = boundsGeometry({ west: 170, east: -170, south: -10, north: 10 });
    expect(pointInArea(coordinates(-180, 0), dateline)).toBe(true);
    expect(pointInArea(coordinates(180, 0), area(-180, -10, -170, 10))).toBe(true);
  });

  it.each<AreaGeometry>([
    { type: 'Polygon', coordinates: [] },
    { type: 'MultiPolygon', coordinates: [] },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [0, 0],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [0, 0],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 2],
          [0, 2],
          [2, 0],
          [0, 0],
        ],
      ],
    },
    { type: 'Polygon', coordinates: [ring(170, -10, -170, 10)] },
    { type: 'Polygon', coordinates: [ring(0, 0, 181, 1)] },
    { type: 'Polygon', coordinates: [ring(0, 0, 10, 10), ring(20, 20, 30, 30)] },
    { type: 'Polygon', coordinates: [ring(0, 0, 10, 10), ring(1, 1, 5, 5), ring(4, 4, 6, 6)] },
    { type: 'MultiPolygon', coordinates: [[ring(0, 0, 5, 5)], [ring(4, 4, 6, 6)]] },
  ])('rejects malformed, self-crossing, out-of-range, or invalid-hole areas', (value) => {
    expect(() => validateArea(value)).toThrow();
  });

  it('bounds geometry complexity before expensive topology processing', () => {
    const repeated = Array.from({ length: 1001 }, () => [ring(0, 0, 5, 5)]);
    expect(() => validateArea({ type: 'MultiPolygon', coordinates: repeated })).toThrow();
    expect(() =>
      validateArea({
        type: 'Polygon',
        coordinates: Array.from({ length: 1001 }, () => ring(0, 0, 5, 5)),
      }),
    ).toThrow();
    const excessive = Array.from({ length: 9 }, () =>
      Array.from({ length: 500 }, () => ring(0, 0, 5, 5)),
    );
    expect(() => validateArea({ type: 'MultiPolygon', coordinates: excessive })).toThrow();
  });
});

describe('prepared visibility area membership', () => {
  it('preserves hole and boundary rules across repeated membership queries', () => {
    const contains = prepareArea(withHole);
    expect(contains(coordinates(1, 1))).toBe(true);
    expect(contains(coordinates(0, 5))).toBe(true);
    expect(contains(coordinates(5, 5))).toBe(false);
    expect(contains(coordinates(3, 5))).toBe(false);
    expect(contains(coordinates(20, 5))).toBe(false);
    expect(contains(coordinates(5, 20))).toBe(false);
  });

  it('keeps an immutable snapshot when callers mutate their source geometry', () => {
    const positions: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const source = { type: 'Polygon' as const, coordinates: [positions] };
    const contains = prepareArea(source);
    positions[1]![0] = 1;
    source.coordinates.length = 0;
    expect(contains(coordinates(9, 1))).toBe(true);
    expect(contains(coordinates(11, 1))).toBe(false);
  });

  it('preserves dateline equivalents for seam-safe multipart geometry', () => {
    const contains = prepareArea(boundsGeometry({ west: 170, east: -170, south: -10, north: 10 }));
    expect(contains(coordinates(180, 0))).toBe(true);
    expect(contains(coordinates(-180, 0))).toBe(true);
    expect(contains(coordinates(-175, 0))).toBe(true);
    expect(contains(coordinates(0, 0))).toBe(false);
  });

  it('validates the geometry when prepared and coordinates when queried', () => {
    expect(() => prepareArea({ type: 'Polygon', coordinates: [] })).toThrow();
    const contains = prepareArea(withHole);
    expect(() => contains({ longitude: 181, latitude: 0 })).toThrow();
  });
});

describe('viewport geometry and fog projection', () => {
  const viewport = { west: 0, south: 0, east: 10, north: 10 };

  it('uses the polygon itself rather than its bounding rectangle', () => {
    expect(intersectsBounds(withHole, { west: 4, south: 4, east: 6, north: 6 })).toBe(false);
    expect(intersectsBounds(withHole, { west: 1, south: 1, east: 2, north: 2 })).toBe(true);
    expect(intersectsBounds(area(20, 20, 30, 30), viewport)).toBe(false);
    expect(clipArea(area(20, 20, 30, 30), viewport)).toBeNull();
  });

  it('clips territories to the viewport, preserving holes', () => {
    const clipped = clipArea(withHole, { west: 2, south: 2, east: 8, north: 8 })!;
    expect(pointInArea(coordinates(2, 2), clipped)).toBe(true);
    expect(pointInArea(coordinates(1, 1), clipped)).toBe(false);
    expect(pointInArea(coordinates(5, 5), clipped)).toBe(false);
  });

  it('subtracts the union of overlapping visibility grants from fog', () => {
    const fog = fogGeometry(viewport, [area(-5, -5, 6, 6), area(4, 4, 15, 15)])!;
    expect(pointInArea(coordinates(1, 1), fog)).toBe(false);
    expect(pointInArea(coordinates(5, 5), fog)).toBe(false);
    expect(pointInArea(coordinates(9, 9), fog)).toBe(false);
    expect(pointInArea(coordinates(1, 9), fog)).toBe(true);
  });

  it('preserves fog inside visibility holes and returns no fog for a fully visible viewport', () => {
    expect(pointInArea(coordinates(5, 5), fogGeometry(viewport, [withHole])!)).toBe(true);
    expect(fogGeometry(viewport, [area(0, 0, 10, 10)])).toBeNull();
    expect(pointInArea(coordinates(5, 5), fogGeometry(viewport, [])!)).toBe(true);
  });

  it('clips dateline views and keeps world-sized fog seam-safe', () => {
    const bounds = { west: 170, south: -10, east: -170, north: 10 };
    const visible = area(172, -5, 178, 5);
    const fog = fogGeometry(bounds, [visible])!;
    expect(pointInArea(coordinates(175, 0), fog)).toBe(false);
    expect(pointInArea(coordinates(-175, 0), fog)).toBe(true);
    expect(pointInArea(coordinates(0, 0), fog)).toBe(false);
    expect(clipArea(visible, bounds)).not.toBeNull();
    const worldFog = fogGeometry({ west: -180, south: -90, east: 180, north: 90 }, [])!;
    expect(() => validateArea(worldFog)).not.toThrow();
    expect(pointInArea(coordinates(179, 89), worldFog)).toBe(true);
  });
});

describe('presentation route line geometry', () => {
  it('preserves server-issued waypoints without computing movement or duration', () => {
    expect(lineGeometry([coordinates(31, 30), coordinates(32, 31), coordinates(33, 32)])).toEqual({
      type: 'LineString',
      coordinates: [
        [31, 30],
        [32, 31],
        [33, 32],
      ],
    });
  });

  it('splits an eastbound crossing at the actual antimeridian seam', () => {
    expect(lineGeometry([coordinates(170, 0), coordinates(-170, 10)])).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [170, 0],
          [180, 5],
        ],
        [
          [-180, 5],
          [-170, 10],
        ],
      ],
    });
  });

  it('splits westbound crossings and multiple crossings', () => {
    expect(lineGeometry([coordinates(-170, 0), coordinates(170, 10)])).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [-170, 0],
          [-180, 5],
        ],
        [
          [180, 5],
          [170, 10],
        ],
      ],
    });
    expect(
      lineGeometry([coordinates(170, 0), coordinates(-170, 10), coordinates(170, 20)]).type,
    ).toBe('MultiLineString');
  });

  it('handles starting and ending precisely on the seam without degenerate line parts', () => {
    expect(lineGeometry([coordinates(180, 0), coordinates(-170, 10)])).toEqual({
      type: 'LineString',
      coordinates: [
        [-180, 0],
        [-170, 10],
      ],
    });
    expect(lineGeometry([coordinates(170, 0), coordinates(-180, 10)])).toEqual({
      type: 'LineString',
      coordinates: [
        [170, 0],
        [180, 10],
      ],
    });
    expect(
      lineGeometry([coordinates(170, 0), coordinates(180, 10), coordinates(-170, 20)]),
    ).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [170, 0],
          [180, 10],
        ],
        [
          [-180, 10],
          [-170, 20],
        ],
      ],
    });
    expect(lineGeometry([coordinates(180, 0), coordinates(-180, 10)])).toEqual({
      type: 'LineString',
      coordinates: [
        [180, 0],
        [180, 10],
      ],
    });
  });

  it('rejects insufficient points and invalid waypoint coordinates', () => {
    expect(() => lineGeometry([])).toThrow();
    expect(() => lineGeometry([coordinates(0, 0)])).toThrow();
    expect(() => lineGeometry([coordinates(0, 0), { longitude: NaN, latitude: 0 }])).toThrow();
  });
});

describe('viewport bounds', () => {
  it('includes dateline equivalents and excludes points outside the viewport', () => {
    const bounds = { west: 170, east: -170, south: -10, north: 10 };
    expect(containsPoint(bounds, coordinates(175, 0))).toBe(true);
    expect(containsPoint(bounds, coordinates(-175, 0))).toBe(true);
    expect(containsPoint(bounds, coordinates(0, 0))).toBe(false);
    expect(containsPoint(bounds, coordinates(175, 11))).toBe(false);
    expect(
      containsPoint({ west: 170, east: 180, south: -10, north: 10 }, coordinates(-180, 0)),
    ).toBe(true);
    expect(
      containsPoint({ west: -180, east: -170, south: -10, north: 10 }, coordinates(180, 0)),
    ).toBe(true);
  });

  it.each([
    { west: 0, east: 0, south: -1, north: 1 },
    { west: 0, east: 1, south: 1, north: 1 },
    { west: 0, east: 1, south: 2, north: 1 },
    { west: 180, east: -180, south: -1, north: 1 },
    { west: -181, east: 1, south: -1, north: 1 },
    { west: 0, east: 1, south: -91, north: 1 },
    { west: NaN, east: 1, south: -1, north: 1 },
  ])('rejects invalid or zero-area bounds', (bounds) => {
    expect(() => validateBounds(bounds)).toThrow();
  });

  it('splits dateline and full-world bounding polygons at the seam', () => {
    expect(boundsGeometry({ west: 170, east: -170, south: -10, north: 10 })).toEqual({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [170, -10],
            [180, -10],
            [180, 10],
            [170, 10],
            [170, -10],
          ],
        ],
        [
          [
            [-180, -10],
            [-170, -10],
            [-170, 10],
            [-180, 10],
            [-180, -10],
          ],
        ],
      ],
    });
    const world = boundsGeometry({ west: -180, east: 180, south: -90, north: 90 });
    expect(world.type).toBe('MultiPolygon');
  });
});

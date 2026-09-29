export type MapPoint = { x: number; y: number };
export type TerrainKind = 'plain' | 'steppe' | 'forest' | 'hills' | 'mountain';

// Decorative geography is a pure function of world coordinates, never game rules:
// nothing here may feed movement, production, ownership or server state.

export const terrainNames: Record<TerrainKind, string> = {
  plain: 'سهول',
  steppe: 'بادية',
  forest: 'غابة',
  hills: 'تلال',
  mountain: 'جبال',
};

export const HILL_LEVEL = 0.6;
export const MOUNTAIN_LEVEL = 0.69;
const RIVER_SPACING = 18;

function hash(x: number, y: number, salt: number) {
  const noise = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return noise - Math.floor(noise);
}

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function valueNoise(x: number, y: number, salt: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = ease(x - x0);
  const ty = ease(y - y0);
  return lerp(
    lerp(hash(x0, y0, salt), hash(x0 + 1, y0, salt), tx),
    lerp(hash(x0, y0 + 1, salt), hash(x0 + 1, y0 + 1, salt), tx),
    ty,
  );
}

function layered(x: number, y: number, salt: number) {
  return (
    valueNoise(x / 7, y / 7, salt) * 0.6 +
    valueNoise(x / 3.2, y / 3.2, salt + 1) * 0.28 +
    valueNoise(x / 1.4, y / 1.4, salt + 2) * 0.12
  );
}

export function riverY(x: number, band = 0) {
  return (
    Math.sin(x * 0.31 + band * 2.1) * 2.3 +
    Math.sin(x * 0.09 + band * 1.3) * 1.2 +
    x * 0.12 +
    band * RIVER_SPACING
  );
}

function nearestBand(x: number, y: number) {
  return Math.round((y - x * 0.12) / RIVER_SPACING);
}

/** Vertical distance, in cells, from a world point to the closest river centre line. */
export function riverDistance(x: number, y: number) {
  const band = nearestBand(x, y);
  return Math.min(
    Math.abs(y - riverY(x, band - 1)),
    Math.abs(y - riverY(x, band)),
    Math.abs(y - riverY(x, band + 1)),
  );
}

/** River bands whose course can cross the rectangle; each is drawn once as a continuous path. */
export function riverBands(fromX: number, toX: number, fromY: number, toY: number) {
  const first = Math.min(nearestBand(fromX, fromY), nearestBand(toX, fromY)) - 1;
  const last = Math.max(nearestBand(fromX, toY), nearestBand(toX, toY)) + 1;
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

export function elevationAt(x: number, y: number) {
  const valley = Math.max(0, 1 - riverDistance(x, y) / 3.2) * 0.3;
  return layered(x, y, 1) - valley;
}

export function moistureAt(x: number, y: number) {
  const banks = Math.max(0, 1 - riverDistance(x, y) / 4) * 0.18;
  return layered(x + 41, y - 17, 7) + banks;
}

export function terrainAt(x: number, y: number) {
  const elevation = elevationAt(x, y);
  const moisture = moistureAt(x, y);
  const kind: TerrainKind =
    elevation > MOUNTAIN_LEVEL
      ? 'mountain'
      : elevation > HILL_LEVEL
        ? 'hills'
        : moisture > 0.6
          ? 'forest'
          : moisture < 0.42
            ? 'steppe'
            : 'plain';
  return { seed: hash(x, y, 0), elevation, moisture, kind };
}

export function terrainLabel(x: number, y: number) {
  return riverDistance(x, y) < 0.5 ? 'ضفاف النهر' : terrainNames[terrainAt(x, y).kind];
}

type Edge = 0 | 1 | 2 | 3;
const cases: Record<number, [Edge, Edge][]> = {
  1: [[3, 2]],
  2: [[2, 1]],
  3: [[3, 1]],
  4: [[0, 1]],
  5: [
    [3, 0],
    [2, 1],
  ],
  6: [[0, 2]],
  7: [[3, 0]],
  8: [[3, 0]],
  9: [[0, 2]],
  10: [
    [0, 1],
    [3, 2],
  ],
  11: [[0, 1]],
  12: [[3, 1]],
  13: [[2, 1]],
  14: [[3, 2]],
};

/**
 * Marching-squares iso-lines of the decorative elevation field, in SVG units where
 * a cell centre (x, y) sits at ((x - origin.x + 0.5) * unit, (y - origin.y + 0.5) * unit).
 */
export function contourPath(
  origin: MapPoint,
  from: MapPoint,
  cells: number,
  unit: number,
  level: number,
  step = 0.5,
) {
  const count = Math.round(cells / step);
  const values: number[][] = [];
  for (let j = 0; j <= count; j++) {
    const row: number[] = [];
    for (let i = 0; i <= count; i++) row.push(elevationAt(from.x + i * step, from.y + j * step));
    values.push(row);
  }
  const px = (wx: number) => ((wx - origin.x + 0.5) * unit).toFixed(1);
  const py = (wy: number) => ((wy - origin.y + 0.5) * unit).toFixed(1);
  const parts: string[] = [];
  for (let j = 0; j < count; j++) {
    for (let i = 0; i < count; i++) {
      const a = values[j][i];
      const b = values[j][i + 1];
      const c = values[j + 1][i + 1];
      const d = values[j + 1][i];
      const index =
        (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      const segments = cases[index];
      if (!segments) continue;
      const x = from.x + i * step;
      const y = from.y + j * step;
      const t = (p: number, q: number) => (level - p) / (q - p);
      const point = (edge: Edge) =>
        edge === 0
          ? `${px(x + t(a, b) * step)} ${py(y)}`
          : edge === 1
            ? `${px(x + step)} ${py(y + t(b, c) * step)}`
            : edge === 2
              ? `${px(x + t(d, c) * step)} ${py(y + step)}`
              : `${px(x)} ${py(y + t(a, d) * step)}`;
      for (const [start, end] of segments) parts.push(`M${point(start)}L${point(end)}`);
    }
  }
  return parts.join('');
}

export function moveMapCenter(point: MapPoint, dx: number, dy: number, radius: number): MapPoint {
  return {
    x: Math.max(-radius, Math.min(radius, point.x + dx)),
    y: Math.max(-radius, Math.min(radius, point.y + dy)),
  };
}

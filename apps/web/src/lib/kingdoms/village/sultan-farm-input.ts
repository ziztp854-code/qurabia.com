import { farmBeds, farmBedHitPolygon } from './farm-scene-layout';

export type FarmInputPoint = Readonly<{ x: number; y: number }>;
export type FarmPolygonPoint = readonly [number, number];
const FARM_TAP_SLOP = 5;

export function classifyFarmPointerMovement(
  origin: FarmInputPoint,
  current: FarmInputPoint,
): 'tap' | 'drag' {
  return Math.hypot(current.x - origin.x, current.y - origin.y) > FARM_TAP_SLOP
    ? 'drag'
    : 'tap';
}

export function pointInPolygon(
  point: FarmInputPoint,
  polygon: readonly FarmPolygonPoint[],
) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const cross =
      (point.y - a[1]) * (b[0] - a[0]) - (point.x - a[0]) * (b[1] - a[1]);
    if (
      Math.abs(cross) < 1e-6 &&
      point.x >= Math.min(a[0], b[0]) &&
      point.x <= Math.max(a[0], b[0]) &&
      point.y >= Math.min(a[1], b[1]) &&
      point.y <= Math.max(a[1], b[1])
    )
      return true;
    if (
      a[1] > point.y !== b[1] > point.y &&
      point.x < ((b[0] - a[0]) * (point.y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

export function findFarmBedAtPoint(point: FarmInputPoint) {
  for (let id = 0; id < farmBeds.length; id++) {
    if (pointInPolygon(point, farmBedHitPolygon(id))) return id;
  }
  return null;
}

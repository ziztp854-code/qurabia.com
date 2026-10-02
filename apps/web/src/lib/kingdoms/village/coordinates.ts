import type { Building } from '../types';
import type { VillageDebugOptions, WorldPoint, WorldRect } from './types';

// All coordinates refer to the unchanged 1536 × 1024 source artwork.
export const VILLAGE_WORLD = { width: 1536, height: 1024 } as const;
export const buildingPlots = {
  hall: { x: 548, y: 206, width: 474, height: 294 },
  farm: { x: 1120, y: 249, width: 373, height: 214 },
  barracks: { x: 291, y: 406, width: 356, height: 196 },
  market: { x: 1020, y: 589, width: 356, height: 200 },
  warehouse: { x: 985, y: 426, width: 272, height: 186 },
  treasury: { x: 294, y: 625, width: 261, height: 145 },
  embassy: { x: 641, y: 538, width: 315, height: 201 },
  quarry: { x: 76, y: 284, width: 286, height: 145 },
  mine: { x: 305, y: 108, width: 256, height: 179 },
  lumber: { x: 748, y: 84, width: 290, height: 192 },
  wall: { x: 265, y: 741, width: 344, height: 113 },
} as const satisfies Record<Building, WorldRect>;

export const villageRegions = {
  gate: { x: 681, y: 778, width: 151, height: 118 },
  tower: { x: 1361, y: 590, width: 68, height: 109 },
  stable: { x: 454, y: 516, width: 111, height: 67 },
  workshop: { x: 944, y: 247, width: 84, height: 60 },
  research: { x: 936, y: 360, width: 46, height: 60 },
} as const satisfies Record<string, WorldRect>;

export function getBuildingRect(building: Building, debug?: VillageDebugOptions): WorldRect {
  return process.env.NODE_ENV === 'development'
    ? (debug?.rectOverrides?.[building] ?? buildingPlots[building])
    : buildingPlots[building];
}

export function rectCenter(rect: WorldRect): WorldPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function containsPoint(rect: WorldRect, point: WorldPoint): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x <= rect.x + rect.width &&
    point.y <= rect.y + rect.height
  );
}

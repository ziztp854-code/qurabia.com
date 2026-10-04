import type { Building } from '../types';
import type { VillageBuildingId } from './buildingRegistry';
import type { VillageDebugOptions, VillagePlacement, WorldPoint, WorldRect } from './types';

// All coordinates refer to the unchanged 1536 × 1024 source artwork.
export const VILLAGE_WORLD = { width: 1536, height: 1024 } as const;
export const buildingPlots = {
  hall: { x: 548, y: 206, width: 474, height: 294 },
  farm: { x: 1120, y: 249, width: 373, height: 214 },
  barracks: { x: 291, y: 406, width: 356, height: 104 },
  market: { x: 1020, y: 589, width: 356, height: 200 },
  warehouse: { x: 985, y: 426, width: 272, height: 186 },
  treasury: { x: 294, y: 625, width: 261, height: 145 },
  embassy: { x: 641, y: 538, width: 315, height: 201 },
  quarry: { x: 76, y: 284, width: 286, height: 145 },
  mine: { x: 305, y: 108, width: 256, height: 179 },
  lumber: { x: 748, y: 84, width: 290, height: 192 },
  wall: { x: 265, y: 741, width: 344, height: 113 },
} as const satisfies Record<Exclude<Building, 'stable'>, WorldRect>;

export const villageRegions = {
  gate: { x: 681, y: 778, width: 151, height: 118 },
  tower: { x: 1361, y: 590, width: 68, height: 109 },
  stable: { x: 454, y: 516, width: 111, height: 67 },
  workshop: { x: 944, y: 247, width: 84, height: 60 },
  research: { x: 936, y: 360, width: 46, height: 60 },
} as const satisfies Record<string, WorldRect>;

// Reserved placements do not create visible or interactive buildings without approved assets.
export const villageBuildingPlots = {
  ...buildingPlots,
  stable: villageRegions.stable,
  gate: villageRegions.gate,
  tower: villageRegions.tower,
  granary: { x: 1130, y: 456, width: 117, height: 117 },
  caravanserai: { x: 1232, y: 616, width: 130, height: 95 },
  residential: { x: 577, y: 465, width: 74, height: 64 },
  archery: { x: 350, y: 435, width: 104, height: 67 },
  blacksmith: villageRegions.workshop,
  siege: { x: 459, y: 351, width: 120, height: 68 },
  rally: { x: 291, y: 516, width: 153, height: 86 },
  hospital: { x: 901, y: 620, width: 77, height: 65 },
  knowledge: villageRegions.research,
  citadel: { x: 837, y: 271, width: 148, height: 128 },
  mosque: { x: 662, y: 576, width: 181, height: 159 },
  madrasa: { x: 861, y: 573, width: 69, height: 62 },
  courthouse: { x: 1011, y: 459, width: 147, height: 101 },
  hammam: { x: 461, y: 644, width: 70, height: 77 },
  traders: { x: 1061, y: 657, width: 130, height: 90 },
  industry: { x: 580, y: 186, width: 104, height: 89 },
} as const satisfies Record<VillageBuildingId, WorldRect>;

export function getVillageRect(id: VillageBuildingId, debug?: VillageDebugOptions): WorldRect {
  return process.env.NODE_ENV === 'development'
    ? (debug?.rectOverrides?.[id] ?? villageBuildingPlots[id])
    : villageBuildingPlots[id];
}

export function getVillagePlacement(
  id: VillageBuildingId,
  debug?: VillageDebugOptions,
): VillagePlacement {
  const rect = getVillageRect(id, debug);
  const center = rectCenter(rect);
  const overrides =
    process.env.NODE_ENV === 'development' ? debug?.placementOverrides?.[id] : undefined;
  return {
    ...rect,
    focusX: center.x,
    focusY: center.y,
    focusScale: 2.4,
    zIndex: rect.y + rect.height,
    ...overrides,
  };
}

export function getBuildingRect(building: Building, debug?: VillageDebugOptions): WorldRect {
  return getVillageRect(building, debug);
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

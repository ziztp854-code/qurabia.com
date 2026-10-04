import type { Building } from '../types';
import type { VillageBuildingId } from './buildingRegistry';
import type { VillageDebugOptions, VillagePlacement, WorldPoint, WorldRect } from './types';

// Logical world coordinates are independent of responsive texture resolution.
export const VILLAGE_WORLD = { width: 1600, height: 900 } as const;
export function fromNormalized(rect: WorldRect): WorldRect {
  return { x: rect.x * VILLAGE_WORLD.width, y: rect.y * VILLAGE_WORLD.height,
    width: rect.width * VILLAGE_WORLD.width, height: rect.height * VILLAGE_WORLD.height };
}
// Calibrated against the NEW master art, not the previous oasis illustration.
export const normalizedBuildingPlots = {
  stable: { x: .625, y: .525, width: .3, height: .16 },
  hall: { x: .39, y: .095, width: .235, height: .225 },
  farm: { x: .765, y: .23, width: .18, height: .09 },
  barracks: { x: .66, y: .33, width: .245, height: .155 },
  market: { x: .055, y: .51, width: .335, height: .175 },
  warehouse: { x: .12, y: .35, width: .23, height: .12 },
  treasury: { x: .235, y: .19, width: .15, height: .135 },
  embassy: { x: .64, y: .205, width: .105, height: .105 },
  quarry: { x: .015, y: .035, width: .16, height: .13 },
  mine: { x: .855, y: .025, width: .13, height: .12 },
  lumber: { x: .085, y: .175, width: .17, height: .105 },
  wall: { x: .12, y: .70, width: .235, height: .11 },
} as const satisfies Record<Building, WorldRect>;
export const buildingPlots = Object.fromEntries(Object.entries(normalizedBuildingPlots)
  .map(([id, rect]) => [id, fromNormalized(rect)])) as Record<Building, WorldRect>;

export const villageRegions = {
  gate: fromNormalized({ x: .408, y: .635, width: .195, height: .2 }),
  tower: fromNormalized({ x: .935, y: .38, width: .045, height: .12 }),
  stable: fromNormalized({ x: .625, y: .525, width: .3, height: .16 }),
  workshop: fromNormalized({ x: .075, y: .205, width: .07, height: .07 }),
  research: fromNormalized({ x: .675, y: .16, width: .05, height: .06 }),
} as const satisfies Record<string, WorldRect>;

// Reserved placements do not create visible or interactive buildings without approved assets.
export const villageBuildingPlots = {
  ...buildingPlots,
  stable: villageRegions.stable,
  gate: villageRegions.gate,
  tower: villageRegions.tower,
  granary: fromNormalized({ x: .275, y: .39, width: .06, height: .07 }),
  caravanserai: fromNormalized({ x: .26, y: .54, width: .08, height: .07 }),
  residential: fromNormalized({ x: .61, y: .24, width: .05, height: .06 }),
  archery: fromNormalized({ x: .82, y: .415, width: .07, height: .06 }),
  blacksmith: villageRegions.workshop,
  siege: fromNormalized({ x: .87, y: .38, width: .05, height: .05 }),
  rally: fromNormalized({ x: .445, y: .405, width: .11, height: .08 }),
  hospital: fromNormalized({ x: .60, y: .32, width: .05, height: .06 }),
  knowledge: villageRegions.research,
  citadel: fromNormalized({ x: .425, y: .13, width: .06, height: .07 }),
  mosque: fromNormalized({ x: .26, y: .495, width: .06, height: .085 }),
  madrasa: fromNormalized({ x: .35, y: .49, width: .04, height: .05 }),
  courthouse: fromNormalized({ x: .59, y: .275, width: .05, height: .05 }),
  hammam: fromNormalized({ x: .23, y: .51, width: .045, height: .045 }),
  traders: fromNormalized({ x: .115, y: .525, width: .075, height: .08 }),
  industry: fromNormalized({ x: .10, y: .18, width: .055, height: .055 }),
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

const touchOrder = [
  'tower',
  'stable',
  'gate',
  'rally',
  'barracks',
  'wall',
  'hall',
  'farm',
  'lumber',
  'quarry',
  'mine',
  'warehouse',
  'market',
  'treasury',
  'embassy',
] as const satisfies readonly VillageBuildingId[];

export function rectsOverlap(a: WorldRect, b: WorldRect, gap = 2) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/**
 * Grows a hit rect toward a screen target without crossing a neighbor's current hit.
 * Visual plots stay in villageBuildingPlots. Callers style the button from this rect.
 */
export function interactionRects(minWorld: number) {
  const current = Object.fromEntries(
    touchOrder.map((id) => [id, { ...villageBuildingPlots[id] }]),
  ) as Record<(typeof touchOrder)[number], WorldRect>;
  const step = 2;
  for (const id of touchOrder) {
    for (let guard = 0; guard < 500; guard += 1) {
      const box = current[id];
      if (box.width >= minWorld && box.height >= minWorld) break;
      const next = { ...box };
      if (next.width < minWorld) {
        next.x -= step / 2;
        next.width += step;
      }
      if (next.height < minWorld) {
        next.y -= step / 2;
        next.height += step;
      }
      if (next.x < 0) {
        next.width += next.x;
        next.x = 0;
      }
      if (next.y < 0) {
        next.height += next.y;
        next.y = 0;
      }
      if (next.x + next.width > VILLAGE_WORLD.width) next.width = VILLAGE_WORLD.width - next.x;
      if (next.y + next.height > VILLAGE_WORLD.height) next.height = VILLAGE_WORLD.height - next.y;
      const blocked = touchOrder.some((other) => other !== id && rectsOverlap(next, current[other]));
      const unchanged = next.x === box.x && next.y === box.y && next.width === box.width && next.height === box.height;
      if (blocked || unchanged) break;
      current[id] = next;
    }
  }
  return current;
}

export function containsPoint(rect: WorldRect, point: WorldPoint): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x <= rect.x + rect.width &&
    point.y <= rect.y + rect.height
  );
}

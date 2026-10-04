import type { Village } from '../types';
import { villageAssets, type VillageNPC } from './assetManifest';
import type { VillageBuildingId } from './buildingRegistry';
import type { WorldPoint } from './types';
import { fromNormalized } from './coordinates';

export type NPCSpawn = Readonly<{
  id: string;
  kind: VillageNPC;
  route: readonly WorldPoint[];
  speed: number;
  delay: number;
}>;
// Routes follow the master artwork; they describe optional visual activity only.
const route = (points: readonly (readonly [number, number])[]): readonly WorldPoint[] =>
  points.map(([x, y]) => {
    const point = fromNormalized({ x, y, width: 0, height: 0 });
    return { x: point.x, y: point.y };
  });
const paths = {
  food: route([[.82, .315], [.74, .33], [.60, .35], [.50, .43], [.36, .45], [.25, .48], [.25, .58], [.36, .45], [.50, .43], [.60, .35], [.74, .33]]),
  trade: route([[.25, .58], [.38, .57], [.48, .53], [.50, .64], [.50, .73], [.50, .64], [.48, .53], [.38, .57]]),
  patrol: route([[.50, .76], [.65, .75], [.84, .73], [.95, .52], [.95, .39], [.84, .73], [.65, .75]]),
  training: route([[.72, .42], [.79, .44], [.86, .43], [.79, .39], [.72, .42]]),
  stable: route([[.77, .61], [.71, .60], [.65, .57], [.70, .55], [.77, .61]]),
  work: route([[.18, .26], [.21, .29], [.28, .32], [.36, .33], [.28, .32], [.21, .29]]),
  construction: route([[.46, .48], [.48, .51], [.51, .51], [.54, .50], [.51, .51], [.48, .51]]),
} as const;

export const villageNPCRoutes = paths;
export type VillageRoadRoute = Readonly<{
  id: string;
  from: VillageBuildingId;
  to: VillageBuildingId;
  path: readonly WorldPoint[];
}>;
// Noninteractive calibration routes; never dispatched as movement commands.
export const villageRoadRoutes: readonly VillageRoadRoute[] = [
  { id: 'palace-market-gate', from: 'hall', to: 'gate',
    path: route([[.50, .29], [.50, .43], [.38, .57], [.25, .58], [.48, .53], [.50, .73]]) },
  { id: 'barracks-stable-rally', from: 'barracks', to: 'rally',
    path: route([[.79, .43], [.77, .61], [.65, .57], [.50, .45]]) },
  { id: 'farm-storage-market', from: 'farm', to: 'market', path: paths.food },
  { id: 'mine-storage', from: 'mine', to: 'warehouse',
    path: route([[.92, .14], [.86, .20], [.76, .32], [.60, .35], [.50, .43], [.25, .42]]) },
];
const pathLengths = new WeakMap<readonly WorldPoint[], readonly number[]>();

function lengthsFor(route: readonly WorldPoint[]) {
  const cached = pathLengths.get(route);
  if (cached) return cached;
  const lengths = route.map((point, i) =>
    Math.hypot(
      route[(i + 1) % route.length].x - point.x,
      route[(i + 1) % route.length].y - point.y,
    ),
  );
  pathLengths.set(route, lengths);
  return lengths;
}

export function createVillageNPCs(village: Village, limit: number): NPCSpawn[] {
  const cavalry = villageAssets.npc.cavalry;
  const riderKind: VillageNPC = cavalry.src || cavalry.frames.length ? 'cavalry' : 'horse';
  const counts: readonly [VillageNPC, keyof typeof paths, number, number][] = [
    [riderKind, 'stable', Math.min(3, Math.max(0, village.troops.rider)), 23],
    ['stableMaster', 'stable', village.buildings.stable > 0 ? 1 : 0, 9],
    ['farmer', 'food', Math.min(7, village.buildings.farm + 1), 15],
    ['merchant', 'trade', Math.min(6, village.buildings.market + 1), 13],
    ['guard', 'patrol', Math.min(5, village.buildings.wall + 1), 11],
    ['soldier', 'training', Math.min(8, village.buildings.barracks * 2), 17],
    ['worker', 'work', Math.min(4, village.buildings.lumber), 12],
    ['cart', 'food', Math.min(3, Math.max(0, village.buildings.farm - 2)), 10],
    ['worker', 'construction', village.build ? 3 : 0, 14],
  ];
  const available = counts.filter(([kind]) => {
    const asset = villageAssets.npc[kind];
    return Boolean(asset.src || asset.frames.length || asset.fallbackCrop);
  });
  const largest = Math.max(0, ...available.map(([, , count]) => count));
  // Round-robin keeps each activity represented without exceeding the existing quality cap.
  return Array.from({ length: largest }, (_, i) =>
    available.flatMap(([kind, route, count, speed]) =>
      i >= count
        ? []
        : [
            {
              id: `${route}-${kind}-${i}`,
              kind,
              route: paths[route],
              speed,
              delay: (i * 1493 + kind.length * 311) % 4200,
            },
          ],
    ),
  )
    .flat()
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function npcPosition(npc: NPCSpawn, elapsedMs: number): WorldPoint & { facing: number } {
  const lengths = lengthsFor(npc.route);
  // Deterministic pauses belong only to presentation and never influence the server simulation.
  const idle = npc.speed * (0.45 + npc.delay / 6000);
  const total = lengths.reduce((sum, length) => sum + length + idle, 0);
  let distance = ((Math.max(0, elapsedMs - npc.delay) / 1000) * npc.speed) % total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (distance <= lengths[i]) {
      const start = npc.route[i];
      const end = npc.route[(i + 1) % npc.route.length];
      const ratio = lengths[i] ? distance / lengths[i] : 0;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
        facing: end.x >= start.x ? 1 : -1,
      };
    }
    distance -= lengths[i];
    if (distance < idle)
      return {
        ...npc.route[(i + 1) % npc.route.length],
        facing: npc.route[(i + 1) % npc.route.length].x >= npc.route[i].x ? 1 : -1,
      };
    distance -= idle;
  }
  return { ...npc.route[0], facing: 1 };
}

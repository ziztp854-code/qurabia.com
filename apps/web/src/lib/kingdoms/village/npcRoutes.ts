import type { Village } from '../types';
import { villageAssets, type VillageNPC } from './assetManifest';
import type { VillageBuildingId } from './buildingRegistry';
import type { WorldPoint } from './types';

export type NPCSpawn = Readonly<{
  id: string;
  kind: VillageNPC;
  route: readonly WorldPoint[];
  speed: number;
  delay: number;
}>;
const paths = {
  food: [
    { x: 1274, y: 469 },
    { x: 1231, y: 484 },
    { x: 1188, y: 579 },
    { x: 1090, y: 597 },
    { x: 1188, y: 647 },
    { x: 1237, y: 700 },
    { x: 1188, y: 725 },
    { x: 1237, y: 700 },
    { x: 1188, y: 647 },
    { x: 1090, y: 597 },
    { x: 1188, y: 579 },
    { x: 1231, y: 484 },
  ],
  trade: [
    { x: 1188, y: 725 },
    { x: 1124, y: 724 },
    { x: 990, y: 794 },
    { x: 844, y: 856 },
    { x: 753, y: 886 },
    { x: 844, y: 856 },
    { x: 990, y: 794 },
    { x: 1124, y: 724 },
  ],
  patrol: [
    { x: 753, y: 832 },
    { x: 880, y: 815 },
    { x: 1030, y: 798 },
    { x: 1260, y: 751 },
    { x: 1395, y: 645 },
    { x: 1260, y: 751 },
    { x: 1030, y: 798 },
    { x: 880, y: 815 },
  ],
  training: [
    { x: 357, y: 515 },
    { x: 438, y: 539 },
    { x: 533, y: 523 },
    { x: 468, y: 503 },
    { x: 406, y: 497 },
  ],
  stable: [
    { x: 510, y: 550 },
    { x: 449, y: 536 },
    { x: 387, y: 516 },
    { x: 438, y: 513 },
    { x: 510, y: 550 },
  ],
  work: [
    { x: 552, y: 249 },
    { x: 614, y: 242 },
    { x: 670, y: 211 },
    { x: 770, y: 183 },
    { x: 670, y: 211 },
    { x: 614, y: 242 },
  ],
  construction: [
    { x: 697, y: 495 },
    { x: 736, y: 514 },
    { x: 780, y: 517 },
    { x: 821, y: 508 },
    { x: 780, y: 517 },
    { x: 736, y: 514 },
  ],
} as const;

export const villageNPCRoutes = paths;
export type VillageRoadRoute = Readonly<{
  id: string;
  from: VillageBuildingId;
  to: VillageBuildingId;
  path: readonly WorldPoint[];
}>;
// Noninteractive asset calibration paths, not movement commands or gameplay roads.
export const villageRoadRoutes: readonly VillageRoadRoute[] = [
  {
    id: 'palace-market-gate',
    from: 'hall',
    to: 'gate',
    path: [
      { x: 786, y: 458 },
      { x: 862, y: 516 },
      { x: 1124, y: 724 },
      { x: 1188, y: 725 },
      { x: 990, y: 794 },
      { x: 753, y: 856 },
    ],
  },
  {
    id: 'barracks-stable-rally',
    from: 'barracks',
    to: 'rally',
    path: [
      { x: 387, y: 516 },
      { x: 449, y: 536 },
      { x: 510, y: 550 },
      { x: 438, y: 513 },
    ],
  },
  {
    id: 'farm-storage-market',
    from: 'farm',
    to: 'market',
    path: [
      { x: 1274, y: 469 },
      { x: 1231, y: 484 },
      { x: 1188, y: 579 },
      { x: 1090, y: 597 },
      { x: 1188, y: 647 },
      { x: 1237, y: 700 },
      { x: 1188, y: 725 },
    ],
  },
  {
    id: 'mine-storage',
    from: 'mine',
    to: 'warehouse',
    path: [
      { x: 552, y: 249 },
      { x: 614, y: 242 },
      { x: 1039, y: 323 },
      { x: 1170, y: 417 },
      { x: 1188, y: 579 },
      { x: 1090, y: 597 },
    ],
  },
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
    ['stableMaster', 'stable', village.buildings.barracks > 0 ? 1 : 0, 9],
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

import type { Village } from '../types';
import type { VillageNPC } from './assetManifest';
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
    { x: 706, y: 786 },
    { x: 758, y: 799 },
    { x: 809, y: 783 },
    { x: 858, y: 802 },
    { x: 809, y: 783 },
    { x: 758, y: 799 },
  ],
  training: [
    { x: 357, y: 515 },
    { x: 438, y: 539 },
    { x: 533, y: 523 },
    { x: 468, y: 503 },
    { x: 406, y: 497 },
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
  const counts: readonly [VillageNPC, keyof typeof paths, number, number][] = [
    ['farmer', 'food', Math.min(7, village.buildings.farm + 1), 15],
    ['merchant', 'trade', Math.min(6, village.buildings.market + 1), 13],
    ['guard', 'patrol', Math.min(5, village.buildings.wall + 1), 11],
    ['soldier', 'training', Math.min(8, village.buildings.barracks * 2), 17],
    ['worker', 'work', Math.min(4, village.buildings.lumber), 12],
    ['horse', 'training', Math.min(3, Math.max(0, village.buildings.barracks - 2)), 23],
    ['cart', 'food', Math.min(3, Math.max(0, village.buildings.farm - 2)), 10],
    ['worker', 'construction', village.build ? 3 : 0, 14],
  ];
  return counts
    .flatMap(([kind, route, count, speed]) =>
      Array.from({ length: count }, (_, i) => ({
        id: `${route}-${kind}-${i}`,
        kind,
        route: paths[route],
        speed,
        delay: (i * 1493 + kind.length * 311) % 4200,
      })),
    )
    .slice(0, Math.max(0, limit));
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

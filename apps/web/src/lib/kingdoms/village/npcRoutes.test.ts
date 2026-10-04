import { describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '../engine';
import { createVillageNPCs, npcPosition } from './npcRoutes';
import { containsPoint, getVillageRect } from './coordinates';
vi.mock('./assetManifest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./assetManifest')>();
  return { ...actual, villageAssets: { ...actual.villageAssets, npc: Object.fromEntries(Object.entries(actual.villageAssets.npc).map(([kind, asset]) => [kind, { ...asset, src: ['cavalry', 'stableMaster'].includes(kind) ? null : `/fixtures/${kind}.webp` }])) } };
});

function confirmedVillage() {
  const now = 1800000000000;
  return projectWorld(
    executeCommand(createWorld(now), 'player', { type: 'found', name: 'اختبار' }, now),
    'player',
    now,
  ).villages[0];
}

describe('visual village routes', () => {
  it('does not invent cavalry from a barracks level when no rider is confirmed', () => {
    const village = confirmedVillage();
    const npcs = createVillageNPCs(
      {
        ...village,
        buildings: { ...village.buildings, barracks: 5 },
        troops: { ...village.troops, rider: 0 },
      },
      40,
    );
    expect(npcs.filter(({ kind }) => kind === 'horse' || kind === 'cavalry')).toEqual([]);
  });

  it('keeps confirmed cavalry at the stable under a low-quality NPC budget', () => {
    const village = confirmedVillage();
    const npcs = createVillageNPCs(
      {
        ...village,
        buildings: { ...village.buildings, farm: 10, market: 10, barracks: 5 },
        troops: { ...village.troops, rider: 2 },
      },
      8,
    );
    expect(npcs).toHaveLength(8);
    const horse = npcs.find(({ kind }) => kind === 'horse');
    expect(horse).toBeDefined();
    expect(containsPoint(getVillageRect('stable'), npcPosition(horse!, 0))).toBe(true);
    expect(npcs.some(({ kind }) => kind === 'stableMaster' || kind === 'cavalry')).toBe(false);
  });

  it('replays visual routes deterministically without changing resources, troops or build state', () => {
    const village = confirmedVillage();
    const snapshot = structuredClone(village);
    const first = createVillageNPCs(village, 14);
    const second = createVillageNPCs(village, 14);
    expect(second).toEqual(first);
    for (const npc of first) {
      expect(Number.isFinite(npcPosition(npc, 7200).x)).toBe(true);
    }
    expect(village).toEqual(snapshot);
    expect(createVillageNPCs(village, 0)).toEqual([]);
  });

  it('moves a visual sprite by elapsed time instead of changing game state', () => {
    const npc = {
      id: 'example',
      kind: 'worker' as const,
      speed: 10,
      delay: 0,
      route: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    expect(npcPosition(npc, 1000)).toEqual({ x: 10, y: 0, facing: 1 });
  });
});

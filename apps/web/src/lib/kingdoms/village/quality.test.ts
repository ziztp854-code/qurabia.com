import { describe, expect, it } from 'vitest';
import { capVillageDpr, resolveVillageQuality } from './quality';
import { createVillageNPCs, npcPosition } from './npcRoutes';
import { createWorld, executeCommand, projectWorld } from '../engine';

describe('village performance and activity', () => {
  it('reduces NPC count and resolution on low memory devices and honors a manual choice', () => {
    expect(resolveVillageQuality('auto', { width: 1920, memory: 2, dpr: 3 })).toMatchObject({
      mode: 'low',
      npcLimit: 10,
      dpr: 1,
      particles: false,
    });
    expect(resolveVillageQuality('auto', { width: 390, memory: 8, dpr: 3 })).toMatchObject({
      mode: 'medium',
      npcLimit: 24,
      dpr: 1.25,
    });
    expect(resolveVillageQuality('high', { width: 390, memory: 2, dpr: 3 })).toMatchObject({
      mode: 'high',
      npcLimit: 40,
      dpr: 1.5,
    });
    expect(resolveVillageQuality('auto', { width: 1920, memory: 8, cores: 12 })).toMatchObject({
      mode: 'high',
      fps: 60,
      dpr: 1,
    });
    expect(resolveVillageQuality('auto', { width: 1920, saveData: true })).toMatchObject({
      mode: 'low',
      fps: 20,
      environment: false,
    });
    expect(resolveVillageQuality('auto', { width: 1920, memory: 4 })).toMatchObject({
      mode: 'medium',
      fps: 30,
    });
    expect(resolveVillageQuality('auto', { width: 1920, cores: 4 })).toMatchObject({
      mode: 'medium',
      fps: 30,
    });
    expect(resolveVillageQuality('auto', { width: 3840, height: 2160, memory: 8, cores: 12, dpr: 2 })).toMatchObject({
      mode: 'ultra',
      npcLimit: 56,
      particles: true,
    });
    expect(resolveVillageQuality('ultra', { width: 3840, height: 2160, dpr: 2 }).dpr).toBe(1);
    expect(resolveVillageQuality('ultra', { width: 1280, height: 720, dpr: 2 }).dpr).toBe(2);
  });
  it('caps DPR by viewport pixel budget so 4K screens do not allocate an unbounded canvas', () => {
    expect(capVillageDpr(2, { width: 3840, height: 2160, dpr: 2 }, 8_000_000, 2.25)).toBe(1);
    expect(capVillageDpr(2, { width: 390, height: 844, dpr: 3 }, 8_000_000, 2.25)).toBe(2);
  });
  it('adds activity from confirmed buildings and cavalry while obeying the device budget', () => {
    const now = 1800000000000;
    const village = projectWorld(
      executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now),
      'p',
      now,
    ).villages[0];
    const before = createVillageNPCs(village, 40);
    const after = createVillageNPCs(
      { ...village, buildings: { ...village.buildings, farm: 5, barracks: 5, market: 5 },
        troops: { ...village.troops, rider: 2 } },
      40,
    );
    expect(after.length).toBeGreaterThan(before.length);
    expect(before.some((npc) => npc.kind === 'horse')).toBe(false);
    expect(after.some((npc) => npc.kind === 'horse')).toBe(true);
    expect(after.some((npc) => npc.kind === 'cart')).toBe(true);
    expect(
      createVillageNPCs(
        { ...village, buildings: { ...village.buildings, farm: 5, barracks: 5 } },
        10,
      ),
    ).toHaveLength(10);
    const npc = after[0];
    expect(npcPosition(npc, 0)).toMatchObject(npc.route[0]);
    expect(npcPosition(npc, 10000)).not.toMatchObject(npc.route[0]);
    expect(createVillageNPCs(village, 0)).toEqual([]);
    expect(createVillageNPCs(village, -10)).toEqual([]);
    expect(
      createVillageNPCs(
        { ...village, build: { building: 'farm', level: 1, endsAt: now + 5000 } },
        40,
      ).filter((model) => model.id.startsWith('construction')),
    ).toHaveLength(3);
  });
  it('waits and turns at waypoints deterministically without changing authoritative village state', () => {
    const npc = {
      id: 'fixed',
      kind: 'farmer' as const,
      speed: 10,
      delay: 0,
      route: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    };
    expect(npcPosition(npc, 500)).toEqual({ x: 5, y: 0, facing: 1 });
    expect(npcPosition(npc, 1100)).toEqual({ x: 10, y: 0, facing: 1 });
    expect(npcPosition(npc, 1950)).toEqual({ x: 5, y: 0, facing: -1 });
    expect(npcPosition(npc, 2900)).toEqual({ x: 0, y: 0, facing: 1 });
    expect(npcPosition(npc, 1950)).toEqual(npcPosition(npc, 1950));
    const delayed = { ...npc, delay: 2000 };
    expect(npcPosition(delayed, 1000)).toEqual({ x: 0, y: 0, facing: 1 });
    expect(npcPosition(delayed, 2500)).toEqual({ x: 5, y: 0, facing: 1 });
  });
});

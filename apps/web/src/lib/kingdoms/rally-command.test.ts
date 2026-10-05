import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand, projectWorld } from './engine';
import { presentRallyCommand } from './rally-command';
import type { IncomingMovementView, Movement } from './types';

const now = 1_800_000_000_000;

function world() {
  const view = projectWorld(
    executeCommand(createWorld(now), 'player', { type: 'found', name: 'اختبار' }, now),
    'player',
    now,
  );
  return view;
}

describe('presentRallyCommand', () => {
  it('treats village troops as the march pool and sorts the nearest hostile threat by severity', () => {
    const view = world();
    const village = {
      ...view.villages[0],
      troops: { guard: 4, rider: 1, scout: 0, settler: 0, archer: 0, mounted_archer: 0, sultan_guard: 0, siege_engineer: 0, siege_tower: 0 },
      training: { unit: 'guard' as const, count: 2, endsAt: now + 10_000 },
    };
    const incoming: IncomingMovementView[] = [
      {
        id: 'later-critical',
        mission: 'attack',
        targetVillageId: village.id,
        arrivesAt: now + 60_000,
      },
      {
        id: 'sooner-danger',
        mission: 'raid',
        targetVillageId: village.id,
        arrivesAt: now + 20 * 60_000,
      },
    ];
    const command = presentRallyCommand({ ...view, incoming }, village);
    expect(command.availableTotal).toBe(5);
    expect(command.garrison.map((row) => row.count)).toEqual([4, 1, 0, 0]);
    expect(command.available.map((row) => row.count)).toEqual([4, 1, 0, 0]);
    expect(command.readiness).toBe('threatened');
    expect(command.nearestThreat?.id).toBe('later-critical');
    expect(command.attacks.map((row) => row.id)).toEqual(['later-critical', 'sooner-danger']);
    expect(command.attacks[0]).not.toHaveProperty('troops');
    expect(command.attacks[0]).not.toHaveProperty('commanderId');
  });

  it('keeps owner composition on owned marches and omits it from redacted incoming rows', () => {
    const view = world();
    const village = view.villages[0];
    const owned: Movement = {
      id: 'own-scout',
      ownerId: 'player',
      sourceId: village.id,
      targetX: village.x + 3,
      targetY: village.y,
      mission: 'scout',
      troops: { guard: 0, rider: 0, scout: 2, settler: 0, archer: 0, mounted_archer: 0, sultan_guard: 0, siege_engineer: 0, siege_tower: 0 },
      departedAt: now,
      arrivesAt: now + 50_000,
      travelMs: 50_000,
      loot: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
      commanderId: 'cmd-1',
    };
    const returning: Movement = {
      ...owned,
      id: 'home',
      mission: 'return',
      targetX: village.x,
      targetY: village.y,
      troops: { guard: 3, rider: 0, scout: 0, settler: 0, archer: 0, mounted_archer: 0, sultan_guard: 0, siege_engineer: 0, siege_tower: 0 },
      loot: { wood: 0, stone: 0, iron: 0, food: 0, gold: 4 },
    };
    const polluted = {
      id: 'enemy',
      mission: 'attack' as const,
      targetVillageId: village.id,
      arrivesAt: now + 40_000,
      troops: { guard: 7777, rider: 0, scout: 0, settler: 0, archer: 0, mounted_archer: 0, sultan_guard: 0, siege_engineer: 0, siege_tower: 0 },
      commanderId: 'secret-commander',
      loot: { gold: 99999 },
      combatPower: 8888,
    };
    const command = presentRallyCommand(
      {
        ...view,
        movements: [owned, returning],
        incoming: [polluted as IncomingMovementView],
        commanders: [
          {
            id: 'cmd-1',
            playerId: 'player',
            name: 'خالد',
            level: 1,
            experience: 0,
            specialization: 'infantry',
            attack: 1,
            defense: 1,
            mobility: 1,
            siege: 1,
            logistics: 1,
            status: 'marching',
            rankKey: 'recruit',
            nextLevelExperience: 10,
          },
        ],
      },
      village,
    );
    expect(command.outgoingScouts[0]?.commanderName).toBe('خالد');
    expect(command.outgoingScouts[0]?.troops?.find((row) => row.unit === 'scout')?.count).toBe(2);
    expect(command.returning[0]?.loot?.gold).toBe(4);
    expect(JSON.stringify(command.attacks)).not.toContain('7777');
    expect(JSON.stringify(command.attacks)).not.toContain('secret-commander');
    expect(JSON.stringify(command.attacks)).not.toContain('99999');
    expect(JSON.stringify(command.attacks)).not.toContain('8888');
    expect(command.readiness).toBe('threatened');
  });
});

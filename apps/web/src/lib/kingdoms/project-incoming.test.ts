import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand, projectWorld } from './engine';
import { emptyTroops } from './simulation';
import type { IncomingMovementView, KingdomsWorld } from './types';

const now = 1_800_000_000_000;
const forbiddenKeys = [
  'troops',
  'commanderId',
  'loot',
  'travelMs',
  'departedAt',
  'gather',
  'bonuses',
  'combat',
] as const;

function realms() {
  let world = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'مملكة النور' }, now);
  world = executeCommand(world, 'bob', { type: 'found', name: 'مملكة الظل' }, now);
  world = executeCommand(world, 'carol', { type: 'found', name: 'مملكة الفجر' }, now);
  const alice = Object.values(world.villages).find((village) => village.ownerId === 'alice')!;
  const bob = Object.values(world.villages).find((village) => village.ownerId === 'bob')!;
  const carol = Object.values(world.villages).find((village) => village.ownerId === 'carol')!;
  world.players.alice.protectionUntil = now;
  world.players.bob.protectionUntil = now;
  world.players.carol.protectionUntil = now;
  alice.buildings.embassy = 1;
  bob.buildings.embassy = 1;
  alice.troops = { guard: 30, rider: 10, scout: 8, settler: 1 };
  bob.troops = { guard: 20, rider: 4, scout: 2, settler: 0 };
  return { world, alice, bob, carol };
}

function march(
  world: KingdomsWorld,
  actor: 'alice' | 'bob',
  villageId: string,
  target: { x: number; y: number },
  mission: 'attack' | 'raid' | 'scout' | 'reinforce',
  commanderId?: string,
) {
  return executeCommand(
    world,
    actor,
    {
      type: 'march',
      villageId,
      targetX: target.x,
      targetY: target.y,
      mission,
      troops:
        mission === 'scout'
          ? { ...emptyTroops(), scout: 4 }
          : { ...emptyTroops(), guard: 8, rider: 3 },
      ...(commanderId ? { commanderId } : {}),
    },
    now,
  );
}

function ally(world: KingdomsWorld) {
  const created = executeCommand(world, 'alice', { type: 'allianceCreate', name: 'عهد النور' }, now);
  const allianceId = created.players.alice.allianceId!;
  const requested = executeCommand(created, 'bob', { type: 'allianceJoin', allianceId }, now);
  return executeCommand(requested, 'alice', { type: 'allianceApprove', playerId: 'bob' }, now);
}

function assertRedacted(row: IncomingMovementView) {
  expect(Object.keys(row).sort()).toEqual(
    ['arrivesAt', 'id', 'mission', 'source', 'targetVillageId'].sort(),
  );
  expect(row.source).toBeDefined();
  expect(Object.keys(row.source!).sort()).toEqual(
    [
      'id',
      'kingdomName',
      'name',
      'ownerId',
      'protectedUntil',
      'x',
      'y',
      ...(row.source?.allianceId ? ['allianceId'] : []),
    ].sort(),
  );
  const serialized = JSON.stringify(row);
  for (const key of forbiddenKeys) {
    expect(serialized).not.toContain(`"${key}"`);
  }
  expect(serialized).not.toMatch(/"(guard|rider|scout|settler)":/);
}

describe('Redacted inbound movement projection', () => {
  it('lets the attacker keep a full outgoing movement and shows the defender a redacted inbound attack', () => {
    const { world, alice, bob } = realms();
    const recruited = executeCommand(
      world,
      'alice',
      { type: 'commanderRecruit', villageId: alice.id, name: 'بيبرس', specialization: 'infantry' },
      now,
    );
    const commanderId = projectWorld(recruited, 'alice', now).commanders![0].id;
    const sent = march(recruited, 'alice', alice.id, bob, 'attack', commanderId);
    const attacker = projectWorld(sent, 'alice', now);
    const defender = projectWorld(sent, 'bob', now);
    expect(attacker.movements).toHaveLength(1);
    expect(attacker.movements[0]).toMatchObject({
      ownerId: 'alice',
      mission: 'attack',
      commanderId,
      troops: { guard: 8, rider: 3, scout: 0, settler: 0, archer: 0, mounted_archer: 0, sultan_guard: 0, siege_engineer: 0, siege_tower: 0 },
    });
    expect(attacker.incoming).toEqual([]);
    expect(defender.movements).toEqual([]);
    expect(defender.incoming).toHaveLength(1);
    expect(defender.incoming[0]).toMatchObject({
      id: sent.movements[0].id,
      mission: 'attack',
      targetVillageId: bob.id,
      arrivesAt: sent.movements[0].arrivesAt,
      source: {
        id: alice.id,
        name: alice.name,
        x: alice.x,
        y: alice.y,
        kingdomName: 'مملكة النور',
        ownerId: 'alice',
      },
    });
    assertRedacted(defender.incoming[0]);
  });

  it('projects a redacted inbound raid to the target owner only', () => {
    const { world, alice, bob } = realms();
    const sent = march(world, 'alice', alice.id, bob, 'raid');
    const defender = projectWorld(sent, 'bob', now);
    expect(defender.incoming).toEqual([
      expect.objectContaining({ mission: 'raid', targetVillageId: bob.id, id: sent.movements[0].id }),
    ]);
    assertRedacted(defender.incoming[0]);
  });

  it('projects inbound scout as a warning without intel or troop composition', () => {
    const { world, alice, bob } = realms();
    const sent = march(world, 'alice', alice.id, bob, 'scout');
    const defender = projectWorld(sent, 'bob', now);
    expect(defender.incoming[0]?.mission).toBe('scout');
    expect(defender.reports.some((report) => report.intel || report.title.includes('استطلاع'))).toBe(
      false,
    );
    assertRedacted(defender.incoming[0]);
    expect(JSON.stringify(defender.incoming)).not.toContain('intel');
  });

  it('shows authorized inbound reinforcement to the target owner', () => {
    const { world, alice, bob } = realms();
    const sent = march(ally(world), 'alice', alice.id, bob, 'reinforce');
    const defender = projectWorld(sent, 'bob', now);
    expect(defender.incoming).toEqual([
      expect.objectContaining({
        mission: 'reinforce',
        targetVillageId: bob.id,
        source: expect.objectContaining({ ownerId: 'alice' }),
      }),
    ]);
    assertRedacted(defender.incoming[0]);
  });

  it('hides inbound marches from spectators and other village owners', () => {
    const { world, alice, bob, carol } = realms();
    const sent = march(world, 'alice', alice.id, bob, 'attack');
    expect(projectWorld(sent, 'carol', now).incoming).toEqual([]);
    expect(projectWorld(sent, 'carol', now).movements).toEqual([]);
    expect(projectWorld(sent, 'spectator', now).incoming).toEqual([]);
    expect(projectWorld(sent, 'spectator', now).movements).toEqual([]);
    expect(projectWorld(sent, carol.ownerId, now).incoming.every((row) => row.targetVillageId !== bob.id)).toBe(
      true,
    );
  });

  it('omits secret military fields from the serialized defender view incoming list', () => {
    const { world, alice, bob } = realms();
    const recruited = executeCommand(
      world,
      'alice',
      { type: 'commanderRecruit', villageId: alice.id, name: 'قلاوون', specialization: 'cavalry' },
      now,
    );
    const commanderId = projectWorld(recruited, 'alice', now).commanders![0].id;
    const sent = march(recruited, 'alice', alice.id, bob, 'attack', commanderId);
    const serialized = JSON.stringify(projectWorld(sent, 'bob', now).incoming);
    expect(serialized).not.toContain(commanderId);
    expect(serialized).not.toContain('"troops"');
    expect(serialized).not.toContain('"commanderId"');
    expect(serialized).not.toContain('"loot"');
    expect(serialized).not.toContain('"travelMs"');
    expect(serialized).not.toMatch(/"guard":[1-9]/);
  });

  it('drops inbound rows after arrival while combat reports still reach both sides', () => {
    const { world, alice, bob } = realms();
    const sent = march(world, 'alice', alice.id, bob, 'attack');
    const arrived = advanceWorld(sent, sent.movements[0].arrivesAt);
    expect(projectWorld(arrived, 'bob', arrived.updatedAt).incoming).toEqual([]);
    expect(projectWorld(arrived, 'alice', arrived.updatedAt).incoming).toEqual([]);
    expect(projectWorld(arrived, 'bob', arrived.updatedAt).reports.some((report) => report.combat)).toBe(
      true,
    );
    expect(projectWorld(arrived, 'alice', arrived.updatedAt).reports.some((report) => report.combat)).toBe(
      true,
    );
  });

  it('does not change march, arrival, or offline battle outcomes', () => {
    const { world, alice, bob } = realms();
    const sent = march(world, 'alice', alice.id, bob, 'attack');
    expect(sent.movements[0].troops).toEqual({ guard: 8, rider: 3, scout: 0, settler: 0 });
    const first = advanceWorld(sent, sent.movements[0].arrivesAt);
    const second = advanceWorld(sent, sent.movements[0].arrivesAt);
    expect(first).toEqual(second);
    expect(first.reports.some((report) => report.combat)).toBe(true);
    expect(advanceWorld(first, first.updatedAt)).toEqual(first);
  });
});

import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand, projectWorld } from './engine';
import { kingdomsCommandSchema, type KingdomsCommand } from './commands';
import { kingdomsConfigSchema } from './config';
import { commanderCombatPower } from './commanders';
import { gatherPreview } from './resource-sites';

const now = 1_800_000_000_000;
function founded() {
  return executeCommand(createWorld(now), 'alice', { type: 'found', name: 'Alice realm' }, now);
}
function battleReady() {
  let world = executeCommand(founded(), 'bob', { type: 'found', name: 'Bob realm' }, now);
  const attacker = Object.values(world.villages).find((v) => v.ownerId === 'alice')!;
  const defender = Object.values(world.villages).find((v) => v.ownerId === 'bob')!;
  world.players.alice.protectionUntil = 0;
  world.players.bob.protectionUntil = 0;
  world = executeCommand(world, 'alice', { type: 'commanderRecruit', villageId: attacker.id, name: 'Attacker', specialization: 'infantry' }, now);
  world = executeCommand(world, 'bob', { type: 'commanderRecruit', villageId: defender.id, name: 'Defender', specialization: 'defense' }, now);
  world.villages[attacker.id].troops.guard = 200;
  world.villages[defender.id].troops.guard = 20;
  return { world, attacker, defender, commanderId: projectWorld(world, 'alice', now).commanders![0].id,
    defenseCommanderId: projectWorld(world, 'bob', now).commanders![0].id };
}
describe('Commander authoritative commands', () => {
  it('recruits a commander with server-defined attributes and charges resources once', () => {
    const world = founded();
    const villageId = Object.keys(world.villages)[0];
    const recruited = executeCommand(world, 'alice', {
      type: 'commanderRecruit', villageId, name: 'Amir', specialization: 'cavalry',
    } as unknown as KingdomsCommand, now);
    const commanders = projectWorld(recruited, 'alice', now).commanders;
    expect(commanders).toHaveLength(1);
    expect(commanders?.[0]).toMatchObject({ playerId: 'alice', name: 'Amir', level: 1,
      experience: 0, specialization: 'cavalry', status: 'available', attack: 5 });
    expect(recruited.villages[villageId].resources.gold).toBe(100);
    expect(world.villages[villageId].resources.gold).toBe(150);
    expect(advanceWorld(recruited, now)).toEqual(recruited);
  });
  it('computes bounded bonuses from actual troop counts and awards real battle XP once', () => {
    const fixture = battleReady();
    let world = executeCommand(fixture.world, 'bob', { type: 'commanderAssign', commanderId: fixture.defenseCommanderId, villageId: fixture.defender.id }, now);
    const commander = world.commanders![fixture.commanderId];
    world.commanders![fixture.commanderId] = { ...commander, level: 50, attack: 100000 };
    world = executeCommand(world, 'alice', { type: 'march', villageId: fixture.attacker.id,
      targetX: fixture.defender.x, targetY: fixture.defender.y, mission: 'attack', commanderId: fixture.commanderId,
      troops: { guard: 100, rider: 0, scout: 0, settler: 0 } }, now);
    const resolved = advanceWorld(world, world.movements[0].arrivesAt);
    const report = projectWorld(resolved, 'alice', resolved.updatedAt).reports.find((r) => r.combat)!;
    expect(report.combat?.attack).toBe(3450);
    expect(report.combat?.defense).toBe(1050);
    expect(projectWorld(resolved, 'alice', resolved.updatedAt).commanders![0].experience).toBe(70);
    expect(projectWorld(resolved, 'bob', resolved.updatedAt).commanders![0].experience).toBeGreaterThan(0);
    expect(advanceWorld(resolved, resolved.updatedAt)).toEqual(resolved);
    expect(projectWorld(resolved, 'alice', resolved.updatedAt).commanders).toHaveLength(1);
  });
  it('reserves a commander in the existing army movement until its return', () => {
    let world = founded();
    const village = Object.values(world.villages)[0];
    world = executeCommand(world, 'alice', { type: 'commanderRecruit', villageId: village.id, name: 'Amir', specialization: 'infantry' }, now);
    const commanderId = projectWorld(world, 'alice', now).commanders![0].id;
    world.villages[village.id].troops.guard = 20;
    const marching = executeCommand(world, 'alice', { type: 'march', villageId: village.id,
      targetX: 5, targetY: 5, mission: 'occupy', troops: { guard: 5, rider: 0, scout: 0, settler: 0 }, commanderId }, now);
    expect(projectWorld(marching, 'alice', now).commanders![0].status).toBe('marching');
    expect(marching.movements[0].commanderId).toBe(commanderId);
    expect(() => executeCommand(marching, 'alice', { type: 'commanderAssign', commanderId, villageId: village.id }, now)).toThrow('commander.error.unavailable');
    const returned = advanceWorld(marching, now + marching.movements[0].travelMs * 2);
    expect(projectWorld(returned, 'alice', returned.updatedAt).commanders![0].status).toBe('available');
    expect(returned.villages[village.id].troops.guard).toBe(20);
  });
  it('uses bounded mobility at departure and freezes ETA across later XP level-ups', () => {
    const { world, attacker, defender, commanderId } = battleReady();
    world.villages[attacker.id].x = 0; world.villages[attacker.id].y = 0;
    world.villages[defender.id].x = 10; world.villages[defender.id].y = 0;
    world.commanders![commanderId].experience = 90;
    const command = { type: 'march' as const, villageId: attacker.id, targetX: 10, targetY: 0,
      mission: 'attack' as const, troops: { guard: 100, rider: 0, scout: 0, settler: 0 } };
    const baseline = executeCommand(world, 'alice', command, now);
    expect(baseline.movements[0].travelMs).toBe(900000);
    const march = executeCommand(world, 'alice', { ...command, commanderId }, now);
    expect(march.movements[0].travelMs).toBe(857143);
    const arrived = advanceWorld(march, march.movements[0].arrivesAt);
    expect(arrived.commanders![commanderId].mobility).toBe(6);
    expect(arrived.movements[0].travelMs).toBe(857143);
    expect(arrived.movements[0].arrivesAt).toBe(now + 1714286);
    world.commanders![commanderId].mobility = 100000;
    expect(executeCommand(world, 'alice', { ...command, commanderId }, now).movements[0].travelMs).toBe(782609);
  });
  it('accepts a gathering mission near season end when its real commander ETA fits', () => {
    let world = founded();
    const villageId = Object.keys(world.villages)[0];
    world = executeCommand(world, 'alice', { type: 'commanderRecruit', villageId, name: 'Mobile amir', specialization: 'cavalry' }, now);
    world.villages[villageId].troops.guard = 5;
    const commanderId = projectWorld(world, 'alice', now).commanders![0].id;
    const troops = { guard: 5, rider: 0, scout: 0, settler: 0 };
    world.season.endsAt = now + gatherPreview(world.config, world.villages[villageId], { x: 2, y: 2 }, troops).roundTripMs - 1;
    const command = { type: 'march' as const, villageId, targetX: 2, targetY: 2, mission: 'gather' as const, troops };
    expect(() => executeCommand(world, 'alice', command, now)).toThrow();
    const launched = executeCommand(world, 'alice', { ...command, commanderId }, now);
    expect(launched.movements[0].arrivesAt + launched.movements[0].travelMs).toBeLessThan(world.season.endsAt);
    const returned = advanceWorld(launched, now + launched.movements[0].travelMs * 2);
    expect(returned.movements).toHaveLength(0);
    expect(returned.villages[villageId].troops.guard).toBe(5);
  });
  it('grants mission XP only to a stationed commander after server proof and a single claim', () => {
    let world = founded();
    const villageId = Object.keys(world.villages)[0];
    world = executeCommand(world, 'alice', { type: 'commanderRecruit', villageId, name: 'Quest amir', specialization: 'defense' }, now);
    const commanderId = projectWorld(world, 'alice', now).commanders![0].id;
    world = executeCommand(world, 'alice', { type: 'commanderAssign', commanderId, villageId }, now);
    expect(() => executeCommand(world, 'alice', { type: 'claim', mission: 'commander' }, now)).toThrow();
    world.villages[villageId].troops.guard = 10;
    const claimed = executeCommand(world, 'alice', { type: 'claim', mission: 'commander' }, now);
    expect(projectWorld(claimed, 'alice', now).commanders![0].experience).toBe(30);
    expect(() => executeCommand(claimed, 'alice', { type: 'claim', mission: 'commander' }, now)).toThrow();
  });
  it('rejects foreign commanders, foreign villages, duplicate assignment and recruitment beyond the configured limit', () => {
    const { world, attacker, defender, commanderId, defenseCommanderId } = battleReady();
    expect(() => executeCommand(world, 'alice', { type: 'commanderAssign', commanderId: defenseCommanderId, villageId: attacker.id }, now)).toThrow('commander.error.notOwned');
    expect(() => executeCommand(world, 'alice', { type: 'commanderAssign', commanderId, villageId: defender.id }, now)).toThrow();
    world.config.commanders!.maxPerPlayer = 1;
    expect(() => executeCommand(world, 'alice', { type: 'commanderRecruit', villageId: attacker.id, name: 'Second', specialization: 'infantry' }, now)).toThrow('commander.error.limit');
    const assigned = executeCommand(world, 'alice', { type: 'commanderAssign', commanderId, villageId: attacker.id }, now);
    expect(assigned.villages[attacker.id].commanderId).toBe(commanderId);
    const free = executeCommand(assigned, 'alice', { type: 'commanderUnassign', commanderId }, now);
    expect(free.villages[attacker.id].commanderId).toBeUndefined();
    expect(projectWorld(free, 'alice', now).commanders![0].status).toBe('available');
  });
  it('rejects client stats, XP, prototype IDs and unsafe bonus config', () => {
    expect(kingdomsCommandSchema.safeParse({ type: 'commanderRecruit', villageId: 'v1', name: 'Amir', specialization: 'cavalry', experience: 999 }).success).toBe(false);
    expect(kingdomsCommandSchema.safeParse({ type: 'commanderAssign', villageId: 'v1', commanderId: '__proto__' }).success).toBe(false);
    expect(kingdomsConfigSchema.safeParse({ ...founded().config, commanders: { ...founded().config.commanders, maxBonus: 0.16 } }).success).toBe(false);
  });
  it('rejects invalid rank ordering, free recruitment and unsafe experience thresholds', () => {
    const config = founded().config;
    for (const commanders of [
      { ...config.commanders!, ranks: [{ minLevel: 2, key: 'commander.rank.mamluk' }] },
      { ...config.commanders!, recruitmentCost: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 } },
      { ...config.commanders!, xpBase: 1000000, xpGrowth: 2 },
    ]) expect(kingdomsConfigSchema.safeParse({ ...config, commanders }).success).toBe(false);
  });
  it('preserves legacy snapshots, old armies and private ownership projections', () => {
    const { world } = battleReady();
    const legacy = structuredClone(founded());
    delete legacy.commanders;
    delete legacy.commanderAwards;
    delete legacy.config.commanders;
    const migrated = advanceWorld(legacy, now);
    expect(migrated.commanders).toEqual({});
    expect(migrated.villages).toEqual(legacy.villages);
    expect(legacy.config.commanders).toBeUndefined();
    expect(projectWorld(world, 'spectator', now).commanders).toEqual([]);
    expect(Object.keys(projectWorld(world, 'alice', now))).not.toContain('commanderAwards');
    expect(projectWorld(world, 'alice', now).commanders?.every((c) => c.playerId === 'alice')).toBe(true);
  });
  it('never generates army power without units or unsupported archery/siege/supply units', () => {
    const { world, commanderId } = battleReady();
    const commander = world.commanders![commanderId];
    expect(commanderCombatPower(world, { guard: 0, rider: 0, scout: 0, settler: 0 }, 'attack', commander)).toBe(0);
    for (const specialization of ['archery', 'siege', 'supply'] as const) {
      expect(commanderCombatPower(world, { guard: 1, rider: 0, scout: 0, settler: 0 }, 'attack', { ...commander, specialization })).toBe(30);
    }
  });
  it('blocks XP against empty armies and the same opponent inside the cooldown', () => {
    const { world, attacker, defender, commanderId } = battleReady();
    const command = { type: 'march' as const, villageId: attacker.id, targetX: defender.x, targetY: defender.y,
      mission: 'attack' as const, commanderId, troops: { guard: 100, rider: 0, scout: 0, settler: 0 } };
    const launched = executeCommand(world, 'alice', command, now);
    const first = advanceWorld(launched, now + launched.movements[0].travelMs * 2);
    expect(first.commanders![commanderId].experience).toBe(70);
    first.villages[attacker.id].troops.guard = 200;
    first.villages[defender.id].troops.guard = 20;
    const again = executeCommand(first, 'alice', command, first.updatedAt + 1);
    const repeated = advanceWorld(again, again.movements[0].arrivesAt);
    expect(repeated.commanders![commanderId].experience).toBe(70);
    const empty = structuredClone(world);
    empty.villages[defender.id].troops.guard = 0;
    const emptyMarch = executeCommand(empty, 'alice', command, now);
    expect(advanceWorld(emptyMarch, emptyMarch.movements[0].arrivesAt).commanders![commanderId].experience).toBe(0);
  });
  it('caps lifetime progression at the configured level and projects its rank key', () => {
    const { world, attacker, defender, commanderId } = battleReady();
    world.config.commanders = { ...world.config.commanders!, maxLevel: 2, xpBase: 10,
      ranks: [{ minLevel: 1, key: 'commander.rank.mamluk' }, { minLevel: 2, key: 'commander.rank.amirTen' }] };
    const launched = executeCommand(world, 'alice', { type: 'march', villageId: attacker.id,
      targetX: defender.x, targetY: defender.y, mission: 'attack', commanderId,
      troops: { guard: 100, rider: 0, scout: 0, settler: 0 } }, now);
    const resolved = advanceWorld(launched, launched.movements[0].arrivesAt);
    expect(projectWorld(resolved, 'alice', resolved.updatedAt).commanders![0]).toMatchObject({ level: 2, experience: 10,
      rankKey: 'commander.rank.amirTen', nextLevelExperience: null, attack: 6 });
  });
  it('caps XP per player across different opponents within the reward window', () => {
    const fixture = battleReady();
    fixture.world.config.commanders!.xpWindowCap = 80;
    let world = fixture.world;
    for (const playerId of ['bob', 'charlie', 'dave']) {
      if (playerId !== 'bob') world = executeCommand(world, playerId, { type: 'found', name: `${playerId} realm` }, world.updatedAt);
      const target = Object.values(world.villages).find((v) => v.ownerId === playerId)!;
      world.villages[fixture.attacker.id].troops.guard = 200;
      target.troops.guard = 20;
      world.players[playerId].protectionUntil = 0;
      world = executeCommand(world, 'alice', { type: 'march', villageId: fixture.attacker.id,
        targetX: target.x, targetY: target.y, mission: 'attack', commanderId: fixture.commanderId,
        troops: { guard: 100, rider: 0, scout: 0, settler: 0 } }, world.updatedAt);
      world = advanceWorld(world, world.updatedAt + world.movements[0].travelMs * 2);
    }
    expect(world.commanders![fixture.commanderId].experience).toBe(80);
    expect(world.commanderAwards?.filter((entry) => entry.playerId === 'alice').map((entry) => entry.xp)).toEqual([70, 10]);
  });
  it('does not award an empty home garrison commander XP from allied troops alone', () => {
    const fixture = battleReady();
    let world = executeCommand(fixture.world, 'charlie', { type: 'found', name: 'Allied realm' }, now);
    const alliedVillage = Object.values(world.villages).find((v) => v.ownerId === 'charlie')!;
    world.villages[fixture.defender.id].troops.guard = 0;
    world.villages[fixture.defender.id].reinforcements[alliedVillage.id] = { guard: 20, rider: 0, scout: 0, settler: 0 };
    world = executeCommand(world, 'bob', { type: 'commanderAssign', commanderId: fixture.defenseCommanderId, villageId: fixture.defender.id }, now);
    const march = executeCommand(world, 'alice', { type: 'march', villageId: fixture.attacker.id,
      targetX: fixture.defender.x, targetY: fixture.defender.y, mission: 'attack', commanderId: fixture.commanderId,
      troops: { guard: 100, rider: 0, scout: 0, settler: 0 } }, now);
    const resolved = advanceWorld(march, march.movements[0].arrivesAt);
    expect(resolved.commanders![fixture.defenseCommanderId].experience).toBe(0);
    expect(resolved.commanders![fixture.commanderId].experience).toBe(70);
  });
  it('rewards a deployed allied commander only for its own real defensive contingent', () => {
    const fixture = battleReady();
    let world = executeCommand(fixture.world, 'charlie', { type: 'found', name: 'Allied realm' }, now);
    const alliedVillage = Object.values(world.villages).find((v) => v.ownerId === 'charlie')!;
    world = executeCommand(world, 'charlie', { type: 'commanderRecruit', villageId: alliedVillage.id, name: 'Allied defender', specialization: 'defense' }, now);
    const alliedCommanderId = projectWorld(world, 'charlie', now).commanders![0].id;
    world.players.bob.allianceId = 'allied'; world.players.charlie.allianceId = 'allied';
    world.villages[alliedVillage.id].troops.guard = 20;
    const reinforcement = executeCommand(world, 'charlie', { type: 'march', villageId: alliedVillage.id,
      targetX: fixture.defender.x, targetY: fixture.defender.y, mission: 'reinforce', commanderId: alliedCommanderId,
      troops: { guard: 20, rider: 0, scout: 0, settler: 0 } }, now);
    world = advanceWorld(reinforcement, reinforcement.movements[0].arrivesAt);
    world = executeCommand(world, 'bob', { type: 'commanderAssign', villageId: fixture.defender.id, commanderId: fixture.defenseCommanderId }, world.updatedAt);
    const attack = executeCommand(world, 'alice', { type: 'march', villageId: fixture.attacker.id,
      targetX: fixture.defender.x, targetY: fixture.defender.y, mission: 'attack', commanderId: fixture.commanderId,
      troops: { guard: 100, rider: 0, scout: 0, settler: 0 } }, world.updatedAt);
    const resolved = advanceWorld(attack, attack.movements[0].arrivesAt);
    expect(resolved.commanders![alliedCommanderId].experience).toBeGreaterThan(0);
    expect(resolved.commanderAwards?.filter((award) => award.playerId === 'charlie')).toHaveLength(1);
  });
  it('enforces recovery after a defeated army and does not permit a commander-only march', () => {
    const { world, attacker, defender, commanderId } = battleReady();
    world.villages[defender.id].troops.guard = 1000;
    expect(() => executeCommand(world, 'alice', { type: 'march', villageId: attacker.id,
      targetX: defender.x, targetY: defender.y, mission: 'attack', commanderId,
      troops: { guard: 0, rider: 0, scout: 0, settler: 0 } }, now)).toThrow();
    const march = executeCommand(world, 'alice', { type: 'march', villageId: attacker.id,
      targetX: defender.x, targetY: defender.y, mission: 'attack', commanderId,
      troops: { guard: 10, rider: 0, scout: 0, settler: 0 } }, now);
    const defeated = advanceWorld(march, march.movements[0].arrivesAt);
    expect(defeated.movements).toHaveLength(0);
    expect(defeated.commanders![commanderId].cooldownUntil).toBe(defeated.updatedAt + 3600000);
    expect(() => executeCommand(defeated, 'alice', { type: 'commanderAssign', commanderId, villageId: attacker.id }, defeated.updatedAt)).toThrow();
    expect(executeCommand(defeated, 'alice', { type: 'commanderAssign', commanderId, villageId: attacker.id }, defeated.updatedAt + 3600000).commanders![commanderId].status).toBe('assigned');
  });
  it('keeps reinforced commanders deployed until existing recall movement arrives home', () => {
    const { world, attacker, defender, commanderId } = battleReady();
    world.players.alice.allianceId = 'shared'; world.players.bob.allianceId = 'shared';
    const march = executeCommand(world, 'alice', { type: 'march', villageId: attacker.id,
      targetX: defender.x, targetY: defender.y, mission: 'reinforce', commanderId,
      troops: { guard: 10, rider: 0, scout: 0, settler: 0 } }, now);
    const deployed = advanceWorld(march, march.movements[0].arrivesAt);
    expect(deployed.commanders![commanderId].status).toBe('deployed');
    expect(() => executeCommand(deployed, 'alice', { type: 'commanderAssign', commanderId, villageId: attacker.id }, deployed.updatedAt)).toThrow();
    const recalled = executeCommand(deployed, 'alice', { type: 'recall', villageId: attacker.id, hostVillageId: defender.id }, deployed.updatedAt);
    expect(recalled.movements[0].commanderId).toBe(commanderId);
    expect(recalled.commanders![commanderId].status).toBe('marching');
    const returned = advanceWorld(recalled, recalled.movements[0].arrivesAt);
    expect(returned.commanders![commanderId].status).toBe('available');
    expect(returned.villages[attacker.id].troops.guard).toBe(200);
    expect(returned.villages[defender.id].reinforcementCommanders).toEqual({});
  });
});

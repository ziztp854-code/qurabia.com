import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand, projectWorld } from './engine';
import { emptyTroops } from './simulation';
import { resources } from './config';
import { withdrawSiege } from './siege';
import type { KingdomsCommand } from './commands';
import type { KingdomsWorld, Movement, Siege } from './types';

const now = 1_800_000_000_000;
const missions = ['attack', 'raid', 'scout', 'reinforce', 'settle', 'occupy', 'gather'] as const;
function fixture() {
  let world = executeCommand(
    createWorld(now),
    'alice',
    { type: 'found', name: 'Alice realm' },
    now,
  );
  world = executeCommand(world, 'bob', { type: 'found', name: 'Bob realm' }, now);
  const [home, target] = Object.values(world.villages);
  home.x = 0;
  home.y = 0;
  target.x = 10;
  target.y = 0;
  home.troops = { ...emptyTroops(), guard: 20, scout: 5, settler: 1 };
  target.troops = emptyTroops();
  world.players.alice.protectionUntil = now;
  world.players.bob.protectionUntil = now;
  return { world, homeId: home.id, targetId: target.id };
}
function launch(world: KingdomsWorld, homeId: string, mission: (typeof missions)[number]) {
  if (mission === 'reinforce') {
    world.players.alice.allianceId = 'shared';
    world.players.bob.allianceId = 'shared';
  }
  const target =
    mission === 'gather'
      ? { x: 2, y: 2 }
      : mission === 'settle' || mission === 'occupy'
        ? { x: 5, y: 0 }
        : { x: 10, y: 0 };
  const troops =
    mission === 'scout'
      ? { ...emptyTroops(), scout: 5 }
      : mission === 'settle'
        ? { ...emptyTroops(), settler: 1 }
        : { ...emptyTroops(), guard: 5 };
  return executeCommand(
    world,
    'alice',
    {
      type: 'march',
      villageId: homeId,
      targetX: target.x,
      targetY: target.y,
      mission,
      troops,
    },
    now,
  );
}

describe('Authoritative army departure points and saved schedules', () => {
  it('normalizes absent world policy for new commands while preserving every saved arrival', () => {
    const { world, homeId } = fixture();
    delete world.config.armyTravelTimeFactor;
    world.movements = [
      {
        id: 'old-army',
        ownerId: 'alice',
        sourceId: homeId,
        mission: 'return',
        targetX: 0,
        targetY: 0,
        troops: { ...emptyTroops(), guard: 1 },
        loot: resources(),
        departedAt: now,
        arrivesAt: now + 900000,
        travelMs: 900000,
      },
    ];
    const original = structuredClone(world);
    const sent = launch(world, homeId, 'attack');
    expect(sent.config.armyTravelTimeFactor).toBe(0.45);
    expect(sent.movements[0]).toEqual(original.movements[0]);
    expect(sent.movements[1].travelMs).toBe(405000);
    expect(projectWorld(world, 'alice', now).config.armyTravelTimeFactor).toBe(0.45);
    expect(world).toEqual(original);
  });

  it('keeps an explicit historical world policy and leaves training and caravans unchanged', () => {
    const { world, homeId, targetId } = fixture();
    world.villages[homeId].buildings.barracks = 1;
    world.villages[homeId].buildings.market = 1;
    const historical = structuredClone(world);
    historical.config.armyTravelTimeFactor = 1;
    expect(launch(historical, homeId, 'attack').movements[0].travelMs).toBe(900000);
    expect(launch(world, homeId, 'attack').movements[0].travelMs).toBe(405000);
    const train = { type: 'train' as const, villageId: homeId, unit: 'guard' as const, count: 2 };
    expect(executeCommand(world, 'alice', train, now).villages[homeId].training).toEqual(
      executeCommand(historical, 'alice', train, now).villages[homeId].training,
    );
    const caravan = {
      type: 'caravanSend' as const,
      villageId: homeId,
      targetVillageId: targetId,
      resources: resources(10),
    };
    const reviewCaravan = executeCommand(world, 'alice', caravan, now).caravans[0];
    expect(reviewCaravan).toEqual(executeCommand(historical, 'alice', caravan, now).caravans[0]);
    expect(reviewCaravan.arrivesAt).toBe(now + 225000);
  });

  it.each(missions)('records the server origin and departs immediately for %s', (mission) => {
    const { world, homeId } = fixture();
    const sent = launch(world, homeId, mission);
    expect(sent.movements[0]).toMatchObject({ originX: 0, originY: 0, departedAt: now });
    expect(sent.movements[0].arrivesAt).toBe(now + sent.movements[0].travelMs);
    expect(projectWorld(sent, 'alice', now).movements).toEqual(sent.movements);
    expect(projectWorld(sent, 'bob', now).movements).toEqual([]);
    expect(world.movements).toEqual([]);
  });

  it.each(missions)('keeps the arrival point as origin for the automatic %s return', (mission) => {
    const { world, homeId, targetId } = fixture();
    const sent = launch(world, homeId, mission);
    const outbound = sent.movements[0];
    // A new settlement loses its destination; a stationed ally loses its alliance.
    if (mission === 'settle') {
      sent.villages[targetId].x = outbound.targetX;
      sent.villages[targetId].y = outbound.targetY;
    }
    if (mission === 'reinforce') delete sent.players.bob.allianceId;
    // Changes after departure must not reschedule either leg of an existing campaign.
    sent.config.secondsPerTile *= 10;
    for (const unit of Object.values(sent.config.units)) unit.speed *= 2;
    const arrived = advanceWorld(sent, outbound.arrivesAt);
    expect(arrived.movements).toHaveLength(1);
    expect(arrived.movements[0]).toMatchObject({
      mission: 'return',
      originX: outbound.targetX,
      originY: outbound.targetY,
      targetX: 0,
      targetY: 0,
      departedAt: outbound.arrivesAt,
      arrivesAt: outbound.arrivesAt + outbound.travelMs,
      travelMs: outbound.travelMs,
    });
    const beforeArrival = advanceWorld(arrived, arrived.movements[0].arrivesAt - 1);
    expect(beforeArrival.movements).toHaveLength(1);
    expect(advanceWorld(beforeArrival, arrived.movements[0].arrivesAt).movements).toEqual([]);
  });

  it('records the host as recall origin and prevents a duplicate recall', () => {
    const { world, homeId, targetId } = fixture();
    const sent = launch(world, homeId, 'reinforce');
    const stationed = advanceWorld(sent, sent.movements[0].arrivesAt);
    const recalled = executeCommand(
      stationed,
      'alice',
      {
        type: 'recall',
        villageId: homeId,
        hostVillageId: targetId,
      },
      stationed.updatedAt,
    );
    expect(recalled.movements[0]).toMatchObject({
      mission: 'return',
      originX: 10,
      originY: 0,
      targetX: 0,
      targetY: 0,
      travelMs: 405000,
      departedAt: stationed.updatedAt,
      arrivesAt: stationed.updatedAt + 405000,
    });
    expect(() =>
      executeCommand(
        recalled,
        'alice',
        {
          type: 'recall',
          villageId: homeId,
          hostVillageId: targetId,
        },
        recalled.updatedAt,
      ),
    ).toThrow();
    const returned = advanceWorld(recalled, recalled.movements[0].arrivesAt);
    expect(returned.villages[homeId].troops.guard).toBe(20);
    expect(returned.villages[targetId].reinforcements[homeId]).toBeUndefined();
  });

  it.each(['attack', 'return'] as const)(
    'preserves a saved legacy %s deadline without inventing its origin',
    (mission) => {
      const { world, homeId, targetId } = fixture();
      world.movements = [
        {
          id: 'legacy',
          ownerId: 'alice',
          sourceId: homeId,
          mission,
          targetX: mission === 'return' ? 0 : world.villages[targetId].x,
          targetY: 0,
          troops: { ...emptyTroops(), guard: 1 },
          loot: resources(),
          departedAt: now,
          arrivesAt: now + 60000,
          travelMs: 60000,
        },
      ];
      const saved = structuredClone(world.movements[0]);
      world.config.secondsPerTile = 3600;
      const during = advanceWorld(JSON.parse(JSON.stringify(world)), now + 59999);
      expect(during.movements[0]).toEqual(saved);
      expect(during.movements[0]).not.toHaveProperty('originX');
      const arrived = advanceWorld(during, now + 60000);
      if (mission === 'return') {
        expect(arrived.movements).toEqual([]);
        expect(arrived.villages[homeId].troops.guard).toBe(21);
      } else {
        expect(arrived.movements[0]).toMatchObject({
          originX: 10,
          originY: 0,
          travelMs: 60000,
          arrivesAt: now + 120000,
        });
      }
      expect(world.movements[0]).toEqual(saved);
    },
  );

  it('rejects a forged origin before creating a movement or reserving troops', () => {
    const { world, homeId } = fixture();
    const saved = structuredClone(world);
    expect(() =>
      executeCommand(
        world,
        'alice',
        {
          type: 'march',
          villageId: homeId,
          mission: 'occupy',
          targetX: 5,
          targetY: 0,
          troops: { ...emptyTroops(), guard: 5 },
          originX: 99,
          originY: 99,
        } as unknown as KingdomsCommand,
        now,
      ),
    ).toThrow();
    expect(world).toEqual(saved);
  });

  it.each([[0.45, 202500], [1, 450000]])('applies policy %s only when a new siege withdrawal departs', (factor, expectedMs) => {
    const { world, homeId } = fixture();
    const siege: Siege = {
      id: 'siege',
      ownerId: 'alice',
      sourceId: homeId,
      targetX: 3,
      targetY: 4,
      troops: { ...emptyTroops(), guard: 1 },
      stage: 'withdrawing',
      supply: 1,
      startedAt: now,
      stageStartedAt: now,
      stageDeadline: now + 1,
      nextTickAt: now + 1,
      wallDamage: 0,
      buildingDamage: {},
    };
    world.config.armyTravelTimeFactor = factor;
    world.sieges = { siege };
    withdrawSiege(world, siege, now);
    expect(world.movements[0]).toMatchObject({
      originX: 3,
      originY: 4,
      targetX: 0,
      targetY: 0,
      travelMs: expectedMs,
      departedAt: now,
      arrivesAt: now + expectedMs,
    } satisfies Partial<Movement>);
    expect(world.sieges).toEqual({});
  });
});

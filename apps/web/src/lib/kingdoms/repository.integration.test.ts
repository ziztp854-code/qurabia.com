import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import { createWorld, executeCommand } from './engine';
import { defaultKingdomsConfig, resources } from './config';
import type { KingdomsWorld } from './types';
import { provisionVillageGeography } from '../mamluk-map/village-geography';
import { relocateVillageForAdministration } from '../mamluk-map/admin-village-relocation';
import type { VillageRelocationWorld } from '../mamluk-map/village-relocation';

// Deliberately never fall back to DATABASE_URL. Run migrations separately against
// an explicitly provisioned local database named kingdoms_test or kingdoms_test_*.
const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;
function assertIsolatedDatabase(value: string) {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error(
      'KINGDOMS_TEST_DATABASE_URL must point to an isolated local kingdoms_test database without URL options.',
    );
}

describe.skipIf(!databaseUrl)('Kingdoms PostgreSQL serialization', () => {
  let db: DatabaseClient;
  let repository: typeof import('./repository');
  const userIds: string[] = [];
  const worldIds: string[] = [];
  const key = () => randomUUID();

  beforeAll(async () => {
    assertIsolatedDatabase(databaseUrl!);
    const { createPrismaClient } = await import('@tahaddi/database');
    db = createPrismaClient(databaseUrl!);
    repository = await import('./repository');
    await db.$connect();
  });

  afterAll(async () => {
    if (!db) return;
    try {
      // Only this run's exact primary keys; never truncate shared tables.
      await db.kingdomCommand.deleteMany({ where: { worldId: { in: worldIds } } });
      await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await db.kingdomWorld.deleteMany({ where: { id: { in: worldIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  });

  async function fixture(count = 1, found = true, stock = 100) {
    const identities = await Promise.all(
      Array.from({ length: count }, async () => {
        const id = `kingdom_test_${randomUUID()}`;
        userIds.push(id);
        await db.user.create({
          data: { id, name: 'اختبار الممالك', status: 'ACTIVE', role: 'USER', tokenVersion: 0 },
        });
        return { id, tokenVersion: 0 };
      }),
    );
    const [{ now }] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const state = identities.reduce(
      (world, actor) =>
        found
          ? executeCommand(
              world,
              actor.id,
              { type: 'found', name: 'مملكة الاختبار' },
              now.getTime(),
            )
          : world,
      createWorld(now.getTime(), {
        ...defaultKingdomsConfig,
        startingResources: resources(stock, stock, stock, stock, stock),
        baseProduction: resources(),
      }),
    );
    const prepared = {
      ...state,
      villages: Object.fromEntries(
        Object.entries(state.villages).map(([id, village]) => [
          id,
          { ...village, buildings: { ...village.buildings, market: 1 } },
        ]),
      ),
    };
    const worldId = `kingdom_test_${randomUUID()}`;
    worldIds.push(worldId);
    await db.kingdomWorld.create({
      data: {
        id: worldId,
        name: 'اختبار متزامن',
        state: JSON.parse(JSON.stringify(prepared)) as Prisma.InputJsonValue,
        nextEventAt: new Date(state.season.endsAt),
      },
    });
    return { worldId, identities, state: prepared };
  }

  async function stateOf(worldId: string) {
    const row = await db.kingdomWorld.findUniqueOrThrow({ where: { id: worldId } });
    return { row, state: row.state as unknown as KingdomsWorld };
  }

  async function commanderFixture(count = 1) {
    const fixtureData = await fixture(count);
    const state: KingdomsWorld = {
      ...fixtureData.state,
      villages: Object.fromEntries(
        Object.entries(fixtureData.state.villages).map(([id, village]) => [
          id,
          {
            ...village,
            resources: resources(1000, 1000, 1000, 1000, 1000),
            troops: { guard: 10, rider: 0, scout: 0, settler: 0 },
          },
        ]),
      ),
    };
    await db.kingdomWorld.update({
      where: { id: fixtureData.worldId },
      data: {
        state: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue,
      },
    });
    return { ...fixtureData, state };
  }

  it('charges once and creates one commander for concurrent identical recruitment requests', async () => {
    const {
      worldId,
      identities: [actor],
      state,
    } = await commanderFixture();
    const villageId = Object.keys(state.villages)[0];
    const idempotencyKey = key();
    const command = {
      type: 'commanderRecruit',
      villageId,
      name: 'قائد الاختبار',
      specialization: 'infantry',
    };
    await Promise.all([
      repository.commandKingdomWorld(worldId, actor, idempotencyKey, command, db),
      repository.commandKingdomWorld(worldId, actor, idempotencyKey, command, db),
    ]);
    const { row, state: saved } = await stateOf(worldId);
    expect(row.revision).toBe(1);
    expect(Object.values(saved.commanders ?? {})).toHaveLength(1);
    expect(Object.values(saved.commanders ?? {})[0]).toMatchObject({
      playerId: actor.id,
      level: 1,
      experience: 0,
    });
    expect(saved.villages[villageId].resources.gold).toBe(950);
    expect(saved.villages[villageId].resources.wood).toBe(900);
  });

  it('reserves a commander for one army when two different march requests race', async () => {
    const {
      worldId,
      identities: [actor],
      state,
    } = await commanderFixture();
    const villageId = Object.keys(state.villages)[0];
    await repository.commandKingdomWorld(
      worldId,
      actor,
      key(),
      {
        type: 'commanderRecruit',
        villageId,
        name: 'قائد الاختبار',
        specialization: 'infantry',
      },
      db,
    );
    const commanderId = Object.keys((await stateOf(worldId)).state.commanders ?? {})[0];
    const command = {
      type: 'march',
      villageId,
      commanderId,
      mission: 'gather',
      targetX: 2,
      targetY: 2,
      troops: { guard: 3, rider: 0, scout: 0, settler: 0 },
    };
    const results = await Promise.allSettled([
      repository.commandKingdomWorld(worldId, actor, key(), command, db),
      repository.commandKingdomWorld(worldId, actor, key(), command, db),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const saved = (await stateOf(worldId)).state;
    expect(saved.movements).toHaveLength(1);
    expect(saved.movements[0]).toMatchObject({ commanderId, ownerId: actor.id });
    expect(saved.commanders?.[commanderId].status).toBe('marching');
    expect(saved.villages[villageId].troops.guard).toBe(7);
    expect(await db.kingdomCommand.count({ where: { worldId } })).toBe(2);
  });

  it('rejects another player assigning a commander and does not leak the commander in their view', async () => {
    const {
      worldId,
      identities: [owner, attacker],
      state,
    } = await commanderFixture(2);
    const villageFor = (id: string) =>
      Object.values(state.villages).find((v) => v.ownerId === id)!.id;
    await repository.commandKingdomWorld(
      worldId,
      owner,
      key(),
      {
        type: 'commanderRecruit',
        villageId: villageFor(owner.id),
        name: 'قائد الاختبار',
        specialization: 'defense',
      },
      db,
    );
    const commanderId = Object.keys((await stateOf(worldId)).state.commanders ?? {})[0];
    const before = await stateOf(worldId);
    await expect(
      repository.commandKingdomWorld(
        worldId,
        attacker,
        key(),
        {
          type: 'commanderAssign',
          villageId: villageFor(attacker.id),
          commanderId,
        },
        db,
      ),
    ).rejects.toThrow();
    const after = await stateOf(worldId);
    expect(after.state).toEqual(before.state);
    expect(after.row.revision).toBe(before.row.revision);
    const view = await repository.readKingdomWorld(worldId, attacker, false, db);
    if (!('commanders' in view)) throw new Error('Expected commander player view');
    expect(view.commanders).toEqual([]);
    expect(view).not.toHaveProperty('commanderAwards');
  });

  it.each(['identical', 'different'] as const)(
    'credits one alliance event reward under simultaneous %s request keys',
    async (keyMode) => {
      const {
        worldId,
        identities: [actor, teammate],
        state,
      } = await fixture(2);
      const allianceId = 'test_alliance';
      const eventKey = 's1-w0';
      const prepared: KingdomsWorld = {
        ...state,
        alliances: {
          [allianceId]: {
            id: allianceId,
            name: 'عهد الاختبار',
            members: { [actor.id]: 'leader', [teammate.id]: 'member' },
            diplomacy: {},
          },
        },
        players: Object.fromEntries(
          Object.entries(state.players).map(([id, player]) => [
            id,
            {
              ...player,
              allianceId,
              allianceEvent: {
                eventKey,
                allianceId,
                points: id === actor.id ? 20 : 10,
                claimed: false,
                tradedWith: [],
              },
            },
          ]),
        ),
      };
      await db.kingdomWorld.update({
        where: { id: worldId },
        data: { state: JSON.parse(JSON.stringify(prepared)) as Prisma.InputJsonValue },
      });
      const villageId = Object.values(state.villages).find((v) => v.ownerId === actor.id)!.id;
      const firstKey = key();
      const command = { type: 'allianceEventClaim', villageId, eventKey };
      const results = await Promise.allSettled([
        repository.commandKingdomWorld(worldId, actor, firstKey, command, db),
        repository.commandKingdomWorld(
          worldId,
          actor,
          keyMode === 'identical' ? firstKey : key(),
          command,
          db,
        ),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(
        keyMode === 'identical' ? 2 : 1,
      );
      const view = await repository.readKingdomWorld(worldId, actor, false, db);
      if (!('allianceEvent' in view)) throw new Error('Expected a player world view');
      expect(view.revision).toBe(1);
      expect(view.allianceEvent?.claimed).toBe(true);
      expect(view.allianceEvent?.canClaim).toBe(false);
      expect(view.villages.find((v) => v.id === villageId)?.resources).toEqual(
        resources(200, 200, 200, 200, 125),
      );
      expect(view.player?.score).toBe(0);
    },
  );

  it('reserves one gathering army under simultaneous identical request keys', async () => {
    const {
      worldId,
      identities: [actor],
      state,
    } = await fixture();
    const villageId = Object.keys(state.villages)[0];
    const prepared = {
      ...state,
      villages: {
        ...state.villages,
        [villageId]: {
          ...state.villages[villageId],
          troops: { guard: 10, rider: 0, scout: 0, settler: 0 },
        },
      },
    };
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(JSON.stringify(prepared)) as Prisma.InputJsonValue,
      },
    });
    const idempotencyKey = key();
    const command = {
      type: 'march',
      villageId,
      targetX: 2,
      targetY: 2,
      mission: 'gather',
      troops: { guard: 3, rider: 0, scout: 0, settler: 0 },
    };
    await Promise.all([
      repository.commandKingdomWorld(worldId, actor, idempotencyKey, command, db),
      repository.commandKingdomWorld(worldId, actor, idempotencyKey, command, db),
    ]);
    const { row, state: saved } = await stateOf(worldId);
    expect(row.revision).toBe(1);
    expect(saved.movements).toHaveLength(1);
    expect(saved.movements[0]).toMatchObject({ ownerId: actor.id, mission: 'gather' });
    expect(saved.villages[villageId].troops.guard).toBe(7);
    expect(saved.villages[villageId].resources.wood).toBe(100);
  });

  it('two simultaneous workers share one finite deposit without double collection', async () => {
    const { worldId, identities, state } = await fixture(2);
    const [{ now }] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const arrivesAt = now.getTime() - 1_000;
    const prepared: KingdomsWorld = {
      ...state,
      updatedAt: arrivesAt - 1_000,
      season: { ...state.season, startsAt: arrivesAt - 60_000 },
      villages: Object.fromEntries(
        Object.entries(state.villages).map(([id, village]) => [
          id,
          {
            ...village,
            updatedAt: arrivesAt - 1_000,
            troops: { guard: 0, rider: 0, scout: 0, settler: 0 },
          },
        ]),
      ),
      movements: identities.map((actor, index) => ({
        id: `gather_${index}`,
        ownerId: actor.id,
        sourceId: Object.values(state.villages).find((v) => v.ownerId === actor.id)!.id,
        targetX: 2,
        targetY: 2,
        mission: 'gather',
        troops: { guard: 10, rider: 0, scout: 0, settler: 0 },
        departedAt: arrivesAt - 60_000,
        arrivesAt,
        travelMs: 60_000,
        loot: resources(),
        gather: { siteId: 'site_2_2', resource: 'wood' },
      })),
    };
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(JSON.stringify(prepared)) as Prisma.InputJsonValue,
        nextEventAt: new Date(arrivesAt),
      },
    });
    const results = await Promise.all([
      repository.tickKingdomWorlds(db),
      repository.tickKingdomWorlds(db),
    ]);
    expect(
      results.flatMap((result) => result.worlds).filter((world) => world.id === worldId),
    ).toHaveLength(1);
    const { row, state: saved } = await stateOf(worldId);
    expect(row.revision).toBe(1);
    expect(saved.movements).toHaveLength(2);
    expect(saved.movements.every((m) => m.mission === 'return')).toBe(true);
    expect(saved.movements.reduce((sum, m) => sum + m.loot.wood, 0)).toBe(600);
    expect(saved.movements.map((m) => m.loot.wood).sort((a, b) => a - b)).toEqual([200, 400]);
    expect(Object.values(saved.villages).every((v) => v.resources.wood === 100)).toBe(true);
  });

  it('derives established village progression consistently from legacy persisted JSON', async () => {
    const {
      worldId,
      identities: [actor],
      state,
    } = await fixture();
    const village = Object.values(state.villages)[0];
    const legacyVillage = Object.fromEntries(
      Object.entries(village).filter(([field]) => field !== 'progression'),
    );
    const legacy = {
      ...state,
      villages: {
        [village.id]: {
          ...legacyVillage,
          buildings: Object.fromEntries(
            Object.keys(village.buildings).map((building) => [building, 10]),
          ),
        },
      },
    };
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: { state: JSON.parse(JSON.stringify(legacy)) as Prisma.InputJsonValue },
    });
    const first = await repository.readKingdomWorld(worldId, actor, false, db);
    const second = await repository.readKingdomWorld(worldId, actor, false, db);
    expect(first).toMatchObject({ villages: [{ progression: { version: 1 } }] });
    if (!('villages' in first) || !('villages' in second)) throw new Error('Expected player view');
    const progression = first.villages[0].progression;
    if (!progression) throw new Error('Expected server-derived progression');
    expect(progression.level).toBeGreaterThan(1);
    expect(progression.xp).toBeGreaterThan(0);
    expect(progression.power.total).toBeGreaterThan(0);
    expect(second.villages[0]).toMatchObject({ progression });
  });

  it('persists every overdue queue completion and XP once across repeated worker ticks', async () => {
    const {
      worldId,
      identities: [actor],
      state,
    } = await fixture();
    const departedAt = state.updatedAt - 5 * 60 * 60 * 1000;
    const founded = executeCommand(
      createWorld(departedAt, {
        ...defaultKingdomsConfig,
        startingResources: resources(900, 900, 900, 900, 900),
        baseProduction: resources(),
      }),
      actor.id,
      { type: 'found', name: 'قرية البناء' },
      departedAt,
    );
    const villageId = Object.keys(founded.villages)[0];
    const farm = executeCommand(
      founded,
      actor.id,
      { type: 'build', villageId, building: 'farm' },
      departedAt,
    );
    const building = (['wall', 'warehouse'] as const).reduce(
      (world, name) =>
        executeCommand(world, actor.id, { type: 'build', villageId, building: name }, departedAt),
      farm,
    );
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(JSON.stringify(building)) as Prisma.InputJsonValue,
        nextEventAt: repository.nextDeadline(building),
      },
    });
    const tick = await repository.tickKingdomWorlds(db);
    expect(tick.worlds).toContainEqual({ id: worldId, revision: 1 });
    const first = await repository.readKingdomWorld(worldId, actor, false, db);
    expect(first).toMatchObject({
      revision: 1,
      villages: [
        {
          buildings: { farm: 1, wall: 1, warehouse: 1 },
          progression: { xp: 300, level: 5 },
          constructionQueue: [
            { status: 'COMPLETED' },
            { status: 'COMPLETED' },
            { status: 'COMPLETED' },
          ],
        },
      ],
    });
    await repository.tickKingdomWorlds(db);
    const replay = await repository.readKingdomWorld(worldId, actor, false, db);
    expect(replay).toMatchObject({
      revision: 1,
      villages: [{ progression: { xp: 300, level: 5 } }],
    });
  });

  it.each(['villageLevel', 'villagePower', 'xp', 'resources', 'battleResult'])(
    'rejects client-supplied %s before any persistent resource mutation',
    async (field) => {
      const {
        worldId,
        identities: [actor],
        state,
      } = await fixture();
      const villageId = Object.keys(state.villages)[0];
      await expect(
        repository.commandKingdomWorld(
          worldId,
          actor,
          key(),
          {
            type: 'build',
            villageId,
            building: 'farm',
            [field]: 999999,
          },
          db,
        ),
      ).rejects.toThrow();
      const view = await repository.readKingdomWorld(worldId, actor, false, db);
      expect(view).toMatchObject({
        revision: 0,
        villages: [{ resources: resources(100, 100, 100, 100, 100) }],
      });
    },
  );

  it('enqueues a retried second construction once and debits its reserved cost once', async () => {
    const {
      worldId,
      identities: [actor],
      state,
    } = await fixture();
    const villageId = Object.keys(state.villages)[0];
    const funded = {
      ...state,
      villages: {
        [villageId]: {
          ...state.villages[villageId],
          resources: resources(900, 900, 900, 900, 900),
        },
      },
    };
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: { state: JSON.parse(JSON.stringify(funded)) as Prisma.InputJsonValue },
    });
    await repository.commandKingdomWorld(
      worldId,
      actor,
      key(),
      { type: 'build', villageId, building: 'farm' },
      db,
    );
    const idempotencyKey = key();
    const enqueue = () =>
      repository.commandKingdomWorld(
        worldId,
        actor,
        idempotencyKey,
        { type: 'build', villageId, building: 'warehouse' },
        db,
      );
    const [first, retry] = await Promise.all([enqueue(), enqueue()]);
    expect(first.revision).toBe(2);
    expect(retry.revision).toBe(2);
    const view = await repository.readKingdomWorld(worldId, actor, false, db);
    expect(view).toMatchObject({
      revision: 2,
      villages: [
        {
          resources: resources(700, 660, 810, 840, 900),
          constructionQueue: [
            { building: 'farm', status: 'BUILDING' },
            { building: 'warehouse', status: 'QUEUED' },
          ],
        },
      ],
    });
  });

  it('serializes competing construction costs without spending the same balance twice', async () => {
    const {
      worldId,
      identities: [actor],
      state,
    } = await fixture();
    const villageId = Object.keys(state.villages)[0];
    const command = { type: 'build', villageId, building: 'farm' };
    const attempts = await Promise.allSettled([
      repository.commandKingdomWorld(worldId, actor, key(), command, db),
      repository.commandKingdomWorld(worldId, actor, key(), command, db),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const view = await repository.readKingdomWorld(worldId, actor, false, db);
    expect(view).toMatchObject({
      revision: 1,
      villages: [{ resources: resources(20, 20, 70, 80, 100) }],
    });
  });

  it('authorizes queue cancellation and refunds once under concurrent retries', async () => {
    const {
      worldId,
      identities: [actor, other],
      state,
    } = await fixture(2, true, 900);
    const villageId = Object.values(state.villages).find(
      (village) => village.ownerId === actor.id,
    )!.id;
    await repository.commandKingdomWorld(
      worldId,
      actor,
      key(),
      { type: 'build', villageId, building: 'farm' },
      db,
    );
    const queued = await repository.commandKingdomWorld(
      worldId,
      actor,
      key(),
      { type: 'build', villageId, building: 'warehouse' },
      db,
    );
    const item = queued.villages[0].constructionQueue?.find((entry) => entry.status === 'QUEUED');
    if (!item) throw new Error('Expected queued warehouse');
    const command = { type: 'cancelBuild', villageId, itemId: item.id };
    await expect(
      repository.commandKingdomWorld(worldId, other, key(), command, db),
    ).rejects.toThrow();
    const idempotencyKey = key();
    const cancel = () =>
      repository.commandKingdomWorld(worldId, actor, idempotencyKey, command, db);
    const [first, retry] = await Promise.all([cancel(), cancel()]);
    expect(first.revision).toBe(3);
    expect(retry.revision).toBe(3);
    await expect(
      repository.commandKingdomWorld(worldId, actor, key(), command, db),
    ).rejects.toThrow();
    const view = await repository.readKingdomWorld(worldId, actor, false, db);
    expect(view).toMatchObject({
      revision: 3,
      villages: [
        {
          resources: resources(820, 820, 870, 880, 900),
          constructionQueue: [
            { building: 'farm', status: 'BUILDING' },
            { building: 'warehouse', status: 'CANCELLED' },
          ],
        },
      ],
    });
  });

  it('applies simultaneous identical idempotency keys exactly once', async () => {
    const {
      worldId,
      identities: [actor],
    } = await fixture(1, false);
    const idempotencyKey = key();
    const command = { type: 'found', name: 'مملكة الاختبار' };
    const replies = await Promise.all([
      repository.commandKingdomWorld(worldId, actor, idempotencyKey, command, db),
      repository.commandKingdomWorld(worldId, actor, idempotencyKey, command, db),
    ]);
    expect(replies[0].revision).toBe(replies[1].revision);
    const { row, state } = await stateOf(worldId);
    expect(row.revision).toBe(1);
    expect(Object.keys(state.villages)).toHaveLength(1);
    expect(await db.kingdomCommand.count({ where: { worldId } })).toBe(1);
  });

  it('rejects replay key reuse with a different payload', async () => {
    const {
      worldId,
      identities: [actor],
    } = await fixture(1, false);
    const idempotencyKey = key();
    await repository.commandKingdomWorld(
      worldId,
      actor,
      idempotencyKey,
      { type: 'found', name: 'الاسم الأول' },
      db,
    );
    await expect(
      repository.commandKingdomWorld(
        worldId,
        actor,
        idempotencyKey,
        { type: 'found', name: 'الاسم الآخر' },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await stateOf(worldId)).row.revision).toBe(1);
  });

  it('serializes different keys spending the same resource balance', async () => {
    const {
      worldId,
      identities: [actor],
      state,
    } = await fixture();
    const villageId = Object.keys(state.villages)[0];
    const command = { type: 'tradeOffer', villageId, give: resources(80), want: resources(0, 1) };
    const attempts = await Promise.allSettled([
      repository.commandKingdomWorld(worldId, actor, key(), command, db),
      repository.commandKingdomWorld(worldId, actor, key(), command, db),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const saved = (await stateOf(worldId)).state;
    expect(saved.villages[villageId].resources.wood).toBe(20);
    expect(saved.offers).toHaveLength(1);
    expect(await db.kingdomCommand.count({ where: { worldId } })).toBe(1);
  });

  it('allows only one of two players to accept the same escrow offer', async () => {
    const { worldId, identities, state } = await fixture(3);
    const villageFor = (owner: string) =>
      Object.values(state.villages).find((village) => village.ownerId === owner)!.id;
    await repository.commandKingdomWorld(
      worldId,
      identities[0],
      key(),
      {
        type: 'tradeOffer',
        villageId: villageFor(identities[0].id),
        give: resources(80),
        want: resources(0, 1),
      },
      db,
    );
    const offerId = (await stateOf(worldId)).state.offers[0].id;
    const attempts = await Promise.allSettled(
      identities
        .slice(1)
        .map((actor) =>
          repository.commandKingdomWorld(
            worldId,
            actor,
            key(),
            { type: 'tradeAccept', villageId: villageFor(actor.id), offerId },
            db,
          ),
        ),
    );
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const saved = (await stateOf(worldId)).state;
    expect(saved.offers).toHaveLength(0);
    expect(saved.villages[villageFor(identities[0].id)].resources.stone).toBe(101);
    expect(
      Object.values(saved.villages).reduce((sum, village) => sum + village.resources.wood, 0),
    ).toBe(300);
    expect(
      Object.values(saved.villages).reduce((sum, village) => sum + village.resources.stone, 0),
    ).toBe(300);
  });

  it('rejects revoked identities before replay and rejects ordinary-player admin access', async () => {
    const {
      worldId,
      identities: [actor],
    } = await fixture(1, false);
    const idempotencyKey = key();
    const command = { type: 'found', name: 'مملكة الاختبار' };
    await repository.commandKingdomWorld(worldId, actor, idempotencyKey, command, db);
    await expect(repository.readKingdomWorld(worldId, actor, true, db)).rejects.toMatchObject({
      status: 403,
    });
    await db.user.update({ where: { id: actor.id }, data: { tokenVersion: 1 } });
    await expect(
      repository.commandKingdomWorld(worldId, actor, idempotencyKey, command, db),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('two simultaneous workers complete one due training event exactly once', async () => {
    const { worldId, state } = await fixture();
    const villageId = Object.keys(state.villages)[0];
    const [{ now }] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const endsAt = now.getTime() - 1_000;
    const prepared = {
      ...state,
      updatedAt: endsAt - 1_000,
      villages: {
        ...state.villages,
        [villageId]: {
          ...state.villages[villageId],
          updatedAt: endsAt - 1_000,
          training: { unit: 'guard', count: 7, endsAt },
        },
      },
    };
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(JSON.stringify(prepared)) as Prisma.InputJsonValue,
        nextEventAt: new Date(endsAt),
      },
    });
    const results = await Promise.all([
      repository.tickKingdomWorlds(db),
      repository.tickKingdomWorlds(db),
    ]);
    expect(
      results.flatMap((result) => result.worlds).filter((world) => world.id === worldId),
    ).toHaveLength(1);
    const { row, state: saved } = await stateOf(worldId);
    expect(row.revision).toBe(1);
    expect(saved.villages[villageId].training).toBeUndefined();
    expect(saved.villages[villageId].troops.guard).toBe(7);
    expect(saved.reports.filter((report) => report.title === 'اكتمل التدريب')).toHaveLength(1);
    expect(row.nextEventAt?.getTime()).toBe(saved.season.endsAt);
  });

  it('rolls back the entire transaction and receipt when a command is invalid', async () => {
    const {
      worldId,
      identities: [actor],
      state,
    } = await fixture();
    const before = await stateOf(worldId);
    await expect(
      repository.commandKingdomWorld(
        worldId,
        actor,
        key(),
        {
          type: 'tradeOffer',
          villageId: Object.keys(state.villages)[0],
          give: resources(101),
          want: resources(0, 1),
        },
        db,
      ),
    ).rejects.toThrow();
    const after = await stateOf(worldId);
    expect(after.state).toEqual(before.state);
    expect(after.row.revision).toBe(before.row.revision);
    expect(await db.kingdomCommand.count({ where: { worldId } })).toBe(0);
  });

  it('idempotently creates a world and records one admin audit event', async () => {
    const {
      identities: [actor],
    } = await fixture(1, false);
    // The existing database trigger revokes sessions when a role changes.
    const admin = await db.user.update({
      where: { id: actor.id },
      data: { role: 'ADMIN' },
      select: { id: true, tokenVersion: true },
    });
    const idempotencyKey = key();
    const create = () =>
      repository.createKingdomWorld(admin, idempotencyKey, 'موسم إداري', undefined, db);
    const results = await Promise.all([create(), create()]);
    worldIds.push(results[0].id);
    expect(results[0]).toEqual(results[1]);
    expect(await db.kingdomCommand.count({ where: { worldId: results[0].id } })).toBe(1);
    const audits = await db.auditLog.findMany({
      where: { actorId: actor.id, resourceId: results[0].id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'KINGDOMS_CREATE',
      actorRole: 'ADMIN',
      result: 'SUCCESS',
      requestId: idempotencyKey,
    });
    await expect(
      repository.createKingdomWorld(admin, idempotencyKey, 'اسم مختلف', undefined, db),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('audits configuration changes once and prevents a replay from mutating again', async () => {
    const {
      worldId,
      identities: [actor],
    } = await fixture();
    const admin = await db.user.update({
      where: { id: actor.id },
      data: { role: 'ADMIN' },
      select: { id: true, tokenVersion: true },
    });
    const idempotencyKey = key();
    const change = { action: 'configure', secondsPerTile: 120 };
    const mutate = (state: KingdomsWorld) => ({
      ...state,
      config: { ...state.config, secondsPerTile: 120 },
    });
    const edit = () =>
      repository.editKingdomWorld(worldId, admin, idempotencyKey, change, mutate, undefined, db);
    const replies = await Promise.all([edit(), edit()]);
    expect(replies[0].revision).toBe(replies[1].revision);
    expect((await stateOf(worldId)).state.config.secondsPerTile).toBe(120);
    const audits = await db.auditLog.findMany({
      where: { actorId: actor.id, resourceId: worldId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'KINGDOMS_CONFIGURE',
      after: change,
      requestId: idempotencyKey,
    });
    expect(await db.kingdomCommand.count({ where: { worldId } })).toBe(1);
  });

  it('serializes administrator relocation and audits the actual administrator once', async () => {
    const {
      worldId,
      identities: [originalAdmin, owner],
      state,
    } = await fixture(2);
    const admin = await db.user.update({
      where: { id: originalAdmin.id },
      data: { role: 'ADMIN' },
      select: { id: true, tokenVersion: true },
    });
    const prepared = provisionVillageGeography(worldId, state);
    const village = Object.values(state.villages).find((entry) => entry.ownerId === owner.id)!;
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(JSON.stringify(prepared)) as Prisma.InputJsonValue,
      },
    });
    const change = {
      action: 'relocate',
      villageId: village.id,
      expectedOwnerId: owner.id,
      longitude: 51.53096,
      latitude: 25.28545,
      confirmed: true,
    };
    const edit = () =>
      repository.editKingdomWorld(
        worldId,
        admin,
        key(),
        change,
        (locked, now, context) =>
          relocateVillageForAdministration(
            locked,
            {
              worldId,
              administratorId: admin.id,
              villageId: village.id,
              expectedOwnerId: owner.id,
              ...context,
            },
            change,
            now,
          ),
        undefined,
        db,
      );
    const replies = await Promise.allSettled([edit(), edit()]);
    expect(replies.filter((reply) => reply.status === 'fulfilled')).toHaveLength(1);
    expect(replies.find((reply) => reply.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    });
    const saved = (await stateOf(worldId)).state as VillageRelocationWorld;
    expect(saved.villages[village.id].ownerId).toBe(owner.id);
    expect(saved.geography!.villageRelocations![village.id]).toMatchObject({
      actorId: admin.id,
      longitude: change.longitude,
      latitude: change.latitude,
    });
    const audits = await db.auditLog.findMany({
      where: { actorId: admin.id, resourceId: worldId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].after).toEqual(change);
    expect(await db.kingdomCommand.count({ where: { worldId } })).toBe(1);
  });

  it('passes locked pause state to administrator relocation and leaves the village untouched', async () => {
    const {
      worldId,
      identities: [originalAdmin, owner],
      state,
    } = await fixture(2);
    const admin = await db.user.update({
      where: { id: originalAdmin.id },
      data: { role: 'ADMIN' },
      select: { id: true, tokenVersion: true },
    });
    const prepared = provisionVillageGeography(worldId, state);
    const village = Object.values(state.villages).find((entry) => entry.ownerId === owner.id)!;
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        paused: true,
        state: JSON.parse(JSON.stringify(prepared)) as Prisma.InputJsonValue,
      },
    });
    const change = { longitude: 51.53096, latitude: 25.28545 };
    await expect(
      repository.editKingdomWorld(
        worldId,
        admin,
        key(),
        change,
        (locked, now, context) =>
          relocateVillageForAdministration(
            locked,
            {
              worldId,
              administratorId: admin.id,
              villageId: village.id,
              expectedOwnerId: owner.id,
              ...context,
            },
            change,
            now,
          ),
        undefined,
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const saved = (await stateOf(worldId)).state as VillageRelocationWorld;
    expect(saved.geography!.villageRelocations?.[village.id]).toBeUndefined();
    expect(await db.auditLog.count({ where: { actorId: admin.id, resourceId: worldId } })).toBe(0);
    expect(await db.kingdomCommand.count({ where: { worldId } })).toBe(0);
  });

  it('rejects a session revoked while its command waits for the world lock', async () => {
    const {
      worldId,
      identities: [actor],
    } = await fixture(1, false);
    let signalLocked!: (pid: number) => void;
    let releaseLock!: () => void;
    const locked = new Promise<number>((resolve) => {
      signalLocked = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const holder = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "KingdomWorld" WHERE id = ${worldId} FOR UPDATE`;
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        signalLocked(pid);
        await released;
      },
      { maxWait: 3_000, timeout: 10_000 },
    );
    let queued: Promise<unknown> | undefined;
    try {
      const holderPid = await Promise.race([
        locked,
        holder.then(() => {
          throw new Error('Lock holder ended before signaling');
        }),
      ]);
      queued = repository
        .commandKingdomWorld(worldId, actor, key(), { type: 'found', name: 'طلب معلق' }, db)
        .then(
          (value) => ({ ok: true, value }),
          (error: unknown) => ({ ok: false, error }),
        );
      // Observe actual PostgreSQL lock contention, not timing assumptions or sleep.
      const deadline = Date.now() + 3_000;
      let waiting = false;
      for (let attempt = 0; attempt < 200 && Date.now() < deadline && !waiting; attempt++) {
        const [row] = await db.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database()
              AND ${holderPid} = ANY(pg_blocking_pids(pid))
          ) AS waiting`;
        waiting = row.waiting;
      }
      expect(waiting).toBe(true);
      await db.user.update({ where: { id: actor.id }, data: { tokenVersion: 1 } });
      releaseLock();
      await holder;
      expect(await queued).toMatchObject({ ok: false, error: { status: 401 } });
      expect((await stateOf(worldId)).row.revision).toBe(0);
      expect(await db.kingdomCommand.count({ where: { worldId } })).toBe(0);
    } finally {
      releaseLock();
      await Promise.allSettled([holder, ...(queued ? [queued] : [])]);
    }
  }, 20_000);
});

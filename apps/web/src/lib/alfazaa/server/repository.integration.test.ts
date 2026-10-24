import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';
import { readAlfazaa, commandAlfazaa, type AlfazaaIdentity } from './repository';
import { createInitialState } from '../domain';
import { systemsCatalog } from '../realm/systems-catalog';
import { stableFingerprint } from './http';
import { createSharedWorld, applySharedCommand, type SharedWorld } from '../realm/world-engine';
import { WORLD_ID } from './world-repository';

// Never fall back to the application's DATABASE_URL. Provision/migrate an
// explicitly isolated local database before running this suite.
const databaseUrl = process.env.ALFAZAA_TEST_DATABASE_URL;
function assertLocalDatabase(value: string) {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !(
      (url.port === '55441' && url.pathname === '/alfazaa_world_test') ||
      /^\/alfazaa_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname)
    ) ||
    url.search ||
    url.hash
  )
    throw new Error('Alfazaa integration tests require an isolated local alfazaa_test database.');
}

describe.skipIf(!databaseUrl)('Alfazaa PostgreSQL account serialization', () => {
  let db: DatabaseClient;
  const userIds: string[] = [];
  beforeAll(async () => {
    assertLocalDatabase(databaseUrl!);
    const { createPrismaClient } = await import('@tahaddi/database');
    db = createPrismaClient(databaseUrl!);
    await db.$connect();
  });
  afterAll(async () => {
    if (!db) return;
    try {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  });
  async function identity(): Promise<AlfazaaIdentity> {
    const id = `alfazaa_test_${randomUUID()}`;
    userIds.push(id);
    await db.user.create({
      data: { id, name: 'اختبار الفزعة', status: 'ACTIVE', tokenVersion: 0 },
    });
    return { id, tokenVersion: 0 };
  }
  const command = (idempotencyKey = randomUUID()) => ({
    idempotencyKey,
    expectedRevision: 0,
    command: { type: 'merge', from: 0, to: 1 },
  });

  it('serializes simultaneous first visits without a unique-key race', async () => {
    const actor = await identity();
    const results = await Promise.all([readAlfazaa(actor, db), readAlfazaa(actor, db)]);
    expect(results.map((result) => result.revision)).toEqual([0, 0]);
    expect(results.map((result) => result.state.cells.filter(Boolean).length)).toEqual([3, 3]);
    expect(results.map((result) => result.state.version)).toEqual([3, 3]);
    expect(results[0].state.cells[35]).toMatchObject({ kind: 'building', cfgId: 40001 });
  });
  it('persists v2 migration once and normalizes historical receipts without rewriting current progress', async () => {
    const actor = await identity();
    const initial = createInitialState(Date.now() - 60000);
    const { realm, ...old } = initial;
    const legacy = { ...old, version: 2, revision: 7 };
    await db.alfazaaState.create({
      data: { userId: actor.id, state: JSON.parse(JSON.stringify(legacy)), revision: 7 },
    });
    const first = await readAlfazaa(actor, db);
    expect(first.state.version).toBe(3);
    expect(first.state.realm.heroes.roster).toEqual(realm.heroes.roster);
    expect(first.revision).toBe(8);
    expect(
      (await db.alfazaaState.findUniqueOrThrow({ where: { userId: actor.id } })).state,
    ).toMatchObject({ version: 3 });
    expect((await readAlfazaa(actor, db)).revision).toBe(8);
    const request = {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      command: { type: 'merge', from: 0, to: 1 },
    };
    await db.alfazaaCommand.create({
      data: {
        userId: actor.id,
        key: request.idempotencyKey,
        fingerprint: stableFingerprint({ expectedRevision: 0, command: request.command }),
        result: JSON.parse(JSON.stringify({ state: { ...legacy, revision: 1 }, revision: 1 })),
      },
    });
    const replay = await commandAlfazaa(actor, request, db);
    expect(replay.state.version).toBe(3);
    expect(replay.revision).toBe(1);
    expect(
      (await db.alfazaaState.findUniqueOrThrow({ where: { userId: actor.id } })).revision,
    ).toBe(8);
  });
  it('settles due training jobs and their XP once across concurrent reads', async () => {
    const actor = await identity();
    const initial = createInitialState(Date.now() - 60000);
    initial.realm.systems.jobs = [
      {
        id: 1,
        kind: 'training',
        target: 10001,
        count: 2,
        startedAt: initial.updatedAt,
        finishAt: initial.updatedAt + 1000,
      },
    ];
    initial.realm.systems.nextJobId = 2;
    await db.alfazaaState.create({
      data: { userId: actor.id, state: JSON.parse(JSON.stringify(initial)), revision: 0 },
    });
    const [one, two] = await Promise.all([readAlfazaa(actor, db), readAlfazaa(actor, db)]);
    expect(one.state.realm.systems.reserve['10001']).toBe(2);
    expect(two.state.realm.systems.reserve['10001']).toBe(2);
    const xp = systemsCatalog.arms.find((a) => a.id === 10001)!.xp;
    expect(two.state.balances['1200001']).toBe(xp * 2);
    expect(one.revision).toBe(1);
    expect(two.revision).toBe(1);
    const stored = await db.alfazaaState.findUniqueOrThrow({ where: { userId: actor.id } });
    expect(stored.state).toMatchObject({
      realm: { systems: { jobs: [], reserve: { '10001': 2 } } },
    });
  });
  it('replays hero spending and quest rewards once through the same account command boundary', async () => {
    const actor = await identity();
    const initial = createInitialState(Date.now() - 1000);
    initial.realm.heroes.stamina = 50;
    initial.realm.systems.lifetime['tower-win'] = 1;
    await db.alfazaaState.create({
      data: { userId: actor.id, state: JSON.parse(JSON.stringify(initial)), revision: 0 },
    });
    const rest = {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      command: { type: 'hero-rest' },
    };
    const [first, retry] = await Promise.all([
      commandAlfazaa(actor, rest, db),
      commandAlfazaa(actor, rest, db),
    ]);
    expect(first).toEqual(retry);
    expect(first.state.realm.heroes.stamina).toBeGreaterThan(50);
    expect(first.state.balances['400001']).toBeLessThan(initial.balances['400001']);
    const claim = {
      idempotencyKey: randomUUID(),
      expectedRevision: first.revision,
      command: { type: 'systems-claim', family: 'main', id: 100010 },
    };
    const [reward, replayed] = await Promise.all([
      commandAlfazaa(actor, claim, db),
      commandAlfazaa(actor, claim, db),
    ]);
    expect(reward).toEqual(replayed);
    expect(reward.state.balances['400001']).toBe(first.state.balances['400001'] + 9000);
    expect(reward.state.realm.systems.claims).toContain('main:100010');
    await expect(
      commandAlfazaa(
        actor,
        { ...claim, idempotencyKey: randomUUID(), expectedRevision: reward.revision },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('uses actual server world membership for a gated quest and rejects client-forged context', async () => {
    const actor = await identity();
    const initial = await readAlfazaa(actor, db);
    const request = {
      idempotencyKey: randomUUID(),
      expectedRevision: initial.revision,
      command: { type: 'systems-claim', family: 'milestone', id: 100040 },
    };
    await expect(
      commandAlfazaa(actor, { ...request, world: { allianceMember: true } }, db),
    ).rejects.toThrow();
    await expect(commandAlfazaa(actor, request, db)).rejects.toMatchObject({ status: 409 });
    const previous = await db.alfazaaWorld.findUnique({ where: { id: WORLD_ID } });
    try {
      const now = Date.now();
      let world: SharedWorld = previous
        ? JSON.parse(JSON.stringify(previous.state))
        : createSharedWorld(now);
      world = applySharedCommand(world, actor.id, { type: 'join', name: 'اختبار التحالف' }, now);
      const village = Object.values(world.game.villages).find((v) => v.ownerId === actor.id)!;
      village.buildings.embassy = 1;
      world = applySharedCommand(
        world,
        actor.id,
        { type: 'outpost', action: { type: 'allianceCreate', name: 'اختبار' } },
        now,
      );
      await db.alfazaaWorld.upsert({
        where: { id: WORLD_ID },
        create: { id: WORLD_ID, state: JSON.parse(JSON.stringify(world)), revision: 0 },
        update: { state: JSON.parse(JSON.stringify(world)) },
      });
      const granted = await commandAlfazaa(actor, { ...request, idempotencyKey: randomUUID() }, db);
      expect(granted.state.realm.systems.claims).toContain('milestone:100040');
      expect(granted.world?.allianceMember).toBe(true);
    } finally {
      if (previous)
        await db.alfazaaWorld.update({
          where: { id: WORLD_ID },
          data: { state: JSON.parse(JSON.stringify(previous.state)), revision: previous.revision },
        });
      else await db.alfazaaWorld.deleteMany({ where: { id: WORLD_ID } });
    }
  });
  it('allows exactly one concurrent command at the same revision', async () => {
    const actor = await identity();
    const results = await Promise.allSettled([
      commandAlfazaa(actor, command(), db),
      commandAlfazaa(actor, command(), db),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.status).toBe(409);
    const stored = await readAlfazaa(actor, db);
    expect(stored.revision).toBe(1);
    expect(stored.state.cells.filter(Boolean)).toHaveLength(2);
  });
  it('replays identical concurrent retries and keeps another account independent', async () => {
    const actor = await identity();
    const other = await identity();
    const request = command();
    const [first, retry] = await Promise.all([
      commandAlfazaa(actor, request, db),
      commandAlfazaa(actor, request, db),
    ]);
    expect(first).toEqual(retry);
    expect((await readAlfazaa(actor, db)).revision).toBe(1);
    expect((await readAlfazaa(other, db)).revision).toBe(0);
  });
  it('denies revoked identities and keeps Data API roles away from both storage tables', async () => {
    const actor = await identity();
    await readAlfazaa(actor, db);
    await db.user.update({ where: { id: actor.id }, data: { tokenVersion: 1 } });
    await expect(commandAlfazaa(actor, command(), db)).rejects.toMatchObject({ status: 401 });
    const tables = await db.$queryRaw<{ name: string; enabled: boolean }[]>`
      SELECT relname AS name, relrowsecurity AS enabled FROM pg_class
      WHERE oid IN ('"AlfazaaState"'::regclass, '"AlfazaaCommand"'::regclass)`;
    expect(tables).toHaveLength(2);
    expect(tables.every((table) => table.enabled)).toBe(true);
    const grants = await db.$queryRaw<{ allowed: boolean }[]>`
      SELECT has_table_privilege(rolname, '"AlfazaaState"', 'SELECT,INSERT,UPDATE,DELETE')
        OR has_table_privilege(rolname, '"AlfazaaCommand"', 'SELECT,INSERT,UPDATE,DELETE') AS allowed
      FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`;
    expect(grants.some((grant) => grant.allowed)).toBe(false);
  });
  it('retains exactly the latest 128 idempotent outcomes without allowing an expired command to run again', async () => {
    const actor = await identity();
    const requests = Array.from({ length: 130 }, (_, index) => ({
      idempotencyKey: randomUUID(),
      expectedRevision: index,
      command: { type: 'tower-quit' },
    }));
    for (const request of requests) await commandAlfazaa(actor, request, db);
    await expect(commandAlfazaa(actor, requests[0], db)).rejects.toMatchObject({ status: 409 });
    await expect(commandAlfazaa(actor, requests[1], db)).rejects.toMatchObject({ status: 409 });
    expect((await commandAlfazaa(actor, requests[2], db)).revision).toBe(3);
    expect((await commandAlfazaa(actor, requests[129], db)).revision).toBe(130);
    expect((await readAlfazaa(actor, db)).revision).toBe(130);
  }, 15_000);
  it('keeps a daily claim consumed after a fresh receipt key and after the old receipt is pruned', async () => {
    const actor = await identity();
    const before = await readAlfazaa(actor, db);
    const request = {
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      command: { type: 'claim-quest', questId: 'daily-attendance' },
    };
    const granted = await commandAlfazaa(actor, request, db);
    expect(granted.state.balances).toEqual({
      ...before.state.balances,
      '400091': 5,
      '420001': 5,
      '110001': 220,
      '200127': 50,
    });
    expect(await commandAlfazaa(actor, request, db)).toEqual(granted);
    await expect(
      commandAlfazaa(actor, { ...request, idempotencyKey: randomUUID(), expectedRevision: 1 }, db),
    ).rejects.toMatchObject({ status: 409 });
    for (let index = 0; index < 130; index++)
      await commandAlfazaa(
        actor,
        {
          idempotencyKey: randomUUID(),
          expectedRevision: index + 1,
          command: { type: 'tower-quit' },
        },
        db,
      );
    await expect(commandAlfazaa(actor, request, db)).rejects.toMatchObject({ status: 409 });
    await expect(
      commandAlfazaa(
        actor,
        { ...request, idempotencyKey: randomUUID(), expectedRevision: 131 },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const stored = await readAlfazaa(actor, db);
    expect(stored.revision).toBe(131);
    expect(stored.state.balances).toEqual(granted.state.balances);
    expect(stored.state.quests).toEqual(granted.state.quests);
  }, 15_000);
  it('grants only one reward for concurrent daily claims and leaves another account independent', async () => {
    const actor = await identity(),
      other = await identity();
    const before = await readAlfazaa(actor, db);
    const request = () => ({
      idempotencyKey: randomUUID(),
      expectedRevision: 0,
      command: { type: 'claim-quest', questId: 'daily-attendance' },
    });
    const results = await Promise.allSettled([
      commandAlfazaa(actor, request(), db),
      commandAlfazaa(actor, request(), db),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.status).toBe(409);
    const stored = await readAlfazaa(actor, db);
    expect(stored.revision).toBe(1);
    expect(stored.state.balances).toEqual({
      ...before.state.balances,
      '400091': 5,
      '420001': 5,
      '110001': 220,
      '200127': 50,
    });
    await expect(
      commandAlfazaa(actor, { ...request(), expectedRevision: 1 }, db),
    ).rejects.toMatchObject({ status: 409 });
    const otherState = await readAlfazaa(other, db);
    expect(otherState.revision).toBe(0);
    expect(otherState.state.quests.lastDailyClaimDay).toBeNull();
    expect((await commandAlfazaa(other, request(), db)).state.balances['110001']).toBe(220);
  });
});

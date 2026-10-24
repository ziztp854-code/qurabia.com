import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';
import { readAlfazaa, commandAlfazaa, type AlfazaaIdentity } from './repository';

// Never fall back to the application's DATABASE_URL. Provision/migrate an
// explicitly isolated local database before running this suite.
const databaseUrl = process.env.ALFAZAA_TEST_DATABASE_URL;
function assertLocalDatabase(value: string) {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/alfazaa_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) ||
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
    expect(results.map((result) => result.state.version)).toEqual([2, 2]);
    expect(results[0].state.cells[35]).toMatchObject({ kind: 'building', cfgId: 40001 });
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

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import { createWorld, executeCommand } from './engine';
import { defaultKingdomsConfig, resources } from './config';
import type { KingdomsWorld } from './types';

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

  async function fixture(count = 1, found = true) {
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
        startingResources: resources(100, 100, 100, 100, 100),
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

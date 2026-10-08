import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import maskJson from '../../../e2e/fixtures/abandoned-middle-east-geography.json';
import { createWorld, executeCommand } from './engine';
import { resources } from './config';
import { emptyTroops, total } from './simulation';
import { abandonedPlacementDomain } from './abandoned-village-geography';
import { withAbandonedPreviewVillages } from './abandoned-village-layout';
import type { KingdomsWorld } from './types';
import {
  ABANDONED_ROLLOUT_WORLD_ID,
  ABANDONED_ROLLOUT_WORLD_NAME,
  prepareCurrentWorldAbandoned,
} from './abandoned-village-rollout';
import {
  applyCurrentWorldAbandoned,
  readCurrentWorldAbandoned,
} from './abandoned-village-provisioning';

// Never fall back to DATABASE_URL, shared databases, or external hosts.
const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;
function assertIsolated(value: string) {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error('Explicit isolated local kingdoms_test database required');
}
const json = (state: KingdomsWorld) => JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue;
describe.skipIf(!databaseUrl)('abandoned village PostgreSQL transactions', () => {
  let db: DatabaseClient, repository: typeof import('./repository');
  const userIds: string[] = [],
    worldIds: string[] = [];
  beforeAll(async () => {
    assertIsolated(databaseUrl!);
    const { createPrismaClient } = await import('@tahaddi/database');
    db = createPrismaClient(databaseUrl!);
    repository = await import('./repository');
    await db.$connect();
  });
  afterAll(async () => {
    if (!db) return;
    try {
      await db.kingdomCommand.deleteMany({ where: { worldId: { in: worldIds } } });
      await db.kingdomWorld.deleteMany({ where: { id: { in: worldIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  });
  async function fixture(preview = true) {
    const identities = [];
    for (let index = 0; index < 2; index++) {
      const id = `abandoned_test_${randomUUID()}`;
      userIds.push(id);
      await db.user.create({
        data: { id, name: 'لاعب اختبار', status: 'ACTIVE', role: 'USER', tokenVersion: 0 },
      });
      identities.push({ id, tokenVersion: 0 });
    }
    const [{ now }] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    let state = createWorld(now!.getTime());
    state.config.baseProduction = resources();
    for (const actor of identities) {
      state = executeCommand(
        state,
        actor.id,
        { type: 'found', name: 'قرية اختبار' },
        now!.getTime(),
      );
      const village = Object.values(state.villages).find((v) => v.ownerId === actor.id)!;
      village.troops = { ...emptyTroops(), guard: 500 };
      village.resources = resources();
      village.buildings.warehouse = 20;
    }
    const worldId = `${preview ? 'preview_abandoned_' : 'kw_'}${randomUUID()}`;
    worldIds.push(worldId);
    if (preview)
      state = withAbandonedPreviewVillages(
        state,
        worldId,
        'postgres_preview_seed',
        abandonedPlacementDomain(maskJson),
      );
    await db.kingdomWorld.create({
      data: {
        id: worldId,
        name: 'عالم اختبار معزول',
        state: json(state),
        nextEventAt: new Date(state.season.endsAt),
      },
    });
    const homes = identities.map((actor) =>
      Object.values(state.villages).find((v) => v.ownerId === actor.id)!,
    );
    const targetId = Object.keys(state.abandonedVillages?.villages ?? {})[0] ?? 'av_unavailable';
    return { worldId, identities, state, homes, targetId };
  }
  async function saved(worldId: string) {
    const row = await db.kingdomWorld.findUniqueOrThrow({ where: { id: worldId } });
    return { row, state: row.state as unknown as KingdomsWorld };
  }
  it('charges one army once for concurrent identical commands and persists the original layout', async () => {
    const { worldId, identities, homes, targetId, state } = await fixture();
    const command = {
        type: 'gatherAbandoned',
        villageId: homes[0]!.id,
        targetId,
        troops: { ...emptyTroops(), guard: 250 },
      },
      key = randomUUID();
    await Promise.all([
      repository.commandKingdomWorld(worldId, identities[0]!, key, command, db),
      repository.commandKingdomWorld(worldId, identities[0]!, key, command, db),
    ]);
    const after = await saved(worldId);
    expect(after.state.movements).toHaveLength(1);
    expect(after.state.villages[homes[0]!.id]!.troops.guard).toBe(250);
    expect(after.state.abandonedVillages).toEqual(state.abandonedVillages);
    expect(await db.kingdomCommand.count({ where: { worldId } })).toBe(1);
    await expect(
      repository.commandKingdomWorld(
        worldId,
        identities[0]!,
        key,
        { ...command, troops: { ...command.troops, guard: 1 } },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('serializes two actors and two workers against one finite inventory without duplicate collection', async () => {
    const { worldId, identities, homes, targetId } = await fixture();
    await Promise.all(
      identities.map((actor, index) =>
        repository.commandKingdomWorld(
          worldId,
          actor,
          randomUUID(),
          {
            type: 'gatherAbandoned',
            villageId: homes[index]!.id,
            targetId,
            troops: { ...emptyTroops(), guard: 250 },
          },
          db,
        ),
      ),
    );
    const outgoing = (await saved(worldId)).state,
      at = outgoing.updatedAt;
    outgoing.movements.forEach((move) => {
      move.arrivesAt = at;
    });
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: { state: json(outgoing), nextEventAt: new Date(at) },
    });
    await Promise.all([repository.tickKingdomWorlds(db), repository.tickKingdomWorlds(db)]);
    const after = (await saved(worldId)).state;
    expect(after.movements.map((move) => total(move.loot))).toEqual([10000, 5000]);
    expect(after.abandonedVillages!.villages[targetId]!.stock).toEqual(resources());
    expect(after.abandonedVillages!.villages[targetId]!.stockUpdatedAt).toBe(at);
    await repository.tickKingdomWorlds(db);
    expect((await saved(worldId)).state.movements.map((move) => total(move.loot))).toEqual([
      10000, 5000,
    ]);
  });
  it('atomically initializes the approved real world once, preserves player data, rejects stale plans, and uses the real repository command', async () => {
    const f = await fixture(false);
    await db.kingdomWorld.update({
      where: { id: f.worldId },
      data: { id: ABANDONED_ROLLOUT_WORLD_ID, name: ABANDONED_ROLLOUT_WORLD_NAME },
    });
    worldIds.push(ABANDONED_ROLLOUT_WORLD_ID);
    const before = await saved(ABANDONED_ROLLOUT_WORLD_ID);
    const row = { ...before.row, state: before.state };
    const plan = await readCurrentWorldAbandoned(db);
    const tampered = structuredClone(plan);
    Object.values(tampered.layout.villages)[0]!.stock.gold = 999;
    await expect(applyCurrentWorldAbandoned(tampered, db)).rejects.toThrow('verified generator');
    await db.kingdomWorld.update({ where: { id: row.id }, data: { revision: { increment: 1 } } });
    await expect(applyCurrentWorldAbandoned(plan, db)).rejects.toThrow('World changed');
    const fresh = await saved(row.id),
      renewed = prepareCurrentWorldAbandoned({ ...fresh.row, state: fresh.state }, Date.now());
    const results = await Promise.all([
      applyCurrentWorldAbandoned(renewed, db),
      applyCurrentWorldAbandoned(renewed, db),
    ]);
    expect(results.map((r) => r.changed).sort()).toEqual([false, true]);
    const after = await saved(row.id);
    expect(after.row.revision).toBe(fresh.row.revision + 1);
    const { abandonedVillages, ...unchanged } = after.state;
    expect(unchanged).toEqual(before.state);
    expect(abandonedVillages?.scope).toBe('kingdom-world');
    expect(
      await db.auditLog.count({
        where: { resourceId: row.id, action: 'KINGDOMS_ABANDONED_ROLLOUT' },
      }),
    ).toBe(1);
    const projected = await repository.readKingdomWorld(row.id, f.identities[0]!, false, db);
    expect('abandonedVillages' in projected && projected.abandonedVillages).toHaveLength(48);
    const targetId = Object.keys(abandonedVillages!.villages)[0]!;
    const outcome = await repository.commandKingdomWorld(
      row.id,
      f.identities[0]!,
      randomUUID(),
      {
        type: 'gatherAbandoned',
        villageId: f.homes[0]!.id,
        targetId,
        troops: { ...emptyTroops(), guard: 10 },
      },
      db,
    );
    expect(outcome.movements[0]!.abandonedGather?.worldId).toBe(row.id);
    const depleted = (await saved(row.id)).state;
    depleted.abandonedVillages!.villages[targetId]!.stock.gold = 7;
    await db.kingdomWorld.update({ where: { id: row.id }, data: { state: json(depleted) } });
    expect((await applyCurrentWorldAbandoned(renewed, db)).changed).toBe(false);
    expect((await saved(row.id)).state.abandonedVillages!.villages[targetId]!.stock.gold).toBe(7);
    await db.auditLog.deleteMany({
      where: { resourceId: row.id, action: 'KINGDOMS_ABANDONED_ROLLOUT' },
    });
  });
  it('rejects unprovisioned worlds, mismatched registries, revoked sessions and foreign origins', async () => {
    const production = await fixture(false);
    const command = {
      type: 'gatherAbandoned',
      villageId: production.homes[0]!.id,
      targetId: 'av_unavailable',
      troops: { ...emptyTroops(), guard: 1 },
    };
    await expect(
      repository.commandKingdomWorld(
        production.worldId,
        production.identities[0]!,
        randomUUID(),
        command,
        db,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const preview = await fixture();
    const valid = { ...command, villageId: preview.homes[0]!.id, targetId: preview.targetId };
    await expect(
      repository.commandKingdomWorld(
        preview.worldId,
        preview.identities[1]!,
        randomUUID(),
        valid,
        db,
      ),
    ).rejects.toThrow();
    await expect(
      repository.commandKingdomWorld(
        preview.worldId,
        { ...preview.identities[0]!, tokenVersion: 1 },
        randomUUID(),
        valid,
        db,
      ),
    ).rejects.toMatchObject({ status: 401 });
    preview.state.abandonedVillages = {
      ...preview.state.abandonedVillages!,
      worldId: 'preview_abandoned_foreign',
    };
    await db.kingdomWorld.update({
      where: { id: preview.worldId },
      data: { state: json(preview.state) },
    });
    await expect(
      repository.commandKingdomWorld(
        preview.worldId,
        preview.identities[0]!,
        randomUUID(),
        valid,
        db,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db.kingdomCommand.count({ where: { worldId: preview.worldId } })).toBe(0);
  });
});

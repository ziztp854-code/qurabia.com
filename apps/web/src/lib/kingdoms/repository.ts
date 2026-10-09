import 'server-only';
import { Prisma, type DatabaseClient } from '@tahaddi/database';
import { getPrismaClient } from '@/lib/auth/prisma';
import { isManagerRole } from '@/lib/auth/authorization';
import { advanceWorld, createWorld, executeCommand, projectWorld } from './engine';
import { kingdomsCommandSchema, type KingdomsCommand } from './commands';
import { KingdomsHttpError, stableFingerprint } from './http';
import type { KingdomsConfig, KingdomsWorld } from './types';
import { abandonedLayout } from './abandoned-villages';
import { provisionVillageGeography } from '../mamluk-map/village-geography';
import { queueKingdomsNotification, type KingdomsNotification } from './realtime-notifications';

export type KingdomIdentity = { id: string; tokenVersion: number };
type WorldRow = { id: string; name: string; state: unknown; revision: number; paused: boolean };
type Tx = Prisma.TransactionClient;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function nextDeadline(state: KingdomsWorld): Date | null {
  if (state.season.status === 'ended') return null;
  const dates = [state.season.endsAt, ...state.movements.map((move) => move.arrivesAt)];
  for (const village of Object.values(state.villages)) {
    if (village.build) dates.push(village.build.endsAt);
    if (village.training) dates.push(village.training.endsAt);
  }
  for (const caravan of state.caravans ?? []) {
    if (caravan.status === 'traveling') dates.push(caravan.arrivesAt);
  }
  return new Date(dates.reduce((earliest, date) => Math.min(earliest, date), state.season.endsAt));
}

async function dbNow(tx: Tx): Promise<number> {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row.now.getTime();
}

async function authorize(tx: Tx, identity: KingdomIdentity, admin = false) {
  const user = await tx.user.findUnique({
    where: { id: identity.id },
    select: { status: true, tokenVersion: true, role: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
    throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
  if (admin && !isManagerRole(user.role))
    throw new KingdomsHttpError(403, 'صلاحيات الإدارة مطلوبة.');
  return user;
}

async function lockWorld(tx: Tx, worldId: string): Promise<WorldRow> {
  const [row] = await tx.$queryRaw<
    WorldRow[]
  >`SELECT id, name, state, revision, paused FROM "KingdomWorld" WHERE id = ${worldId} FOR UPDATE`;
  if (!row) throw new KingdomsHttpError(404, 'العالم غير موجود.');
  return row;
}

async function save(tx: Tx, row: WorldRow, state: KingdomsWorld, paused = row.paused) {
  return tx.kingdomWorld.update({
    where: { id: row.id },
    data: {
      state: json(provisionVillageGeography(row.id, state)),
      revision: { increment: 1 },
      nextEventAt: nextDeadline(state),
      paused,
    },
  });
}

function view(row: WorldRow, state: KingdomsWorld, actorId: string, now: number) {
  abandonedLayout(state, row.id);
  return {
    ...projectWorld(state, actorId, now),
    worldId: row.id,
    worldName: row.name,
    revision: row.revision,
    paused: row.paused,
  };
}

// Explicit row locking serializes cross-village battles, trades and spending within a
// world. READ COMMITTED makes a waiter read the committed state of its predecessor.
export function kingdomTransaction<T>(
  work: (tx: Tx) => Promise<T>,
  db: DatabaseClient = getPrismaClient(),
) {
  return db.$transaction(work, {
    isolationLevel: 'ReadCommitted',
    maxWait: 5_000,
    timeout: 15_000,
  });
}

/** Collect inside the transaction, publish only once its commit has completed. */
async function kingdomMutationTransaction<T>(
  work: (tx: Tx, notify: (change: KingdomsNotification) => void) => Promise<T>,
  db?: DatabaseClient,
) {
  const notifications: KingdomsNotification[] = [];
  const result = await kingdomTransaction((tx) => work(tx, (change) => notifications.push(change)), db);
  for (const notification of notifications) queueKingdomsNotification(notification);
  return result;
}

export async function listKingdomWorlds(db: DatabaseClient = getPrismaClient()) {
  const rows = await db.kingdomWorld.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      revision: true,
      paused: true,
      nextEventAt: true,
      createdAt: true,
    },
  });
  return rows.map(({ paused, nextEventAt, ...row }) => ({
    ...row,
    status: paused ? 'PAUSED' : nextEventAt ? 'OPEN' : 'ENDED',
  }));
}

export async function readKingdomWorld(
  worldId: string,
  identity: KingdomIdentity,
  admin = false,
  db?: DatabaseClient,
) {
  return kingdomTransaction(async (tx) => {
    await authorize(tx, identity, admin);
    const row = await tx.kingdomWorld.findUnique({ where: { id: worldId } });
    if (!row) throw new KingdomsHttpError(404, 'العالم غير موجود.');
    const now = await dbNow(tx);
    const state = row.state as unknown as KingdomsWorld;
    // Reads project deterministic due events without taking a write lock. The next
    // command/worker persists the same ordered events before applying new work.
    if (admin)
      return {
        id: row.id,
        name: row.name,
        revision: row.revision,
        paused: row.paused,
        state: advanceWorld(state, now),
      };
    return view(row, state, identity.id, now);
  }, db);
}

async function checkReceipt(
  tx: Tx,
  row: WorldRow,
  actorId: string,
  key: string,
  fingerprint: string,
  legacyFingerprint?: string,
) {
  const receipt = await tx.kingdomCommand.findUnique({
    where: { worldId_actorId_key: { worldId: row.id, actorId, key } },
  });
  if (receipt && receipt.fingerprint !== fingerprint && receipt.fingerprint !== legacyFingerprint)
    throw new KingdomsHttpError(409, 'مفتاح الطلب مستخدم لأمر مختلف.');
  return receipt;
}

const expandedUnitKeys = new Set(['archer', 'mounted_archer', 'sultan_guard', 'siege_engineer', 'siege_tower']);

/** Only zero added counts can represent the same command as a historical four-unit receipt. */
function historicalTroopFingerprint(command: KingdomsCommand): string | undefined {
  if (command.type !== 'march' && command.type !== 'caravanIntercept') return undefined;
  if ([...expandedUnitKeys].some((unit) => command.troops[unit as keyof typeof command.troops] !== 0)) return undefined;
  const troops = Object.fromEntries(Object.entries(command.troops).filter(([unit]) => !expandedUnitKeys.has(unit)));
  return stableFingerprint({ ...command, troops });
}

async function receipt(
  tx: Tx,
  worldId: string,
  actorId: string,
  key: string,
  fingerprint: string,
  revision: number,
) {
  await tx.kingdomCommand.create({ data: { worldId, actorId, key, fingerprint, revision } });
}

export async function commandKingdomWorld(
  worldId: string,
  identity: KingdomIdentity,
  key: string,
  input: unknown,
  db?: DatabaseClient,
) {
  const command = kingdomsCommandSchema.parse(input);
  const fingerprint = stableFingerprint(command);
  return kingdomMutationTransaction(async (tx, notify) => {
    const row = await lockWorld(tx, worldId);
    // Validate after any lock wait so a queued command cannot use a session
    // revoked while another command was holding the world.
    await authorize(tx, identity);
    const now = await dbNow(tx);
    if (await checkReceipt(tx, row, identity.id, key, fingerprint, historicalTroopFingerprint(command)))
      return view(row, row.state as KingdomsWorld, identity.id, now);
    if (row.paused) throw new KingdomsHttpError(409, 'أوقفت الإدارة استقبال الأوامر مؤقتًا.');
    const recent = await tx.kingdomCommand.count({
      where: { actorId: identity.id, worldId, createdAt: { gt: new Date(now - 60_000) } },
    });
    if (recent >= 30) throw new KingdomsHttpError(429, 'بلغت حد الأوامر لهذه الدقيقة.');
    if (command.type === 'gatherAbandoned') {
      try {
        if (!abandonedLayout(row.state as KingdomsWorld, row.id)) throw new Error('Missing abandoned layout');
      } catch {
        throw new KingdomsHttpError(403, 'القرى المهجورة غير مفعلة في هذا العالم.');
      }
    }
    const state = executeCommand(row.state as KingdomsWorld, identity.id, command, now);
    const saved = await save(tx, row, state);
    await receipt(tx, worldId, identity.id, key, fingerprint, saved.revision);
    notify({ worldId, revision: saved.revision, nextEventAt: nextDeadline(state)?.getTime() ?? null });
    return view(saved, state, identity.id, now);
  }, db);
}

export async function createKingdomWorld(
  identity: KingdomIdentity,
  key: string,
  name: string,
  config?: KingdomsConfig,
  db?: DatabaseClient,
) {
  const fingerprint = stableFingerprint({ name, config: config ?? null });
  const id = `kw_${stableFingerprint({ actorId: identity.id, key }).slice(0, 40)}`;
  return kingdomMutationTransaction(async (tx, notify) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;
    const actor = await authorize(tx, identity, true);
    const existing = await tx.kingdomWorld.findUnique({ where: { id } });
    if (existing) {
      await checkReceipt(tx, existing, identity.id, key, fingerprint);
      return { id, name: existing.name, revision: existing.revision };
    }
    const state = provisionVillageGeography(id, createWorld(await dbNow(tx), config));
    await tx.kingdomWorld.create({
      data: { id, name, state: json(state), nextEventAt: nextDeadline(state) },
    });
    await receipt(tx, id, identity.id, key, fingerprint, 0);
    await tx.auditLog.create({
      data: {
        actorId: identity.id,
        actorRole: actor.role,
        action: 'KINGDOMS_CREATE',
        resourceType: 'KingdomWorld',
        resourceId: id,
        result: 'SUCCESS',
        requestId: key,
        after: json({ name, config: state.config }),
      },
    });
    notify({ worldId: id, revision: 0, nextEventAt: nextDeadline(state)?.getTime() ?? null });
    return { id, name, revision: 0 };
  }, db);
}

export interface KingdomsMutationContext {
  readonly revision: number;
  readonly paused: boolean;
}

export async function editKingdomWorld(
  worldId: string,
  identity: KingdomIdentity,
  key: string,
  change: unknown,
  mutate: (state: KingdomsWorld, now: number, context: KingdomsMutationContext) => KingdomsWorld,
  paused?: boolean,
  db?: DatabaseClient,
) {
  const fingerprint = stableFingerprint(change);
  return kingdomMutationTransaction(async (tx, notify) => {
    const row = await lockWorld(tx, worldId);
    const actor = await authorize(tx, identity, true);
    const now = await dbNow(tx);
    if (await checkReceipt(tx, row, identity.id, key, fingerprint))
      return { id: row.id, name: row.name, revision: row.revision };
    const state = mutate(advanceWorld(row.state as KingdomsWorld, now), now, {
      revision: row.revision,
      paused: row.paused,
    });
    const saved = await save(tx, row, state, paused);
    await receipt(tx, worldId, identity.id, key, fingerprint, saved.revision);
    await tx.auditLog.create({
      data: {
        actorId: identity.id,
        actorRole: actor.role,
        action: 'KINGDOMS_CONFIGURE',
        resourceType: 'KingdomWorld',
        resourceId: worldId,
        result: 'SUCCESS',
        requestId: key,
        after: json(change),
      },
    });
    notify({ worldId, revision: saved.revision, nextEventAt: nextDeadline(state)?.getTime() ?? null });
    return { id: row.id, name: row.name, revision: saved.revision };
  }, db);
}

export async function tickKingdomWorlds(
  db: DatabaseClient = getPrismaClient(),
  watchedWorldIds: readonly string[] = [],
) {
  const due = await db.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "KingdomWorld" WHERE "nextEventAt" <= clock_timestamp() ORDER BY "nextEventAt" LIMIT 10`;
  const worlds: { id: string; revision: number }[] = [];
  const started = Date.now();
  for (const { id } of due) {
    if (Date.now() - started > 6_000) break;
    try {
      const result = await db.$transaction(
        async (tx) => {
          const [row] = await tx.$queryRaw<
            WorldRow[]
          >`SELECT id, name, state, revision, paused FROM "KingdomWorld" WHERE id = ${id} AND "nextEventAt" <= clock_timestamp() FOR UPDATE SKIP LOCKED`;
          if (!row) return null;
          const saved = await save(
            tx,
            row,
            advanceWorld(row.state as KingdomsWorld, await dbNow(tx)),
          );
          return { id, revision: saved.revision };
        },
        { maxWait: 1000, timeout: 3000 },
      );
      if (result) worlds.push(result);
    } catch (error) {
      // One bad or busy world must not prevent every other world's timers.
      console.error(
        '[kingdoms] world tick failed',
        id,
        error instanceof Error ? error.name : 'UnknownError',
      );
    }
  }
  const next = await db.kingdomWorld.findFirst({
    where: { nextEventAt: { not: null } },
    orderBy: { nextEventAt: 'asc' },
    select: { nextEventAt: true },
  });
  // One bounded metadata query per central tick recovers a lost after-commit POST.
  // Never query once per subscriber and never include private world state.
  const revisions = watchedWorldIds.length ? await db.kingdomWorld.findMany({
    where: { id: { in: [...new Set(watchedWorldIds)].slice(0, 512) } },
    select: { id: true, revision: true },
    take: 512,
  }) : [];
  return { worlds, revisions, nextEventAt: next?.nextEventAt?.getTime() ?? null };
}

import 'server-only';
import { z } from 'zod';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import { getPrismaClient } from '@/lib/auth/prisma';
import { createInitialState, validateState, advanceState, catalog } from '../domain';
import {
  createSharedWorld,
  advanceSharedWorld,
  applySharedCommand,
  projectSharedWorld,
  worldCommandSchema,
  type SharedWorld,
} from '../realm/world-engine';
import { applyWorldBridge, troopConversion } from '../realm/world-bridge';
import { syncCitySupport } from '../realm/world-support';
import { syncWorldEvents } from '../realm/world-events';
import { AlfazaaHttpError, stableFingerprint } from './http';
import type { AlfazaaIdentity } from './repository';

export const WORLD_ID = 'alfazaa-main-v1';
export const worldRequestSchema = z
  .object({
    idempotencyKey: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/),
    expectedRevision: z.number().int().nonnegative().max(2147483646),
    command: worldCommandSchema,
  })
  .strict();
type Tx = Prisma.TransactionClient;
type Row = { state: SharedWorld; revision: number };

async function lockWorld(tx: Tx, identity: AlfazaaIdentity) {
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  await tx.$executeRaw`INSERT INTO "AlfazaaWorld" (id,state,"updatedAt") VALUES (${WORLD_ID}, ${JSON.stringify(createSharedWorld(clock.now.getTime()))}::jsonb, clock_timestamp()) ON CONFLICT (id) DO NOTHING`;
  const [row] = await tx.$queryRaw<
    Row[]
  >`SELECT state,revision FROM "AlfazaaWorld" WHERE id=${WORLD_ID} FOR UPDATE`;
  const [user] = await tx.$queryRaw<
    { status: string; tokenVersion: number }[]
  >`SELECT status,"tokenVersion" FROM "User" WHERE id=${identity.id} FOR SHARE`;
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
    throw new AlfazaaHttpError(401, 'انتهت الجلسة؛ سجّل الدخول مجددًا');
  const [locked] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  const now = locked.now.getTime();
  if (
    !row ||
    row.state.version !== 1 ||
    row.state.game?.version !== 1 ||
    !Number.isSafeInteger(now)
  )
    throw new Error('Invalid shared world');
  // Fixed order: shared world, active user, own city. The city repository never locks the world.
  await tx.$executeRaw`INSERT INTO "AlfazaaState" ("userId",state,"updatedAt") VALUES (${identity.id},${JSON.stringify(createInitialState(now))}::jsonb,clock_timestamp()) ON CONFLICT ("userId") DO NOTHING`;
  const [account] = await tx.$queryRaw<
    { state: unknown; revision: number }[]
  >`SELECT state,revision FROM "AlfazaaState" WHERE "userId"=${identity.id} FOR UPDATE`;
  const city = validateState(account.state);
  if (!city || city.revision !== account.revision) throw new Error('Invalid city');
  return { row, city: advanceState(city, now), now };
}
function view(
  state: SharedWorld,
  actor: string,
  revision: number,
  city: Awaited<ReturnType<typeof lockWorld>>['city'],
  now: number,
) {
  return {
    revision,
    world: projectSharedWorld(state, actor, now),
    city: {
      revision: city.revision,
      gold: city.balances[catalog.meta.goldItemId],
      castleLevel: city.castleLevel,
      troops: city.cells.flatMap((cell, index) =>
        cell?.kind === 'troop'
          ? [{ cell: index, cfgId: cell.cfgId, conversion: troopConversion(cell.cfgId) }]
          : [],
      ),
    },
  };
}
async function save(tx: Tx, state: SharedWorld, revision: number) {
  await tx.$executeRaw`UPDATE "AlfazaaWorld" SET state=${JSON.stringify(state)}::jsonb,revision=${revision},"updatedAt"=clock_timestamp() WHERE id=${WORLD_ID}`;
}
export async function readAlfazaaWorld(
  identity: AlfazaaIdentity,
  db: DatabaseClient = getPrismaClient(),
) {
  return db.$transaction(
    async (tx) => {
      const { row, city, now } = await lockWorld(tx, identity);
      const synced = syncWorldEvents(
        syncCitySupport(advanceSharedWorld(row.state, now), identity.id, city),
        identity.id,
        city,
        now,
      );
      // Reads advance scheduled arrivals, but only user commands increment optimistic revision.
      await save(tx, synced.world, row.revision);
      if (synced.city !== city)
        await tx.$executeRaw`UPDATE "AlfazaaState" SET state=${JSON.stringify(synced.city)}::jsonb,revision=${synced.city.revision},"updatedAt"=clock_timestamp() WHERE "userId"=${identity.id}`;
      return view(synced.world, identity.id, row.revision, synced.city, now);
    },
    { maxWait: 5000, timeout: 15000 },
  );
}
export async function commandAlfazaaWorld(
  identity: AlfazaaIdentity,
  raw: unknown,
  db: DatabaseClient = getPrismaClient(),
) {
  const request = worldRequestSchema.parse(raw);
  const fingerprint = stableFingerprint({
    expectedRevision: request.expectedRevision,
    command: request.command,
  });
  return db.$transaction(
    async (tx) => {
      const { row, city, now } = await lockWorld(tx, identity);
      const [receipt] = await tx.$queryRaw<
        { fingerprint: string; result: unknown }[]
      >`SELECT fingerprint,result FROM "AlfazaaWorldCommand" WHERE "worldId"=${WORLD_ID} AND "userId"=${identity.id} AND key=${request.idempotencyKey}`;
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new AlfazaaHttpError(409, 'مفتاح الطلب مستخدم لأمر مختلف');
        return receipt.result;
      }
      if (request.expectedRevision !== row.revision)
        throw new AlfazaaHttpError(409, 'تغيّر العالم؛ حدّث الحالة وحاول مجددًا');
      let state: SharedWorld;
      let nextCity = city;
      try {
        if ('expectedCityRevision' in request.command) {
          const bridge = applyWorldBridge(
            syncCitySupport(row.state, identity.id, city),
            identity.id,
            city,
            request.command,
            now,
          );
          state = bridge.world;
          nextCity = bridge.city;
        } else
          state = syncCitySupport(
            applySharedCommand(
              syncCitySupport(row.state, identity.id, city),
              identity.id,
              request.command,
              now,
            ),
            identity.id,
            city,
          );
      } catch (error) {
        if (error instanceof z.ZodError) throw error;
        throw new AlfazaaHttpError(
          409,
          error instanceof Error ? error.message : 'تعذّر تنفيذ الأمر',
        );
      }
      const synced = syncWorldEvents(state, identity.id, nextCity, now, request.command);
      state = synced.world;
      nextCity = synced.city;
      if (nextCity !== city)
        await tx.$executeRaw`UPDATE "AlfazaaState" SET state=${JSON.stringify(nextCity)}::jsonb,revision=${nextCity.revision},"updatedAt"=clock_timestamp() WHERE "userId"=${identity.id}`;
      const result = view(state, identity.id, row.revision + 1, nextCity, now);
      await save(tx, state, result.revision);
      await tx.$executeRaw`INSERT INTO "AlfazaaWorldCommand" ("worldId","userId",key,fingerprint,result) VALUES (${WORLD_ID},${identity.id},${request.idempotencyKey},${fingerprint},${JSON.stringify(result)}::jsonb)`;
      await tx.$executeRaw`DELETE FROM "AlfazaaWorldCommand" WHERE "worldId"=${WORLD_ID} AND "userId"=${identity.id} AND key IN (SELECT key FROM "AlfazaaWorldCommand" WHERE "worldId"=${WORLD_ID} AND "userId"=${identity.id} ORDER BY "createdAt" DESC,key DESC OFFSET 128)`;
      return result;
    },
    { maxWait: 5000, timeout: 15000 },
  );
}
export type WorldAccountView = ReturnType<typeof view>;

/** Read-only MVCC snapshot: safe inside an already city-locked transaction. Never lock world here. */
export async function readAlfazaaWorldProgress(tx: Tx, userId: string) {
  const [row] = await tx.$queryRaw<
    { progress: { victories: number; gathered: number } | null; allianceId: string | null }[]
  >`
    SELECT state->'progress'->${userId} AS progress,
      state->'game'->'players'->${userId}->>'allianceId' AS "allianceId"
    FROM "AlfazaaWorld" WHERE id=${WORLD_ID}`;
  return {
    allianceMember: Boolean(row?.allianceId),
    allianceLevel: row?.allianceId ? 1 : 0,
    victories: row?.progress?.victories ?? 0,
    gathered: row?.progress?.gathered ?? 0,
  };
}

import 'server-only';
import { Prisma, type DatabaseClient } from '@tahaddi/database';
import { validateId, validateTime } from '@mamluk/world-map-core/server';
import { getPrismaClient } from '@/lib/auth/prisma';
import { KingdomsHttpError, stableFingerprint } from '../kingdoms/http';
import { kingdomTransaction, type KingdomIdentity } from '../kingdoms/repository';
import { provisionVillageGeography } from './village-geography';
import { worldIdSchema } from '../kingdoms/api-schema';
import {
  villageRelocationRequestSchema,
  type VillageRelocationRequest,
} from './relocation-request';
import {
  applyVillageRelocation,
  getVillageRelocationStatus,
  type VillageRelocationWorld,
  type VillageRelocationContext,
} from './village-relocation';

type Row = {
  id: string;
  revision: number;
  paused: boolean;
  state: VillageRelocationWorld;
  serverTime: Date;
};
const captureIdentity = (identity: KingdomIdentity): KingdomIdentity => {
  validateId(identity.id);
  validateTime(identity.tokenVersion);
  return Object.freeze({ id: identity.id, tokenVersion: identity.tokenVersion });
};

async function readOwnedWorld(
  tx: Prisma.TransactionClient,
  worldId: string,
  villageId: string,
  identity: KingdomIdentity,
  lock: boolean,
): Promise<Row> {
  const [row] = await tx.$queryRaw<Row[]>(Prisma.sql`
    SELECT id, revision, paused, state, clock_timestamp() AS "serverTime"
    FROM "KingdomWorld" WHERE id = ${worldId}
      AND state->'players' ? ${identity.id}::text
      AND state->'villages'->${villageId}::text->>'ownerId' = ${identity.id}
    ${lock ? Prisma.sql`FOR UPDATE` : Prisma.sql``}`);
  // Revalidate after a possible world lock wait, just like existing game commands.
  const user = await tx.user.findUnique({
    where: { id: identity.id },
    select: { status: true, tokenVersion: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
    throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
  if (!row || row.id !== worldId) throw new KingdomsHttpError(404, 'القرية غير متاحة.');
  validateTime(row.serverTime.getTime());
  if (!Number.isSafeInteger(row.revision) || row.revision < 0)
    throw new RangeError('Invalid world revision');
  return row;
}

const contextOf = (
  row: Row,
  identity: KingdomIdentity,
  villageId: string,
): VillageRelocationContext => ({
  worldId: row.id,
  actorId: identity.id,
  villageId,
  revision: row.revision,
  paused: row.paused,
});

export async function readVillageRelocation(
  worldId: string,
  villageId: string,
  identity: KingdomIdentity,
  db: DatabaseClient = getPrismaClient(),
) {
  const safeWorldId = worldIdSchema.parse(worldId);
  const safeVillageId = worldIdSchema.parse(villageId);
  const safeIdentity = captureIdentity(identity);
  return kingdomTransaction(async (tx) => {
    const row = await readOwnedWorld(tx, safeWorldId, safeVillageId, safeIdentity, false);
    const state = provisionVillageGeography(row.id, row.state);
    return getVillageRelocationStatus(state, contextOf(row, safeIdentity, safeVillageId));
  }, db);
}

export async function relocateVillage(
  input: VillageRelocationRequest,
  identity: KingdomIdentity,
  db: DatabaseClient = getPrismaClient(),
) {
  const request = Object.freeze(villageRelocationRequestSchema.parse(input));
  const safeIdentity = captureIdentity(identity);
  const fingerprint = stableFingerprint({ type: 'relocate-village', ...request });
  return kingdomTransaction(async (tx) => {
    const row = await readOwnedWorld(tx, request.worldId, request.villageId, safeIdentity, true);
    const state = provisionVillageGeography(row.id, row.state);
    const context = contextOf(row, safeIdentity, request.villageId);
    const status = getVillageRelocationStatus(state, context);
    const receipt = await tx.kingdomCommand.findUnique({
      where: {
        worldId_actorId_key: {
          worldId: row.id,
          actorId: safeIdentity.id,
          key: request.idempotencyKey,
        },
      },
    });
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new KingdomsHttpError(409, 'مفتاح الطلب مستخدم لعملية مختلفة.');
      return status;
    }
    const geography = applyVillageRelocation(
      state,
      context,
      { longitude: request.longitude, latitude: request.latitude },
      row.serverTime.getTime(),
    );
    const updated = await tx.$queryRaw<{ revision: number }[]>(Prisma.sql`
      UPDATE "KingdomWorld" SET state = jsonb_set(state, '{geography}', ${JSON.stringify(geography)}::jsonb),
        revision = revision + 1, "updatedAt" = clock_timestamp()
      WHERE id = ${row.id} AND revision = ${row.revision}
        AND state->'villages'->${request.villageId}::text->>'ownerId' = ${safeIdentity.id}
      RETURNING revision`);
    if (updated.length !== 1) throw new KingdomsHttpError(409, 'تغيّر العالم. حدّث الخريطة.');
    await tx.kingdomCommand.create({
      data: {
        worldId: row.id,
        actorId: safeIdentity.id,
        key: request.idempotencyKey,
        fingerprint,
        revision: updated[0]!.revision,
      },
    });
    return getVillageRelocationStatus(
      { ...state, geography },
      { ...context, revision: updated[0]!.revision },
    );
  }, db);
}

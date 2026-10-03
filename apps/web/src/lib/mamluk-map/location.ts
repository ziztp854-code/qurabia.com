import 'server-only';
import { Prisma, type DatabaseClient } from '@tahaddi/database';
import { validateCoordinates, validateId } from '@mamluk/world-map-core/server';
import { getPrismaClient } from '@/lib/auth/prisma';
import type { KingdomIdentity } from '../kingdoms/repository';
import { KingdomsHttpError } from '../kingdoms/http';
import { VILLAGE_GEOGRAPHY_SOURCE } from './village-geography';
import { prepareMapGeography } from './prepare-map-geography';

/** Resolve a known public village ID; no inverse projection or gameplay-grid inference. */
export async function readMapVillageLocation(
  worldId: string,
  villageId: string,
  identity: KingdomIdentity,
  db: DatabaseClient = getPrismaClient(),
) {
  validateId(worldId);
  validateId(villageId);
  await prepareMapGeography(worldId, identity, db);
  return db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: identity.id },
        select: { status: true, tokenVersion: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
        throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
      const [row] = await tx.$queryRaw<
        { name: string; longitude: number; latitude: number; revision: number }[]
      >(Prisma.sql`
      SELECT w.state->'villages'->${villageId}::text->>'name' AS name,
        (item->'value'->>'longitude')::double precision AS longitude,
        (item->'value'->>'latitude')::double precision AS latitude, w.revision
      FROM "KingdomWorld" w CROSS JOIN LATERAL jsonb_array_elements(w.state->'geography'->'cities') item
      WHERE w.id = ${worldId} AND w.state->'players' ? ${identity.id}::text
        AND w.state->>'version' = '1' AND jsonb_typeof(w.state->'config') = 'object'
        AND jsonb_typeof(w.state->'villages') = 'object'
        AND w.state->'geography'->>'source' = ${VILLAGE_GEOGRAPHY_SOURCE}
        AND w.state->'geography'->>'version' = '1'
        AND item->'value'->>'id' = ${villageId}
        AND w.state->'villages'->${villageId}::text->>'id' = ${villageId} LIMIT 1`);
      if (!row) throw new KingdomsHttpError(404, 'القرية غير متاحة.');
      validateCoordinates(row);
      if (
        !Number.isSafeInteger(row.revision) ||
        row.revision < 0 ||
        typeof row.name !== 'string' ||
        !row.name.trim() ||
        row.name.length > 256
      )
        throw new RangeError('Invalid village location');
      return {
        worldId,
        villageId,
        name: row.name,
        longitude: row.longitude,
        latitude: row.latitude,
        revision: String(row.revision),
      };
    },
    { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 },
  );
}

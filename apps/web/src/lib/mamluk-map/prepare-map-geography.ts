import 'server-only';
import { Prisma, type DatabaseClient } from '@tahaddi/database';
import { KingdomsHttpError } from '../kingdoms/http';
import type { KingdomIdentity } from '../kingdoms/repository';
import { VILLAGE_GEOGRAPHY_SOURCE } from './village-geography';
import { ensureVillageGeography } from './village-persistence';

/** Direct focus/overview requests must not depend on a preceding viewport read.
 * Probe only authorized metadata; the existing locked helper rechecks authority
 * and idempotently provisions geography without advancing gameplay. */
export async function prepareMapGeography(
  worldId: string,
  identity: KingdomIdentity,
  db: DatabaseClient,
) {
  const missing = await db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: identity.id },
        select: { status: true, tokenVersion: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
        throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
      const [row] = await tx.$queryRaw<{ missing: boolean }[]>(Prisma.sql`
      SELECT NOT (w.state ? 'geography') AS missing FROM "KingdomWorld" w
      WHERE w.id = ${worldId} AND w.state->'players' ? ${identity.id}::text
        AND w.state->>'version' = '1' AND jsonb_typeof(w.state->'config') = 'object'
        AND jsonb_typeof(w.state->'villages') = 'object'
        AND (NOT (w.state ? 'geography') OR w.state->'geography'->>'source' = ${VILLAGE_GEOGRAPHY_SOURCE})`);
      if (!row) throw new KingdomsHttpError(404, 'الخريطة غير متاحة.');
      return row.missing;
    },
    { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 },
  );
  if (missing) await ensureVillageGeography(worldId, identity, db);
}

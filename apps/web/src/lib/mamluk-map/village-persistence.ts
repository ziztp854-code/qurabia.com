import 'server-only';
import { Prisma, type DatabaseClient } from '@tahaddi/database';
import { validateId, validateTime } from '@mamluk/world-map-core/server';
import { KingdomsHttpError } from '../kingdoms/http';
import type { KingdomIdentity } from '../kingdoms/repository';
import { provisionVillageGeography, type GeographicVillage } from './village-geography';

/** Internal, idempotent metadata provisioning; never a player command or timer tick.
 * The row lock shares the game's serialization boundary, then account and membership
 * are checked again. Only geography changes, so queued commands retain all game state.
 */
export async function ensureVillageGeography(
  worldId: string,
  identity: KingdomIdentity,
  db: DatabaseClient,
): Promise<void> {
  validateId(worldId);
  validateId(identity.id);
  validateTime(identity.tokenVersion);
  const safeIdentity = Object.freeze({ id: identity.id, tokenVersion: identity.tokenVersion });
  await db.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<
        {
          id: string;
          revision: number;
          geography: unknown;
          villages: Record<string, GeographicVillage>;
        }[]
      >(Prisma.sql`
      SELECT w.id, w.revision, w.state->'geography' AS geography,
        COALESCE((SELECT jsonb_object_agg(v.key, jsonb_build_object(
          'id', v.value->>'id', 'name', v.value->>'name', 'ownerId', v.value->>'ownerId',
          'buildings', jsonb_build_object('wall', v.value->'buildings'->'wall')))
          FROM jsonb_each(w.state->'villages') v), '{}'::jsonb) AS villages
      FROM "KingdomWorld" w WHERE w.id = ${worldId}
        AND w.state->'players' ? ${safeIdentity.id}::text FOR UPDATE`);
      const user = await tx.user.findUnique({
        where: { id: safeIdentity.id },
        select: { status: true, tokenVersion: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== safeIdentity.tokenVersion)
        throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
      if (!row || row.id !== worldId) throw new KingdomsHttpError(404, 'الخريطة غير متاحة.');
      const state = {
        villages: row.villages,
        ...(row.geography === null ? {} : { geography: row.geography }),
      };
      const provisioned = provisionVillageGeography(worldId, state);
      if (provisioned === state) return;
      const updated = await tx.$queryRaw<{ revision: number }[]>(Prisma.sql`
      UPDATE "KingdomWorld" SET state = jsonb_set(state, '{geography}',
        ${JSON.stringify(provisioned.geography)}::jsonb), revision = revision + 1,
        "updatedAt" = clock_timestamp()
      WHERE id = ${worldId} AND revision = ${row.revision}
        AND state->'players' ? ${safeIdentity.id}::text RETURNING revision`);
      if (updated.length !== 1) throw new KingdomsHttpError(409, 'تغيّر العالم. حدّث الخريطة.');
    },
    { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 },
  );
}

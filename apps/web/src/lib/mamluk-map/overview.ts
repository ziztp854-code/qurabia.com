import 'server-only';
import { Prisma, type DatabaseClient } from '@tahaddi/database';
import { validateBounds, validateId, type ViewportRequest } from '@mamluk/world-map-core/server';
import { getPrismaClient } from '@/lib/auth/prisma';
import type { KingdomIdentity } from '../kingdoms/repository';
import { KingdomsHttpError } from '../kingdoms/http';
import { VILLAGE_GEOGRAPHY_SOURCE } from './village-geography';
import { prepareMapGeography } from './prepare-map-geography';

/** Global overview reads only public, persisted village locations. Fixed 15-degree
 * cells bound the entire world to 288 features without transferring world state. */
export async function readMapOverview(
  request: ViewportRequest,
  identity: KingdomIdentity,
  db: DatabaseClient = getPrismaClient(),
) {
  validateId(request.worldId);
  validateBounds(request.bounds);
  await prepareMapGeography(request.worldId, identity, db);
  const { west, east, south, north } = request.bounds;
  return db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: identity.id },
        select: { status: true, tokenVersion: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
        throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
      const [world] = await tx.$queryRaw<{ revision: number; now: Date }[]>(Prisma.sql`
      SELECT w.revision, clock_timestamp() AS now FROM "KingdomWorld" w
      WHERE w.id = ${request.worldId} AND w.state->'players' ? ${identity.id}::text
        AND w.state->>'version' = '1' AND jsonb_typeof(w.state->'config') = 'object'
        AND jsonb_typeof(w.state->'villages') = 'object'
        AND w.state->'geography'->>'source' = ${VILLAGE_GEOGRAPHY_SOURCE}
        AND w.state->'geography'->>'version' = '1'`);
      if (!world) throw new KingdomsHttpError(404, 'الخريطة غير متاحة.');
      const rows = await tx.$queryRaw<
        {
          x: number;
          y: number;
          longitude: number;
          latitude: number;
          count: bigint;
          targetVillageId: string | null;
        }[]
      >(Prisma.sql`
      WITH atlas AS MATERIALIZED (
        SELECT w.state->'geography'->'cities' AS cities, w.state->'villages' AS villages
        FROM "KingdomWorld" w WHERE w.id = ${request.worldId}
      ), village_ids AS MATERIALIZED (
        SELECT village.value->>'id' AS id FROM atlas CROSS JOIN LATERAL jsonb_each(atlas.villages) village
      ), locations AS (
        SELECT item->'value'->>'id' AS id,
          CASE WHEN (item->'value'->>'longitude')::double precision = 180 THEN -180
            ELSE (item->'value'->>'longitude')::double precision END AS lon,
          (item->'value'->>'latitude')::double precision AS lat
        FROM atlas CROSS JOIN LATERAL jsonb_array_elements(atlas.cities) item
        JOIN village_ids ON village_ids.id = item->'value'->>'id'
      ), visible AS (
        SELECT DISTINCT id, lon, lat FROM locations WHERE lat BETWEEN ${south}::double precision AND ${north}::double precision
          AND (CASE WHEN ${west}::double precision <= ${east}::double precision
            THEN lon BETWEEN ${west}::double precision AND ${east}::double precision
            ELSE lon >= ${west}::double precision OR lon <= ${east}::double precision END
            OR (lon = -180 AND ${east}::double precision = 180))
      )
      SELECT floor((lon + 180) / 15)::int AS x, least(11, floor((lat + 90) / 15)::int) AS y,
        avg(lon) AS longitude, avg(lat) AS latitude, count(*) AS count,
        CASE WHEN count(*) = 1 THEN min(id) ELSE NULL END AS "targetVillageId"
      FROM visible GROUP BY x, y ORDER BY x, y LIMIT 288`);
      if (!Number.isSafeInteger(world.revision) || world.revision < 0)
        throw new RangeError('Invalid map revision');
      return {
        worldId: request.worldId,
        revision: String(world.revision),
        serverTime: world.now.getTime(),
        cells: {
          type: 'FeatureCollection' as const,
          features: rows.map((row) => ({
            type: 'Feature' as const,
            id: `cell:${row.x}:${row.y}`,
            geometry: { type: 'Point' as const, coordinates: [row.longitude, row.latitude] },
            properties: { count: Number(row.count), targetVillageId: row.targetVillageId },
          })),
        },
      };
    },
    { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 },
  );
}

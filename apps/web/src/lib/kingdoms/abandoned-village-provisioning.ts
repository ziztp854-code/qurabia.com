import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma, type DatabaseClient } from '@tahaddi/database';
import { getPrismaClient } from '@/lib/auth/prisma';
import { abandonedLayout } from './abandoned-villages';
import {
  ABANDONED_ROLLOUT_WORLD_ID,
  abandonedRolloutFingerprint,
  prepareCurrentWorldAbandoned,
} from './abandoned-village-rollout';
import type { KingdomsWorld } from './types';

type Plan = ReturnType<typeof prepareCurrentWorldAbandoned>;
type Row = { id: string; name: string; state: KingdomsWorld; revision: number; paused: boolean };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function readCurrentWorldAbandoned(db: DatabaseClient = getPrismaClient()) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const row = await tx.kingdomWorld.findUnique({
        where: { id: ABANDONED_ROLLOUT_WORLD_ID },
        select: { id: true, name: true, state: true, revision: true, paused: true },
      });
      if (!row) throw new Error('Approved current world missing');
      const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      return prepareCurrentWorldAbandoned(
        { ...row, state: row.state as unknown as KingdomsWorld },
        now!.getTime(),
      );
    },
    { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 },
  );
}
/** Maintenance operation for the single approved world. Never called by a read, tick, or world creation. */
export async function applyCurrentWorldAbandoned(
  plan: Plan,
  db: DatabaseClient = getPrismaClient(),
) {
  if (plan.summary.worldId !== ABANDONED_ROLLOUT_WORLD_ID)
    throw new Error('Unapproved rollout world');
  return db.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<
        Row[]
      >`SELECT id,name,state,revision,paused FROM "KingdomWorld" WHERE id=${ABANDONED_ROLLOUT_WORLD_ID} FOR UPDATE`;
      if (!row) throw new Error('Approved current world missing');
      const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      const existing = abandonedLayout(row.state, row.id);
      // A repeated rollout cannot reset depleted stocks or move any persisted site.
      if (existing) {
        const preserved = prepareCurrentWorldAbandoned(row, now!.getTime());
        return { changed: false, revision: row.revision, summary: preserved.summary };
      }
      if (abandonedRolloutFingerprint(row) !== plan.expectedFingerprint)
        throw new Error('World changed: refresh the dry-run before activation');
      if (
        plan.summary.preparedAt > now!.getTime() ||
        now!.getTime() - plan.summary.preparedAt > 30 * 60 * 1000
      )
        throw new Error('Dry-run expired');
      const verified = prepareCurrentWorldAbandoned(row, plan.summary.preparedAt);
      if (JSON.stringify(verified.layout) !== JSON.stringify(plan.layout))
        throw new Error('Dry-run layout does not match the verified generator');
      const saved = await tx.kingdomWorld.update({
        where: { id: row.id },
        data: {
          state: json({ ...row.state, abandonedVillages: verified.layout }),
          revision: { increment: 1 },
        },
      });
      const state = saved.state as unknown as KingdomsWorld;
      const { abandonedVillages: _registry, ...unchanged } = state;
      void _registry;
      if (JSON.stringify(unchanged) !== JSON.stringify(row.state)) {
        // PostgreSQL jsonb orders object keys, so use a canonical hash below for the invariant.
        const canonical = (value: unknown): unknown =>
          Array.isArray(value)
            ? value.map(canonical)
            : value && typeof value === 'object'
              ? Object.fromEntries(
                  Object.entries(value)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, v]) => [key, canonical(v)]),
                )
              : value;
        if (JSON.stringify(canonical(unchanged)) !== JSON.stringify(canonical(row.state)))
          throw new Error('Rollout changed existing gameplay data');
      }
      await tx.auditLog.create({
        data: {
          actorRole: 'ADMIN',
          action: 'KINGDOMS_ABANDONED_ROLLOUT',
          resourceType: 'KingdomWorld',
          resourceId: row.id,
          result: 'SUCCESS',
          reasonCode: 'USER_APPROVED_CURRENT_WORLD',
          requestId: createHash('sha256').update(`${row.id}:${verified.layout.seed}`).digest('hex'),
          before: json({ revision: row.revision, abandonedVillageCount: 0 }),
          after: json(verified.summary),
        },
      });
      return { changed: true, revision: saved.revision, summary: verified.summary };
    },
    { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 },
  );
}

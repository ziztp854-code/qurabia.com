import 'server-only';
import { getPrismaClient } from '@/lib/auth/prisma';

/** One PostgreSQL snapshot, including claimed and delayed rows; no identities are returned. */
export async function readVoiceBacklog() {
  const [result] = await getPrismaClient().$queryRaw<{
    accountPending: number; roomPending: number; accountDelayed: number;
    roomDelayed: number; oldestAgeSeconds: number | null;
  }[]>`
    SELECT
      (SELECT count(*)::integer FROM "AccountVoiceOutbox") AS "accountPending",
      (SELECT count(*)::integer FROM "VoiceMediaReconcileJob") AS "roomPending",
      (SELECT count(*)::integer FROM "AccountVoiceOutbox" WHERE "nextAttemptAt" > statement_timestamp()) AS "accountDelayed",
      (SELECT count(*)::integer FROM "VoiceMediaReconcileJob" WHERE "nextAttemptAt" > statement_timestamp()) AS "roomDelayed",
      (SELECT CASE WHEN min(t.at) IS NULL THEN NULL ELSE GREATEST(0, EXTRACT(EPOCH FROM statement_timestamp() - min(t.at))::integer) END
        FROM (SELECT "createdAt" AS at FROM "AccountVoiceOutbox"
          UNION ALL SELECT "updatedAt" AS at FROM "VoiceMediaReconcileJob") t) AS "oldestAgeSeconds"`;
  if (!result) throw new Error('Voice backlog unavailable');
  return result;
}

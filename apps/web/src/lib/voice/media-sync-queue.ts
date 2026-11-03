import 'server-only';
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@/lib/auth/prisma';
import { reconcileVoiceMedia } from './livekit';

const LEASE_MS = 60_000;
type Result = 'completed' | 'failed' | 'superseded' | 'busy' | 'empty';

/** Processes one persisted generation. A crashed worker's lease expires. */
export async function processVoiceMediaJob(roomId: string): Promise<Result> {
  const db = getPrismaClient();
  const now = new Date();
  const job = await db.voiceMediaReconcileJob.findUnique({ where: { roomId } });
  if (!job) return 'empty';
  if (job.nextAttemptAt > now || (job.leaseExpiresAt && job.leaseExpiresAt > now)) return 'busy';
  const leaseToken = randomUUID();
  const claim = await db.voiceMediaReconcileJob.updateMany({
    where: {
      roomId,
      generation: job.generation,
      nextAttemptAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    },
    data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (!claim.count) return 'busy';
  try {
    await reconcileVoiceMedia(roomId);
    const completed = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`voice-media:${roomId}`}, 0))`;
        const removed = await tx.voiceMediaReconcileJob.deleteMany({
          where: { roomId, generation: job.generation, leaseToken },
        });
        if (removed.count)
          await tx.$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(state, '{mediaSyncPending}', 'false'::jsonb, true), revision = revision + 1, "updatedAt" = NOW() WHERE id = ${roomId}`;
        return removed.count > 0;
      },
      { timeout: 10_000, maxWait: 5_000 },
    );
    if (completed) return 'completed';
    // A newer generation or another lease must never be cleared by this attempt.
    await db.voiceMediaReconcileJob.updateMany({
      where: { roomId, leaseToken },
      data: { leaseToken: null, leaseExpiresAt: null },
    });
    return 'superseded';
  } catch {
    const attempts = Math.min(job.attempts + 1, 30);
    const result = await db.voiceMediaReconcileJob.updateMany({
      where: { roomId, generation: job.generation, leaseToken },
      data: {
        attempts,
        nextAttemptAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6))),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    if (!result.count)
      await db.voiceMediaReconcileJob.updateMany({
        where: { roomId, leaseToken },
        data: { leaseToken: null, leaseExpiresAt: null },
      });
    return 'failed';
  }
}

/** At most one room per request: reconciliation may take most of a 20s lock. */
export async function processNextVoiceMediaJob(): Promise<{ processed: number; failed: number }> {
  const now = new Date();
  const job = await getPrismaClient().voiceMediaReconcileJob.findFirst({
    where: {
      nextAttemptAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    },
    orderBy: { nextAttemptAt: 'asc' },
    select: { roomId: true },
  });
  if (!job) return { processed: 0, failed: 0 };
  const result = await processVoiceMediaJob(job.roomId);
  return { processed: result === 'completed' ? 1 : 0, failed: result === 'failed' ? 1 : 0 };
}

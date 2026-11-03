import 'server-only';
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@/lib/auth/prisma';

/** Transactional claim: a crash or any room failure rolls back the whole conversion. */
export async function processNextAccountVoiceOutboxJob(): Promise<'completed' | 'empty' | 'failed'> {
  let claimedId: bigint | undefined;
  try {
    return await getPrismaClient().$transaction(async (tx) => {
      const [job] = await tx.$queryRaw<{ id: bigint; userId: string; cursorRoomId: string | null; hadBusyRoom: boolean }[]>`
        SELECT id, "userId", "cursorRoomId", "hadBusyRoom" FROM "AccountVoiceOutbox" WHERE "nextAttemptAt" <= NOW() ORDER BY "nextAttemptAt", id
        FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!job) return 'empty';
      claimedId = job.id;
      // Include the grant ledger: a participant may have already disappeared from
      // room membership while its Cloud identity still requires revocation.
      const rooms = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "VoiceRoom" WHERE (${job.cursorRoomId}::text IS NULL OR id > ${job.cursorRoomId})
          AND NOT EXISTS (SELECT 1 FROM "AccountVoiceOutboxRoom" done WHERE done."eventId" = ${job.id} AND done."roomId" = "VoiceRoom".id) AND (
          EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(state->'participants', '[]'::jsonb)) p WHERE p->>'id' = ${job.userId})
          OR EXISTS (SELECT 1 FROM jsonb_each(COALESCE(state->'mediaGrants', '{}'::jsonb)) g WHERE COALESCE(g.value->>'userId', g.key) = ${job.userId}))
        ORDER BY id LIMIT 25`;
      let hadBusyRoom = job.hadBusyRoom;
      for (const room of rooms) {
        const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`voice-media:${room.id}`}, 0)) AS acquired`;
        if (!lock.acquired) { hadBusyRoom = true; continue; }
        // Chat and heartbeat can hold the row without holding the media lock.
        // Never let that unrelated write stall every other room in this batch.
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "VoiceRoom" WHERE id = ${room.id} FOR UPDATE SKIP LOCKED`;
        if (!rows.length) { hadBusyRoom = true; continue; }
        await tx.$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(state, '{mediaSyncPending}', 'true'::jsonb, true), revision = revision + 1, "updatedAt" = NOW() WHERE id = ${room.id}`;
        await tx.$executeRaw`
          INSERT INTO "VoiceMediaReconcileJob" ("roomId", generation, "updatedAt")
          VALUES (${room.id}, ${randomUUID()}, NOW())
          ON CONFLICT ("roomId") DO UPDATE SET generation = EXCLUDED.generation,
            attempts = 0, "nextAttemptAt" = NOW(), "updatedAt" = NOW()`;
        await tx.$executeRaw`INSERT INTO "AccountVoiceOutboxRoom" ("eventId", "roomId") VALUES (${job.id}, ${room.id})`;
      }
      if (rooms.length === 25) {
        await tx.$executeRaw`UPDATE "AccountVoiceOutbox" SET "cursorRoomId" = ${rooms[rooms.length - 1].id}, "hadBusyRoom" = ${hadBusyRoom} WHERE id = ${job.id}`;
      } else if (hadBusyRoom) {
        await tx.$executeRaw`UPDATE "AccountVoiceOutbox" SET "cursorRoomId" = NULL, "hadBusyRoom" = false, "nextAttemptAt" = NOW() + interval '1 second' WHERE id = ${job.id}`;
        return 'failed';
      } else {
        await tx.$executeRaw`DELETE FROM "AccountVoiceOutbox" WHERE id = ${job.id}`;
      }
      return 'completed';
    }, { timeout: 20_000, maxWait: 5_000 });
  } catch {
    // Keep the row for the next scheduled tick, including after timeout or crash.
    if (claimedId !== undefined) {
      try {
        await getPrismaClient().$executeRaw`UPDATE "AccountVoiceOutbox" SET
          attempts = LEAST(attempts + 1, 30),
          "nextAttemptAt" = NOW() + LEAST(60, power(2, LEAST(attempts + 1, 6))) * interval '1 second'
          WHERE id = ${claimedId}`;
      } catch { /* Database outage: the unchanged row remains retryable. */ }
    }
    return 'failed';
  }
}

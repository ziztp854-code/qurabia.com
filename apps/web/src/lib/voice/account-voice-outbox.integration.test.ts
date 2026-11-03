import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '@tahaddi/database';
import { processNextAccountVoiceOutboxJob } from './account-voice-outbox';
import { readVoiceBacklog } from './account-voice-outbox-health';

type Database = ReturnType<typeof createPrismaClient>;
const boundary = vi.hoisted(() => ({ client: (): Database => { throw new Error('uninitialized'); } }));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => boundary.client() }));
const url = process.env.VOICE_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !/^\/voice_test_[a-z0-9_]+$/.test(parsed.pathname) || parsed.search || parsed.hash)
    throw new Error('Voice tests require an isolated localhost voice_test_* database');
}
describe.skipIf(!url)('account voice outbox on PostgreSQL', () => {
  const userId = `outbox-${randomUUID()}`;
  const roomId = `outbox-room-${randomUUID()}`;
  let db: Database;
  beforeAll(async () => {
    db = createPrismaClient(url!); boundary.client = () => db;
    await db.user.create({ data: { id: userId, name: 'Fixture' } });
    await db.voiceRoom.create({ data: { id: roomId, hostId: userId, state: { participants: [{ id: userId }], mediaGrants: {} } } });
  });
  afterAll(async () => {
    if (db) { await db.voiceRoom.deleteMany({ where: { id: roomId } }); await db.$executeRaw`DELETE FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`; await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect(); }
  });
  it('rolls back the event with the account update and persists a committed event', async () => {
    await expect(db.$transaction(async (tx) => { await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(await db.$queryRaw`SELECT id FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`).toHaveLength(0);
    await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    expect(await db.$queryRaw`SELECT id FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`).toHaveLength(1);
    expect(await processNextAccountVoiceOutboxJob()).toBe('completed');
    expect(await db.voiceMediaReconcileJob.findUnique({ where: { roomId } })).not.toBeNull();
    expect((await db.voiceRoom.findUniqueOrThrow({ where: { id: roomId } })).state).toMatchObject({ mediaSyncPending: true });
  });
  it('retries a failed room conversion without losing the event or its newer room generation', async () => {
    await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    const oldGeneration = (await db.voiceMediaReconcileJob.findUniqueOrThrow({ where: { roomId } })).generation;
    // A temporary constraint forces a real PostgreSQL error after the account event was claimed.
    await db.$executeRawUnsafe(`ALTER TABLE "VoiceMediaReconcileJob" ADD CONSTRAINT "voice_outbox_test_failure" CHECK (false) NOT VALID`);
    try {
      expect(await processNextAccountVoiceOutboxJob()).toBe('failed');
      const events = await db.$queryRaw<{ attempts: number }[]>`SELECT attempts FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`;
      expect(events).toHaveLength(1);
      expect(events[0].attempts).toBe(1);
      expect((await db.voiceMediaReconcileJob.findUniqueOrThrow({ where: { roomId } })).generation).toBe(oldGeneration);
    } finally {
      await db.$executeRawUnsafe(`ALTER TABLE "VoiceMediaReconcileJob" DROP CONSTRAINT "voice_outbox_test_failure"`);
    }
    await db.$executeRaw`UPDATE "AccountVoiceOutbox" SET "nextAttemptAt" = NOW() WHERE "userId" = ${userId}`;
    expect(await processNextAccountVoiceOutboxJob()).toBe('completed');
    expect((await db.voiceMediaReconcileJob.findUniqueOrThrow({ where: { roomId } })).generation).not.toBe(oldGeneration);
    expect(await db.$queryRaw`SELECT id FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`).toHaveLength(0);
  });
  it('retains separate events across account changes without room activity', async () => {
    await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    expect(await db.$queryRaw`SELECT id FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`).toHaveLength(2);
    expect(await processNextAccountVoiceOutboxJob()).toBe('completed');
    const generation = (await db.voiceMediaReconcileJob.findUniqueOrThrow({ where: { roomId } })).generation;
    expect(await db.$queryRaw`SELECT id FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`).toHaveLength(1);
    expect(await processNextAccountVoiceOutboxJob()).toBe('completed');
    expect((await db.voiceMediaReconcileJob.findUniqueOrThrow({ where: { roomId } })).generation).not.toBe(generation);
  });
  it('continues other rooms while one is locked and retains later account events', async () => {
    const busyRoom = `outbox-busy-${randomUUID()}`;
    await db.voiceRoom.create({ data: { id: busyRoom, hostId: userId, state: { participants: [{ id: userId }], mediaGrants: {} } } });
    await db.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    try {
      await db.voiceMediaReconcileJob.deleteMany({ where: { roomId } });
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`voice-media:${busyRoom}`}, 0))`;
        expect(await processNextAccountVoiceOutboxJob()).toBe('failed');
        const first = await db.voiceMediaReconcileJob.findUniqueOrThrow({ where: { roomId } });
        expect(await db.voiceMediaReconcileJob.findUnique({ where: { roomId: busyRoom } })).toBeNull();
        for (let i = 0; i < 3; i++) {
          await db.$executeRaw`UPDATE "AccountVoiceOutbox" SET "nextAttemptAt" = NOW() WHERE "userId" = ${userId}`;
          expect(await processNextAccountVoiceOutboxJob()).toBe('failed');
          expect((await db.voiceMediaReconcileJob.findUniqueOrThrow({ where: { roomId } })).generation).toBe(first.generation);
        }
        await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
      }, { timeout: 10_000 });
      expect(await db.$queryRaw`SELECT id FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`).toHaveLength(2);
      await db.$executeRaw`UPDATE "AccountVoiceOutbox" SET "nextAttemptAt" = NOW() WHERE "userId" = ${userId}`;
      expect(await processNextAccountVoiceOutboxJob()).toBe('completed');
      expect(await processNextAccountVoiceOutboxJob()).toBe('completed');
      expect(await db.voiceMediaReconcileJob.findUnique({ where: { roomId: busyRoom } })).not.toBeNull();
    } finally {
      await db.voiceRoom.deleteMany({ where: { id: busyRoom } });
    }
  });
  it('persists its cursor across batches without losing any rooms', async () => {
    const prefix = `outbox-batch-${randomUUID()}-`;
    const ids = Array.from({ length: 27 }, (_, index) => `${prefix}${String(index).padStart(2, '0')}`);
    try {
      await db.voiceRoom.createMany({ data: ids.map((id) => ({ id, hostId: userId, state: { participants: [{ id: userId }], mediaGrants: {} } })) });
      await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
      expect(await processNextAccountVoiceOutboxJob()).toBe('completed');
      expect(await db.$queryRaw`SELECT id FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`).toHaveLength(1);
      expect(await processNextAccountVoiceOutboxJob()).toBe('completed');
      expect(await db.$queryRaw`SELECT id FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`).toHaveLength(0);
      expect(await db.voiceMediaReconcileJob.count({ where: { roomId: { in: ids } } })).toBe(ids.length);
    } finally {
      await db.voiceRoom.deleteMany({ where: { id: { in: ids } } });
    }
  });
  it('skips a row locked without a media lock while other rooms progress', async () => {
    const busyRoom = `outbox-row-${randomUUID()}`;
    await db.voiceRoom.create({ data: { id: busyRoom, hostId: userId, state: { participants: [{ id: userId }], mediaGrants: {} } } });
    try {
      await db.voiceMediaReconcileJob.deleteMany({ where: { roomId } });
      await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "VoiceRoom" WHERE id = ${busyRoom} FOR UPDATE`;
        expect(await processNextAccountVoiceOutboxJob()).toBe('failed');
        const first = await db.voiceMediaReconcileJob.findUniqueOrThrow({ where: { roomId } });
        expect(await db.voiceMediaReconcileJob.findUnique({ where: { roomId: busyRoom } })).toBeNull();
        await db.$executeRaw`UPDATE "AccountVoiceOutbox" SET "nextAttemptAt" = NOW() WHERE "userId" = ${userId}`;
        expect(await processNextAccountVoiceOutboxJob()).toBe('failed');
        expect((await db.voiceMediaReconcileJob.findUniqueOrThrow({ where: { roomId } })).generation).toBe(first.generation);
      }, { timeout: 10_000 });
      await db.$executeRaw`UPDATE "AccountVoiceOutbox" SET "nextAttemptAt" = NOW() WHERE "userId" = ${userId}`;
      expect(await processNextAccountVoiceOutboxJob()).toBe('completed');
      expect(await db.voiceMediaReconcileJob.findUnique({ where: { roomId: busyRoom } })).not.toBeNull();
    } finally {
      await db.voiceRoom.deleteMany({ where: { id: busyRoom } });
    }
  });
  it('enables deny-by-default RLS and removes public table and sequence privileges', async () => {
    const [metadata] = await db.$queryRaw<{ rls: boolean; policies: bigint; tablePublic: boolean; sequencePublic: boolean }[]>`
      SELECT c.relrowsecurity AS rls,
        (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS policies,
        EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a WHERE a.grantee = 0) AS "tablePublic",
        EXISTS(SELECT 1 FROM pg_class s, LATERAL aclexplode(COALESCE(s.relacl, acldefault('S', s.relowner))) a WHERE s.oid = to_regclass('"AccountVoiceOutbox_id_seq"') AND a.grantee = 0) AS "sequencePublic"
      FROM pg_class c WHERE c.oid = to_regclass('"AccountVoiceOutbox"')`;
    expect(metadata).toEqual({ rls: true, policies: BigInt(0), tablePublic: false, sequencePublic: false });
  });
  it('denies a restricted role even when it has SELECT table privilege', async () => {
    const role = `voice_outbox_${randomUUID().replaceAll('-', '')}`;
    await db.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN`);
    try {
      await db.$executeRawUnsafe(`GRANT SELECT ON "AccountVoiceOutbox" TO "${role}"`);
      await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
      const rows = await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        return tx.$queryRaw`SELECT id FROM "AccountVoiceOutbox"`;
      });
      expect(rows).toHaveLength(0);
    } finally {
      await db.$executeRawUnsafe(`REVOKE ALL ON "AccountVoiceOutbox" FROM "${role}"`);
      await db.$executeRawUnsafe(`DROP ROLE "${role}"`);
    }
  });
  it('reports committed pending and delayed work without identities, and an empty queue distinctly', async () => {
    await db.$executeRaw`UPDATE "AccountVoiceOutbox" SET "nextAttemptAt" = NOW() + interval '5 minutes' WHERE "userId" = ${userId}`;
    await db.voiceMediaReconcileJob.updateMany({ where: { roomId }, data: { nextAttemptAt: new Date(Date.now() + 300_000) } });
    const backlog = await readVoiceBacklog();
    expect(backlog.accountPending).toBeGreaterThan(0);
    expect(backlog.roomPending).toBeGreaterThan(0);
    expect(backlog.accountDelayed).toBeGreaterThan(0);
    expect(backlog.roomDelayed).toBeGreaterThan(0);
    expect(backlog.oldestAgeSeconds).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(backlog)).not.toContain(userId);
    expect(JSON.stringify(backlog)).not.toContain(roomId);
    await db.$executeRaw`DELETE FROM "AccountVoiceOutbox" WHERE "userId" = ${userId}`;
    await db.voiceMediaReconcileJob.deleteMany({ where: { roomId } });
    expect(await readVoiceBacklog()).toEqual({ accountPending: 0, roomPending: 0, accountDelayed: 0, roomDelayed: 0, oldestAgeSeconds: null });
  });
});

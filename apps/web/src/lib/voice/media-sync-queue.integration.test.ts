import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '@tahaddi/database';
import { createVoiceRoom, getVoiceSnapshot, joinVoiceRoom, sendVoiceEvent } from './repository';
import { createRoomSchema } from './schemas';
import { processVoiceMediaJob } from './media-sync-queue';

type Database = ReturnType<typeof createPrismaClient>;
const boundary = vi.hoisted(() => ({
  client: (): Database => {
    throw new Error('Fixture database not initialized');
  },
  reconcile: vi.fn(),
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => boundary.client() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: async () => null }));
vi.mock('./livekit', () => ({ reconcileVoiceMedia: boundary.reconcile }));

const url = process.env.VOICE_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    !/^\/voice_test_[a-z0-9_]+$/.test(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('Voice integration tests require an isolated localhost voice_test_* database');
}

describe.skipIf(!url)('durable voice reconciliation on PostgreSQL', () => {
  const id = randomUUID();
  const host = { id: `durable-host-${id}`, name: 'Host', image: null };
  const member = { id: `durable-member-${id}`, name: 'Member', image: null };
  let db: Database;
  let roomId: string;
  beforeAll(async () => {
    db = createPrismaClient(url!);
    boundary.client = () => db;
    await db.user.createMany({ data: [host, member].map(({ id, name }) => ({ id, name, role: id === host.id ? 'MODERATOR' as const : 'USER' as const })) });
    roomId = (await createVoiceRoom(host, createRoomSchema.parse({ name: 'Fixture' }))).room.id;
    await joinVoiceRoom(roomId, member, {});
  });
  afterAll(async () => {
    if (db) {
      await db.voiceRoom.deleteMany({ where: { id: roomId } });
      await db.user.deleteMany({ where: { id: { in: [host.id, member.id] } } });
      await db.$disconnect();
    }
  });
  it('persists removal and retries after a provider failure across new database clients', async () => {
    await sendVoiceEvent(roomId, host.id, { type: 'remove', userId: member.id });
    expect((await getVoiceSnapshot(roomId, host.id)).mediaSyncPending).toBe(true);
    expect(await db.voiceMediaReconcileJob.findUnique({ where: { roomId } })).not.toBeNull();
    boundary.reconcile.mockRejectedValueOnce(new Error('unavailable'));
    expect(await processVoiceMediaJob(roomId)).toBe('failed');
    const restarted = createPrismaClient(url!);
    try {
      expect(
        await restarted.voiceMediaReconcileJob.findUnique({ where: { roomId } }),
      ).not.toBeNull();
      await restarted.voiceMediaReconcileJob.update({
        where: { roomId },
        data: { nextAttemptAt: new Date(0) },
      });
      boundary.client = () => restarted;
      boundary.reconcile.mockResolvedValueOnce(undefined);
      expect(await processVoiceMediaJob(roomId)).toBe('completed');
      expect(await restarted.voiceMediaReconcileJob.findUnique({ where: { roomId } })).toBeNull();
      expect((await getVoiceSnapshot(roomId, host.id)).mediaSyncPending).toBe(false);
    } finally {
      boundary.client = () => db;
      await restarted.$disconnect();
    }
  });
});

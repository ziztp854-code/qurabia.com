// From apps/web, with VOICE_TEST_DATABASE_URL pointing to a pre-provisioned localhost
// voice_test_* schema: node node_modules/vitest/vitest.mjs run --config vitest.voice-quota.config.ts
// No schema changes are performed here; only this run's UUID fixtures are removed.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '@tahaddi/database';
import {
  createVoiceRoom,
  getVoiceSnapshot,
  listVoiceRooms,
  sendVoiceEvent,
  withVoiceMediaSnapshot,
} from './repository';
import { createRoomSchema } from './schemas';
import type { VoiceIdentity } from './types';

type Database = ReturnType<typeof createPrismaClient>;
const boundary = vi.hoisted(() => ({
  client: (): Database => {
    throw new Error('Voice quota test database not initialized');
  },
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => boundary.client() }));
// These opt-in tests supply manual identities; do not initialize runtime auth options.
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: async () => null }));

// Never fall back to DATABASE_URL. The parent harness must provision this isolated schema.
const connectionString = process.env.VOICE_TEST_DATABASE_URL;
if (connectionString) {
  const parsed = new URL(connectionString);
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    !/^\/voice_test_[a-z0-9_]+$/.test(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('VOICE_TEST_DATABASE_URL must target a localhost voice_test_* database');
}

const context = new AsyncLocalStorage<Database>();
const fixtureId = randomUUID().replaceAll('-', '');
const host: VoiceIdentity = { id: `quota-${fixtureId}`, name: 'اختبار حصة الغرف', image: null };
const fixtureUsers = [host.id];
const clients: Database[] = [];
const appNames = [`quota-${fixtureId}-a`, `quota-${fixtureId}-b`];
const input = createRoomSchema.parse({ name: 'غرفة اختبار الحصة' });
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function namedClient(applicationName: string) {
  const url = new URL(connectionString!);
  url.searchParams.set('application_name', applicationName);
  return createPrismaClient(url.toString());
}

describe.skipIf(!connectionString)('voice room quota with independent PostgreSQL clients', () => {
  it('commits one message for concurrent requests and never resurrects it after deletion', async () => {
    const owner = { ...host, id: `emoji-replay-${fixtureId}` };
    fixtureUsers.push(owner.id);
    await clients[2].user.create({ data: { id: owner.id, name: owner.name } });
    const snapshot = await createVoiceRoom(owner, input);
    const command = { type: 'message' as const, text: 'هلا 😂', requestId: randomUUID() };
    const results = await Promise.all([
      context.run(clients[0], () => sendVoiceEvent(snapshot.room.id, owner.id, command)),
      context.run(clients[1], () => sendVoiceEvent(snapshot.room.id, owner.id, command)),
    ]);
    const current = await getVoiceSnapshot(snapshot.room.id, owner.id);
    expect(current.messages).toHaveLength(1);
    expect(results.every((result) => result.messages.length === 1)).toBe(true);
    expect(await clients[2].voiceChatCommand.count({ where: { roomId: snapshot.room.id } })).toBe(
      1,
    );
    await sendVoiceEvent(snapshot.room.id, owner.id, {
      type: 'delete-message',
      messageId: current.messages[0].id,
    });
    expect((await sendVoiceEvent(snapshot.room.id, owner.id, command)).messages).toHaveLength(0);
  });

  it('resolves exclusive assets server-side and deduplicates reaction commands across clients', async () => {
    const owner = { ...host, id: `emoji-asset-${fixtureId}` };
    fixtureUsers.push(owner.id);
    await clients[2].user.create({ data: { id: owner.id, name: owner.name } });
    const snapshot = await createVoiceRoom(owner, input);
    const pack = await clients[2].voiceEmojiPack.create({
      data: { name: 'حزمة الاختبار', createdBy: owner.id },
    });
    try {
      const emoji = await clients[2].voiceEmoji.create({
        data: {
          packId: pack.id,
          label: 'فيس الاختبار',
          content: new Uint8Array([1]),
          poster: new Uint8Array([1]),
        },
      });
      const token = `:td_${emoji.id}:`;
      const message = await sendVoiceEvent(snapshot.room.id, owner.id, {
        type: 'message',
        text: token,
        requestId: randomUUID(),
      });
      const reaction = {
        type: 'reaction' as const,
        messageId: message.messages[0].id,
        emoji: token,
        requestId: randomUUID(),
      };
      await Promise.all([
        context.run(clients[0], () => sendVoiceEvent(snapshot.room.id, owner.id, reaction)),
        context.run(clients[1], () => sendVoiceEvent(snapshot.room.id, owner.id, reaction)),
      ]);
      expect(
        (await getVoiceSnapshot(snapshot.room.id, owner.id)).messages[0].reactions[token],
      ).toEqual([owner.id]);
      await clients[2].voiceEmojiPack.update({ where: { id: pack.id }, data: { enabled: false } });
      await expect(
        sendVoiceEvent(snapshot.room.id, owner.id, {
          type: 'message',
          text: token,
          requestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_EMOJI' });
    } finally {
      await clients[2].voiceEmojiPack.delete({ where: { id: pack.id } });
    }
  });
  beforeAll(async () => {
    clients.push(
      namedClient(appNames[0]),
      namedClient(appNames[1]),
      namedClient(`fixture-${fixtureId}`),
    );
    boundary.client = () => context.getStore() ?? clients[2];
    await clients[2].user.create({ data: { id: host.id, name: host.name } });
  });
  afterAll(async () => {
    try {
      if (clients[2]) await clients[2].user.deleteMany({ where: { id: { in: fixtureUsers } } });
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
  });

  it('admits only one concurrent creation when the host already has four active rooms', async () => {
    for (let index = 0; index < 4; index++) await createVoiceRoom(host, input);
    let release!: () => void;
    let acquired!: () => void;
    const held = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Blocking this test host's FK check makes both public calls overlap deterministically.
    const coordinator = clients[2].$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${host.id} FOR UPDATE`;
        acquired();
        await released;
      },
      { timeout: 15_000 },
    );
    let pending:
      Promise<PromiseSettledResult<Awaited<ReturnType<typeof createVoiceRoom>>>[]> | undefined;
    try {
      await held;
      pending = Promise.allSettled(
        clients
          .slice(0, 2)
          .map((client) => context.run(client, () => createVoiceRoom(host, input))),
      );
      const deadline = Date.now() + 3000;
      while (true) {
        const [activity] = await clients[2].$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE application_name IN (${appNames[0]}, ${appNames[1]}) AND wait_event_type = 'Lock'
        `;
        if (activity.waiting === 2) break;
        if (Date.now() >= deadline)
          throw new Error('Concurrent quota fixture did not reach both lock waits');
        await delay(10);
      }
    } finally {
      release();
      await coordinator;
      await pending;
    }
    const outcomes = await pending!;
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected).toMatchObject({ status: 'rejected', reason: { status: 409 } });
    expect(
      (await listVoiceRooms(host.id)).rooms.filter((room) => room.hostId === host.id),
    ).toHaveLength(5);
  }, 20_000);

  it('rejects a sixth active room but admits a replacement after a room is closed', async () => {
    const owner = { ...host, id: `quota-full-${fixtureId}` };
    fixtureUsers.push(owner.id);
    await clients[2].user.create({ data: { id: owner.id, name: owner.name } });
    const first = await createVoiceRoom(owner, input);
    for (let index = 1; index < 5; index++) await createVoiceRoom(owner, input);
    await expect(createVoiceRoom(owner, input)).rejects.toMatchObject({ status: 409 });
    await sendVoiceEvent(first.room.id, owner.id, { type: 'close' });
    await expect(createVoiceRoom(owner, input)).resolves.toMatchObject({ room: { active: true } });
    expect(
      (await listVoiceRooms(owner.id)).rooms.filter((room) => room.hostId === owner.id),
    ).toHaveLength(5);
  });

  it('allows a different host to create while the first host creation is blocked', async () => {
    const owners = ['blocked', 'independent'].map((suffix) => ({
      ...host,
      id: `quota-${suffix}-${fixtureId}`,
    }));
    fixtureUsers.push(...owners.map((owner) => owner.id));
    await clients[2].user.createMany({
      data: owners.map((owner) => ({ id: owner.id, name: owner.name })),
    });
    let release!: () => void;
    let acquired!: () => void;
    const held = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const coordinator = clients[2].$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${owners[0].id} FOR UPDATE`;
        acquired();
        await released;
      },
      { timeout: 15_000 },
    );
    let blocked: ReturnType<typeof createVoiceRoom> | undefined;
    let independent: ReturnType<typeof createVoiceRoom> | undefined;
    try {
      await held;
      blocked = context.run(clients[0], () => createVoiceRoom(owners[0], input));
      const deadline = Date.now() + 3000;
      while (true) {
        const [activity] = await clients[2].$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE application_name = ${appNames[0]} AND wait_event_type = 'Lock'
        `;
        if (activity.waiting === 1) break;
        if (Date.now() >= deadline)
          throw new Error('Blocked host fixture did not reach its lock wait');
        await delay(10);
      }
      independent = context.run(clients[1], () => createVoiceRoom(owners[1], input));
      const outcome = await Promise.race([
        independent.then(() => 'created'),
        delay(2000).then(() => 'blocked'),
      ]);
      expect(outcome).toBe('created');
    } finally {
      release();
      await coordinator;
      await Promise.allSettled([blocked, independent]);
    }
  }, 20_000);

  it('rolls back a failed insert and releases the quota lock for another client', async () => {
    const owner = { ...host, id: `quota-rollback-${fixtureId}` };
    fixtureUsers.push(owner.id);
    // No host row exists, so the real FK constraint fails inside the quota transaction.
    await expect(
      context.run(clients[0], () => createVoiceRoom(owner, input)),
    ).rejects.toMatchObject({ code: 'P2003' });
    await clients[2].user.create({ data: { id: owner.id, name: owner.name } });
    await expect(
      context.run(clients[1], () => createVoiceRoom(owner, input)),
    ).resolves.toMatchObject({ room: { active: true, hostId: owner.id } });
    expect(
      (await listVoiceRooms(owner.id)).rooms.filter((room) => room.hostId === owner.id),
    ).toHaveLength(1);
  });
  it('keeps repeated fresh presence reads off the room write lock', async () => {
    const owner = { ...host, id: `presence-${fixtureId}` };
    fixtureUsers.push(owner.id);
    await clients[2].user.create({ data: { id: owner.id, name: owner.name } });
    const snapshot = await createVoiceRoom(owner, input);
    const reads = await Promise.all(
      Array.from({ length: 8 }, () => getVoiceSnapshot(snapshot.room.id, owner.id, true)),
    );
    expect(reads.every((read) => read.cursor === snapshot.cursor)).toBe(true);
    const record = await clients[2].voiceRoom.findUniqueOrThrow({
      where: { id: snapshot.room.id },
    });
    expect(record.revision).toBe(snapshot.cursor);
    const oldPresence = Date.now() - 11_000;
    await clients[2]
      .$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(state, '{participants,0,lastSeenAt}', to_jsonb(${oldPresence}::bigint), true), revision = revision + 1 WHERE id = ${snapshot.room.id}`;
    const renewed = await getVoiceSnapshot(snapshot.room.id, owner.id, true);
    expect(renewed.me?.lastSeenAt).toBeGreaterThan(oldPresence + 10_000);
    expect(renewed.cursor).toBe(snapshot.cursor + 2);
  });
  it('does not invalidate user writes for scheduler-only checkpoints but versions real ledger changes', async () => {
    const owner = { ...host, id: `checkpoint-${fixtureId}` };
    fixtureUsers.push(owner.id);
    await clients[2].user.create({ data: { id: owner.id, name: owner.name } });
    const snapshot = await createVoiceRoom(owner, input);
    await withVoiceMediaSnapshot(snapshot.room.id, async (_snapshot, _ledger, checkpoint) => {
      checkpoint.checkedAt = Date.now();
    });
    const afterCheckpoint = await clients[2].voiceRoom.findUniqueOrThrow({
      where: { id: snapshot.room.id },
    });
    expect(afterCheckpoint.revision).toBe(snapshot.cursor);
    expect(
      (afterCheckpoint.state as { mediaReconciledAt: number }).mediaReconciledAt,
    ).toBeGreaterThan(0);
    await withVoiceMediaSnapshot(snapshot.room.id, async (_snapshot, ledger) => {
      ledger[owner.id] = {
        active: true,
        canPublish: false,
        tokenVersion: 0,
        joinedAt: Date.now(),
        revokedBefore: 0,
      };
    });
    const afterLedger = await clients[2].voiceRoom.findUniqueOrThrow({
      where: { id: snapshot.room.id },
    });
    expect(afterLedger.revision).toBe(snapshot.cursor + 1);
  });
  it('skips busy periodic checks while forced permission work still waits for the shared lock', async () => {
    const owner = { ...host, id: `media-lock-${fixtureId}` };
    fixtureUsers.push(owner.id);
    await clients[2].user.create({ data: { id: owner.id, name: owner.name } });
    const snapshot = await createVoiceRoom(owner, input);
    let release!: () => void;
    let acquired!: () => void;
    const held = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = clients[2].$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`voice-media:${snapshot.room.id}`}, 0))`;
        acquired();
        await released;
      },
      { timeout: 15_000 },
    );
    let forced: Promise<unknown> | undefined;
    try {
      await held;
      await expect(
        context.run(clients[0], () =>
          withVoiceMediaSnapshot(snapshot.room.id, async () => 'unexpected', { skipBusy: true }),
        ),
      ).rejects.toMatchObject({ code: 'MEDIA_BUSY' });
      await expect(getVoiceSnapshot(snapshot.room.id, owner.id, true)).resolves.toMatchObject({
        cursor: snapshot.cursor,
      });
      forced = context.run(clients[1], () =>
        withVoiceMediaSnapshot(snapshot.room.id, async () => 'enforced'),
      );
      expect(await Promise.race([forced, delay(100).then(() => 'waiting')])).toBe('waiting');
    } finally {
      release();
      await holder;
    }
    await expect(forced).resolves.toBe('enforced');
  }, 20_000);
});

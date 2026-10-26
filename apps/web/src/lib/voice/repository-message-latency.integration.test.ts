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
  joinVoiceRoom,
  sendVoiceEvent,
  withVoiceMediaSnapshot,
} from './repository';
import { createRoomSchema } from './schemas';
import type { VoiceIdentity, VoiceRoomState } from './types';

type Database = ReturnType<typeof createPrismaClient>;
const boundary = vi.hoisted(() => ({
  client: (): Database => {
    throw new Error('Voice message latency test database not initialized');
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
const host: VoiceIdentity = { id: `latency-${fixtureId}`, name: 'اختبار حصة الغرف', image: null };
const fixtureUsers = [host.id];
const clients: Database[] = [];
const appNames = [`latency-${fixtureId}-a`, `latency-${fixtureId}-b`];
const input = createRoomSchema.parse({ name: 'غرفة اختبار الحصة' });
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function namedClient(applicationName: string) {
  const url = new URL(connectionString!);
  url.searchParams.set('application_name', applicationName);
  return createPrismaClient(url.toString());
}

async function chatFixture() {
  const users = ['owner', 'actor', 'other'].map((suffix) => ({
    ...host,
    id: `${suffix}-${randomUUID()}`,
  }));
  fixtureUsers.push(...users.map((user) => user.id));
  await clients[2].user.createMany({
    data: users.map((user) => ({ id: user.id, name: user.name })),
  });
  const initial = await createVoiceRoom(users[0], input);
  for (const user of users.slice(1)) await joinVoiceRoom(initial.room.id, user, {});
  return { roomId: initial.room.id, owner: users[0], actor: users[1], other: users[2] };
}

function gate() {
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    waiting,
    release,
    pause: async () => {
      entered();
      await finished;
    },
  };
}

function pauseFirstRoomRead(
  client: Database,
  roomId: string,
  barrier: ReturnType<typeof gate>,
  occurrence = 1,
) {
  let reads = 0;
  return client.$extends({
    query: {
      voiceRoom: {
        async findUnique({ args, query }) {
          const record = await query(args);
          if (args.where.id === roomId && ++reads === occurrence) {
            await barrier.pause();
          }
          return record;
        },
      },
    },
  }) as unknown as Database;
}

describe.skipIf(!connectionString)(
  'voice message latency with independent PostgreSQL clients',
  () => {
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

    it.each([0, 11_000])(
      'delivers committed chat to another member without waiting for a slow media repair (heartbeat age %i)',
      async (age) => {
        const owner = { ...host, id: `chat-host-${age}-${fixtureId}` };
        const listener = { ...host, id: `chat-listener-${age}-${fixtureId}` };
        fixtureUsers.push(owner.id, listener.id);
        await clients[2].user.createMany({
          data: [owner, listener].map((user) => ({ id: user.id, name: user.name })),
        });
        const initial = await createVoiceRoom(owner, input);
        await joinVoiceRoom(initial.room.id, listener, {});
        if (age) {
          const oldPresence = Date.now() - age;
          await clients[2]
            .$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(state, '{participants,0,lastSeenAt}', to_jsonb(${oldPresence}::bigint), true), revision = revision + 1 WHERE id = ${initial.room.id}`;
        }
        let finishRepair!: () => void;
        let markRepairStarted!: () => void;
        const repairStarted = new Promise<void>((resolve) => {
          markRepairStarted = resolve;
        });
        const repairFinished = new Promise<void>((resolve) => {
          finishRepair = resolve;
        });
        // Model a slow SFU RPC at the real public media-transaction boundary.
        // Independent PostgreSQL clients provide the actual lock contention here.
        const repair = context.run(clients[0], () =>
          withVoiceMediaSnapshot(initial.room.id, async (_snapshot, ledger) => {
            markRepairStarted();
            await repairFinished;
            ledger[owner.id] = {
              active: true,
              canPublish: true,
              tokenVersion: 0,
              joinedAt: initial.me!.joinedAt,
              revokedBefore: 0,
            };
          }),
        );
        let send: ReturnType<typeof sendVoiceEvent> | undefined;
        try {
          await repairStarted;
          send = context.run(clients[1], () =>
            sendVoiceEvent(initial.room.id, owner.id, {
              type: 'message',
              text: 'رسالة فحص التأخير',
              requestId: randomUUID(),
            }),
          );
          expect(
            await Promise.race([
              send.then(() => 'committed'),
              delay(1000).then(() => 'waiting-for-media'),
            ]),
          ).toBe('committed');
          const received = await context.run(clients[2], () =>
            getVoiceSnapshot(initial.room.id, listener.id),
          );
          expect(received.messages.map((message) => message.text)).toContain('رسالة فحص التأخير');
        } finally {
          finishRepair();
          await repair;
          await send;
        }
        const retained = await getVoiceSnapshot(initial.room.id, listener.id);
        expect(
          retained.messages.filter((message) => message.text === 'رسالة فحص التأخير'),
        ).toHaveLength(1);
        expect(retained.participants.map((participant) => participant.id).sort()).toEqual(
          [owner.id, listener.id].sort(),
        );
      },
      20_000,
    );

    it('returns committed chat to a receiver renewing 11-second-old presence during media repair', async () => {
      const { roomId, owner, actor } = await chatFixture();
      const oldPresence = Date.now() - 11_000;
      await clients[2]
        .$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(state, '{participants,1,lastSeenAt}', to_jsonb(${oldPresence}::bigint), true), revision = revision + 1 WHERE id = ${roomId}`;
      const barrier = gate();
      const repair = context.run(clients[0], () =>
        withVoiceMediaSnapshot(roomId, async () => {
          await barrier.pause();
        }),
      );
      let receive: ReturnType<typeof getVoiceSnapshot> | undefined;
      try {
        await barrier.waiting;
        await context.run(clients[1], () =>
          sendVoiceEvent(roomId, owner.id, {
            type: 'message',
            text: 'رسالة للمستمع أثناء تجديد الحضور',
            requestId: randomUUID(),
          }),
        );
        receive = context.run(clients[2], () => getVoiceSnapshot(roomId, actor.id, true));
        expect(
          await Promise.race([
            receive.then(() => 'received'),
            delay(1000).then(() => 'waiting-for-media'),
          ]),
        ).toBe('received');
        const received = await receive;
        expect(received.messages.map((message) => message.text)).toContain(
          'رسالة للمستمع أثناء تجديد الحضور',
        );
        expect(received.me?.lastSeenAt).toBeGreaterThan(oldPresence + 10_000);
      } finally {
        barrier.release();
        await repair;
        await receive;
      }
    }, 20_000);

    it.each(['revoked', 'expired'] as const)(
      'denies heartbeat reception for a %s receiver',
      async (reason) => {
        const { roomId, actor } = await chatFixture();
        const oldPresence = Date.now() - (reason === 'expired' ? 91_000 : 11_000);
        await clients[2]
          .$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(state, '{participants,1,lastSeenAt}', to_jsonb(${oldPresence}::bigint), true), revision = revision + 1 WHERE id = ${roomId}`;
        if (reason === 'revoked')
          await clients[2].user.update({
            where: { id: actor.id },
            data: { tokenVersion: { increment: 1 } },
          });
        await expect(getVoiceSnapshot(roomId, actor.id, true)).rejects.toMatchObject({
          code: 'NOT_JOINED',
        });
        const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
        expect(
          (record.state as unknown as VoiceRoomState).participants.find(
            (member) => member.id === actor.id,
          )?.lastSeenAt,
        ).toBe(oldPresence);
      },
    );

    it.each(['remove', 'close'] as const)(
      'rechecks heartbeat membership when %s wins its CAS race',
      async (type) => {
        const { roomId, owner, actor } = await chatFixture();
        const oldPresence = Date.now() - 11_000;
        await clients[2]
          .$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(state, '{participants,1,lastSeenAt}', to_jsonb(${oldPresence}::bigint), true), revision = revision + 1 WHERE id = ${roomId}`;
        const barrier = gate();
        // First read is the GET; the second is the heartbeat CAS snapshot.
        const delayed = pauseFirstRoomRead(clients[1], roomId, barrier, 2);
        const outcome = context
          .run(delayed, () => getVoiceSnapshot(roomId, actor.id, true))
          .then(
            () => null,
            (error: unknown) => error,
          );
        try {
          await barrier.waiting;
          await sendVoiceEvent(
            roomId,
            owner.id,
            type === 'remove' ? { type, userId: actor.id } : { type },
          );
        } finally {
          barrier.release();
        }
        expect(await outcome).toMatchObject({
          code: type === 'remove' ? 'NOT_JOINED' : 'ROOM_CLOSED',
        });
        const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
        expect(
          (record.state as unknown as VoiceRoomState).participants.map((member) => member.id),
        ).not.toContain(actor.id);
      },
    );

    it('keeps current messages and scheduler checkpoint during a heartbeat CAS', async () => {
      const { roomId, owner, actor, other } = await chatFixture();
      const oldPresence = Date.now() - 11_000;
      const expired = Date.now() - 91_000;
      await clients[2]
        .$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(jsonb_set(state, '{participants,1,lastSeenAt}', to_jsonb(${oldPresence}::bigint), true), '{participants,2,lastSeenAt}', to_jsonb(${expired}::bigint), true), revision = revision + 1 WHERE id = ${roomId}`;
      const barrier = gate();
      const delayed = pauseFirstRoomRead(clients[1], roomId, barrier, 2);
      const receive = context.run(delayed, () => getVoiceSnapshot(roomId, actor.id, true));
      const checkedAt = Date.now();
      try {
        await barrier.waiting;
        await sendVoiceEvent(roomId, owner.id, {
          type: 'message',
          text: 'رسالة تتزامن مع نبضة الحضور',
          requestId: randomUUID(),
        });
        await withVoiceMediaSnapshot(roomId, async (_snapshot, _ledger, checkpoint) => {
          checkpoint.checkedAt = checkedAt;
        });
      } finally {
        barrier.release();
      }
      expect((await receive).messages.map((message) => message.text)).toContain(
        'رسالة تتزامن مع نبضة الحضور',
      );
      const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
      const state = record.state as unknown as VoiceRoomState;
      expect(state.mediaReconciledAt).toBe(checkedAt);
      expect(state.participants.map((member) => member.id)).toContain(other.id);
    });

    it.each(['remove', 'close'] as const)(
      'rechecks a message after %s wins the revision race',
      async (type) => {
        const { roomId, owner, actor } = await chatFixture();
        const barrier = gate();
        const delayed = pauseFirstRoomRead(clients[1], roomId, barrier);
        const requestId = randomUUID();
        const pending = context.run(delayed, () =>
          sendVoiceEvent(roomId, actor.id, {
            type: 'message',
            text: 'رسالة لا تقبل بعد سحب الصلاحية',
            requestId,
          }),
        );
        const outcome = pending.then(
          () => null,
          (error: unknown) => error,
        );
        try {
          await barrier.waiting;
          await sendVoiceEvent(
            roomId,
            owner.id,
            type === 'remove' ? { type, userId: actor.id } : { type },
          );
        } finally {
          barrier.release();
        }
        expect(await outcome).toMatchObject({
          code: type === 'remove' ? 'NOT_JOINED' : 'ROOM_CLOSED',
        });
        expect(await clients[2].voiceChatCommand.count({ where: { roomId, requestId } })).toBe(0);
        const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
        expect((record.state as unknown as VoiceRoomState).messages).toHaveLength(0);
      },
    );

    it.each(['revoked', 'expired'] as const)(
      'rejects a message from an %s actor',
      async (reason) => {
        const { roomId, actor } = await chatFixture();
        if (reason === 'revoked') {
          await clients[2].user.update({
            where: { id: actor.id },
            data: { tokenVersion: { increment: 1 } },
          });
        } else {
          const expired = Date.now() - 91_000;
          await clients[2]
            .$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(state, '{participants,1,lastSeenAt}', to_jsonb(${expired}::bigint), true), revision = revision + 1 WHERE id = ${roomId}`;
        }
        await expect(
          sendVoiceEvent(roomId, actor.id, {
            type: 'message',
            text: 'رسالة غير مصرح بها',
            requestId: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: 'NOT_JOINED' });
        const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
        expect((record.state as unknown as VoiceRoomState).messages).toHaveLength(0);
      },
    );

    it('rejects an actor revoked after the message read without creating a receipt', async () => {
      const { roomId, actor } = await chatFixture();
      const barrier = gate();
      let paused = false;
      const delayed = clients[1].$extends({
        query: {
          user: {
            async findMany({ args, query }) {
              const accounts = await query(args);
              if (!paused) {
                paused = true;
                await barrier.pause();
              }
              return accounts;
            },
          },
        },
      }) as unknown as Database;
      const requestId = randomUUID();
      const outcome = context
        .run(delayed, () =>
          sendVoiceEvent(roomId, actor.id, {
            type: 'message',
            text: 'رسالة بعد إبطال الجلسة',
            requestId,
          }),
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      try {
        await barrier.waiting;
        await clients[2].user.update({
          where: { id: actor.id },
          data: { tokenVersion: { increment: 1 } },
        });
      } finally {
        barrier.release();
      }
      expect(await outcome).toMatchObject({ code: 'NOT_JOINED' });
      expect(await clients[2].voiceChatCommand.count({ where: { roomId, requestId } })).toBe(0);
    });

    it.each(['remove', 'close', 'revoked'] as const)(
      'denies an old message receipt after membership is %s',
      async (reason) => {
        const { roomId, owner, actor } = await chatFixture();
        const command = { type: 'message' as const, text: 'رسالة قديمة', requestId: randomUUID() };
        await sendVoiceEvent(roomId, actor.id, command);
        if (reason === 'revoked') {
          await clients[2].user.update({
            where: { id: actor.id },
            data: { tokenVersion: { increment: 1 } },
          });
        } else {
          await sendVoiceEvent(
            roomId,
            owner.id,
            reason === 'remove' ? { type: reason, userId: actor.id } : { type: reason },
          );
        }
        await expect(sendVoiceEvent(roomId, actor.id, command)).rejects.toMatchObject({
          code: reason === 'close' ? 'ROOM_CLOSED' : 'NOT_JOINED',
        });
        expect(
          await clients[2].voiceChatCommand.count({
            where: { roomId, requestId: command.requestId },
          }),
        ).toBe(1);
      },
    );

    it('does not persist an unrelated expired member removal while bypassing the media lock', async () => {
      const { roomId, actor, other } = await chatFixture();
      const expired = Date.now() - 91_000;
      await clients[2]
        .$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(state, '{participants,2,lastSeenAt}', to_jsonb(${expired}::bigint), true), revision = revision + 1 WHERE id = ${roomId}`;
      const barrier = gate();
      const repair = context.run(clients[0], () =>
        withVoiceMediaSnapshot(roomId, async (snapshot) => {
          expect(snapshot.participants.some((member) => member.id === other.id)).toBe(false);
          await barrier.pause();
        }),
      );
      try {
        await barrier.waiting;
        const send = context.run(clients[1], () =>
          sendVoiceEvent(roomId, actor.id, {
            type: 'message',
            text: 'صلاحية الدردشة فقط',
            requestId: randomUUID(),
          }),
        );
        expect(
          await Promise.race([send.then(() => 'sent'), delay(1000).then(() => 'blocked')]),
        ).toBe('sent');
        await send;
        const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
        expect(
          (record.state as unknown as VoiceRoomState).participants.map((member) => member.id),
        ).toContain(other.id);
      } finally {
        barrier.release();
        await repair;
      }
    });

    it.each(['checkpoint', 'ledger'] as const)(
      'preserves a newer media %s when a message read happened first',
      async (kind) => {
        const { roomId, actor } = await chatFixture();
        const barrier = gate();
        const delayed = pauseFirstRoomRead(clients[1], roomId, barrier);
        const send = context.run(delayed, () =>
          sendVoiceEvent(roomId, actor.id, {
            type: 'message',
            text: 'رسالة متزامنة مع الصوت',
            requestId: randomUUID(),
          }),
        );
        const checkedAt = Date.now() + 100;
        try {
          await barrier.waiting;
          await context.run(clients[0], () =>
            withVoiceMediaSnapshot(roomId, async (_snapshot, ledger, checkpoint) => {
              checkpoint.checkedAt = checkedAt;
              if (kind === 'ledger')
                ledger[actor.id] = {
                  active: true,
                  canPublish: false,
                  tokenVersion: 0,
                  joinedAt: checkedAt,
                  revokedBefore: 0,
                };
            }),
          );
        } finally {
          barrier.release();
        }
        await send;
        const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
        const state = record.state as unknown as VoiceRoomState;
        expect(state.mediaReconciledAt).toBe(checkedAt);
        if (kind === 'ledger') expect(state.mediaGrants?.[actor.id].joinedAt).toBe(checkedAt);
        expect(state.messages).toHaveLength(1);
        expect(state.participants.map((member) => member.id)).toContain(actor.id);
      },
    );

    it('commits a duplicate message request once while a media callback remains open', async () => {
      const { roomId, actor } = await chatFixture();
      const barrier = gate();
      const repair = context.run(clients[0], () =>
        withVoiceMediaSnapshot(roomId, async () => {
          await barrier.pause();
        }),
      );
      const command = { type: 'message' as const, text: 'رسالة واحدة', requestId: randomUUID() };
      let sends: Promise<unknown> | undefined;
      try {
        await barrier.waiting;
        sends = Promise.all(
          [clients[1], clients[2]].map((client) =>
            context.run(client, () => sendVoiceEvent(roomId, actor.id, command)),
          ),
        );
        expect(
          await Promise.race([sends.then(() => 'sent'), delay(1000).then(() => 'blocked')]),
        ).toBe('sent');
        await sends;
      } finally {
        barrier.release();
        await repair;
        await sends;
      }
      const current = await getVoiceSnapshot(roomId, actor.id);
      expect(current.messages).toHaveLength(1);
      expect(
        await clients[2].voiceChatCommand.count({
          where: { roomId, requestId: command.requestId },
        }),
      ).toBe(1);
    });
  },
);

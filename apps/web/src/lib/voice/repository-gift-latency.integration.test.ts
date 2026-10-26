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
  updateVoiceRoom,
  withVoiceMediaSnapshot,
} from './repository';
import { createRoomSchema } from './schemas';
import type { VoiceIdentity, VoiceRoomState } from './types';

type Database = ReturnType<typeof createPrismaClient>;
const boundary = vi.hoisted(() => ({
  client: (): Database => {
    throw new Error('Voice gift latency test database not initialized');
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
const host: VoiceIdentity = {
  id: `gift-latency-${fixtureId}`,
  name: 'اختبار حصة الغرف',
  image: null,
};
const fixtureUsers = [host.id];
const clients: Database[] = [];
const appNames = [`gift-latency-${fixtureId}-a`, `gift-latency-${fixtureId}-b`];
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

describe.skipIf(!connectionString)('voice gift latency with independent PostgreSQL clients', () => {
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

  it('commits a gift for its recipient without waiting for an unrelated media repair', async () => {
    const { roomId, owner, actor } = await chatFixture();
    const barrier = gate();
    const repair = context.run(clients[0], () =>
      withVoiceMediaSnapshot(roomId, async (_snapshot, ledger, checkpoint) => {
        await barrier.pause();
        ledger[owner.id] = {
          active: true,
          canPublish: true,
          tokenVersion: 0,
          joinedAt: 123,
          revokedBefore: 0,
        };
        checkpoint.checkedAt = 123;
      }),
    );
    const command = {
      type: 'gift' as const,
      giftId: 'rose' as const,
      recipientId: actor.id,
      requestId: randomUUID(),
    };
    let send: ReturnType<typeof sendVoiceEvent> | undefined;
    try {
      await barrier.waiting;
      send = context.run(clients[1], () => sendVoiceEvent(roomId, owner.id, command));
      expect(
        await Promise.race([
          send.then(() => 'committed'),
          delay(1000).then(() => 'waiting-for-media'),
        ]),
      ).toBe('committed');
      const received = await context.run(clients[2], () =>
        getVoiceSnapshot(roomId, actor.id, true),
      );
      expect(
        received.messages.filter((message) => message.clientId === command.requestId),
      ).toHaveLength(1);
      expect(
        received.messages.find((message) => message.clientId === command.requestId)?.gift,
      ).toEqual({ id: 'rose', recipientId: actor.id, recipientName: actor.name });
    } finally {
      barrier.release();
      await repair;
      await send;
    }
    const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
    const state = record.state as unknown as VoiceRoomState;
    expect(state.messages.filter((message) => message.clientId === command.requestId)).toHaveLength(
      1,
    );
    expect(state.participants.find((member) => member.id === owner.id)?.lastGiftAt).toBeGreaterThan(
      0,
    );
    expect(state.mediaGrants?.[owner.id].joinedAt).toBe(123);
  }, 20_000);

  it('deduplicates the same gift request while an unrelated media callback is open', async () => {
    const { roomId, owner, actor } = await chatFixture();
    const barrier = gate();
    const repair = context.run(clients[0], () =>
      withVoiceMediaSnapshot(roomId, async () => {
        await barrier.pause();
      }),
    );
    const command = {
      type: 'gift' as const,
      giftId: 'rose' as const,
      recipientId: actor.id,
      requestId: randomUUID(),
    };
    let sends: Promise<unknown> | undefined;
    try {
      await barrier.waiting;
      sends = Promise.all(
        [clients[1], clients[2]].map((client) =>
          context.run(client, () => sendVoiceEvent(roomId, owner.id, command)),
        ),
      );
      expect(
        await Promise.race([
          sends.then(() => 'committed'),
          delay(1000).then(() => 'waiting-for-media'),
        ]),
      ).toBe('committed');
    } finally {
      barrier.release();
      await repair;
      await sends;
    }
    expect((await getVoiceSnapshot(roomId, actor.id)).messages).toHaveLength(1);
    expect(
      await clients[2].voiceChatCommand.count({ where: { roomId, requestId: command.requestId } }),
    ).toBe(1);
  });

  it('enforces the gift throttle atomically for simultaneous distinct requests', async () => {
    const { roomId, owner, actor } = await chatFixture();
    const outcomes = await Promise.allSettled(
      [clients[0], clients[1]].map((client) =>
        context.run(client, () =>
          sendVoiceEvent(roomId, owner.id, {
            type: 'gift',
            giftId: 'rose',
            recipientId: actor.id,
            requestId: randomUUID(),
          }),
        ),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
      reason: { code: 'GIFT_SLOW_MODE' },
    });
    expect((await getVoiceSnapshot(roomId, actor.id)).messages).toHaveLength(1);
    expect(await clients[2].voiceChatCommand.count({ where: { roomId } })).toBe(1);
  });

  it('preserves both receipts and lastGiftAt when chat and a gift commit concurrently', async () => {
    const { roomId, owner, actor } = await chatFixture();
    const barrier = gate();
    const delayed = pauseFirstRoomRead(clients[1], roomId, barrier);
    const gift = context.run(delayed, () =>
      sendVoiceEvent(roomId, owner.id, {
        type: 'gift',
        giftId: 'rose',
        recipientId: actor.id,
        requestId: randomUUID(),
      }),
    );
    try {
      await barrier.waiting;
      await context.run(clients[0], () =>
        sendVoiceEvent(roomId, owner.id, {
          type: 'message',
          text: 'رسالة مع الهدية',
          requestId: randomUUID(),
        }),
      );
    } finally {
      barrier.release();
    }
    await gift;
    const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
    const state = record.state as unknown as VoiceRoomState;
    expect(state.messages).toHaveLength(2);
    expect(state.participants.find((member) => member.id === owner.id)?.lastGiftAt).toBeGreaterThan(
      0,
    );
    expect(await clients[2].voiceChatCommand.count({ where: { roomId } })).toBe(2);
  });

  it('retains the existing message slow mode when a gift wins the concurrent CAS', async () => {
    const { roomId, owner, actor } = await chatFixture();
    const barrier = gate();
    const delayed = pauseFirstRoomRead(clients[1], roomId, barrier);
    const outcome = context
      .run(delayed, () =>
        sendVoiceEvent(roomId, owner.id, {
          type: 'message',
          text: 'رسالة بعد الهدية مباشرة',
          requestId: randomUUID(),
        }),
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    try {
      await barrier.waiting;
      await sendVoiceEvent(roomId, owner.id, {
        type: 'gift',
        giftId: 'rose',
        recipientId: actor.id,
        requestId: randomUUID(),
      });
    } finally {
      barrier.release();
    }
    expect(await outcome).toMatchObject({ code: 'SLOW_MODE' });
    const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
    const state = record.state as unknown as VoiceRoomState;
    expect(state.messages).toHaveLength(1);
    expect(state.participants.find((member) => member.id === owner.id)?.lastGiftAt).toBeGreaterThan(
      0,
    );
    expect(await clients[2].voiceChatCommand.count({ where: { roomId } })).toBe(1);
  });

  it.each(['chat-disabled', 'recipient-removed'] as const)(
    'rejects a stale gift when %s wins the room revision race',
    async (reason) => {
      const { roomId, owner, actor } = await chatFixture();
      const barrier = gate();
      const delayed = pauseFirstRoomRead(clients[1], roomId, barrier);
      const outcome = context
        .run(delayed, () =>
          sendVoiceEvent(roomId, owner.id, { type: 'gift', giftId: 'rose', recipientId: actor.id }),
        )
        .then(
          () => null,
          (error: unknown) => error,
        );
      try {
        await barrier.waiting;
        if (reason === 'chat-disabled')
          await updateVoiceRoom(roomId, owner.id, { chatEnabled: false });
        else await sendVoiceEvent(roomId, owner.id, { type: 'remove', userId: actor.id });
      } finally {
        barrier.release();
      }
      expect(await outcome).toMatchObject({
        code: reason === 'chat-disabled' ? 'CHAT_DISABLED' : 'NOT_JOINED',
      });
      const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
      expect((record.state as unknown as VoiceRoomState).messages).toHaveLength(0);
    },
  );

  it('rejects a recipient revoked after account validation without changing gift throttle', async () => {
    const { roomId, owner, actor } = await chatFixture();
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
    const outcome = context
      .run(delayed, () =>
        sendVoiceEvent(roomId, owner.id, { type: 'gift', giftId: 'rose', recipientId: actor.id }),
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
    const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
    const state = record.state as unknown as VoiceRoomState;
    expect(state.messages).toHaveLength(0);
    expect(state.participants.find((member) => member.id === owner.id)?.lastGiftAt).toBeUndefined();
  });

  it('preserves a gift and newer media ledger when the media work finishes after its read', async () => {
    const { roomId, owner, actor } = await chatFixture();
    const barrier = gate();
    const delayed = pauseFirstRoomRead(clients[1], roomId, barrier);
    const send = context.run(delayed, () =>
      sendVoiceEvent(roomId, owner.id, { type: 'gift', giftId: 'rose', recipientId: actor.id }),
    );
    try {
      await barrier.waiting;
      await context.run(clients[0], () =>
        withVoiceMediaSnapshot(roomId, async (_snapshot, ledger, checkpoint) => {
          checkpoint.checkedAt = 456;
          ledger[owner.id] = {
            active: true,
            canPublish: true,
            tokenVersion: 0,
            joinedAt: 456,
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
    expect(state.mediaReconciledAt).toBe(456);
    expect(state.mediaGrants?.[owner.id].joinedAt).toBe(456);
    expect(state.messages).toHaveLength(1);
    expect(state.participants.find((member) => member.id === owner.id)?.lastGiftAt).toBeGreaterThan(
      0,
    );
  });

  it('preserves gift throttle when an older sender heartbeat retries after the gift commit', async () => {
    const { roomId, owner, actor } = await chatFixture();
    const oldPresence = Date.now() - 11_000;
    await clients[2]
      .$executeRaw`UPDATE "VoiceRoom" SET state = jsonb_set(state, '{participants,0,lastSeenAt}', to_jsonb(${oldPresence}::bigint), true), revision = revision + 1 WHERE id = ${roomId}`;
    const barrier = gate();
    const delayed = pauseFirstRoomRead(clients[1], roomId, barrier, 2);
    const heartbeat = context.run(delayed, () => getVoiceSnapshot(roomId, owner.id, true));
    try {
      await barrier.waiting;
      await sendVoiceEvent(roomId, owner.id, {
        type: 'gift',
        giftId: 'rose',
        recipientId: actor.id,
      });
    } finally {
      barrier.release();
    }
    await heartbeat;
    const record = await clients[2].voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
    const state = record.state as unknown as VoiceRoomState;
    expect(state.messages).toHaveLength(1);
    expect(state.participants.find((member) => member.id === owner.id)?.lastGiftAt).toBeGreaterThan(
      0,
    );
    await expect(
      sendVoiceEvent(roomId, owner.id, { type: 'gift', giftId: 'rose', recipientId: actor.id }),
    ).rejects.toMatchObject({ code: 'GIFT_SLOW_MODE' });
  });
});

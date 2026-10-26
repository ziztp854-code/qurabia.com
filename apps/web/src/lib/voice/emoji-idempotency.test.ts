import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoomSchema } from './schemas';
import { joinVoiceState } from './room-state';
import { sendVoiceEvent } from './repository';
import type { VoiceRoomState } from './types';
type Stub = ReturnType<typeof vi.fn>;
type StubDatabase = {
  user: { findMany: Stub };
  voicePreference: { findUnique: Stub };
  voiceEmoji: { findMany: Stub };
  voiceRoom: { findUnique: Stub; updateMany: Stub };
  voiceChatCommand: { findUnique: Stub; create: Stub };
  $queryRaw: Stub;
  $executeRaw: Stub;
  $transaction: Stub;
};
const mock = vi.hoisted(() => ({ db: {} as StubDatabase }));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => mock.db }));
vi.mock('@/lib/auth/password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock('./community-identity', () => ({
  voiceCommunityIdentities: async () => new Map(),
  syncVoiceCommunityIdentity: vi.fn(),
}));
const requestId = 'f2b2e248-8f04-4abe-8c76-a30a07cd2e47';
let state: VoiceRoomState;
let revision: number;
let receipts: Set<string>;
beforeEach(() => {
  const now = Date.now();
  const host = { id: 'host', name: 'عزيز', image: null };
  state = {
    settings: createRoomSchema.parse({ name: 'مجلس التحدي' }),
    host,
    createdAt: now,
    active: true,
    lockedSeats: [],
    participants: [],
    messages: [],
    bannedUsers: [],
  };
  joinVoiceState(state, host, now);
  revision = 0;
  receipts = new Set();
  mock.db = {
    user: {
      findMany: vi.fn(async () => [{ ...host, tokenVersion: 0, accountNumber: 1, profile: null }]),
    },
    voicePreference: { findUnique: vi.fn(async () => null) },
    voiceEmoji: { findMany: vi.fn(async () => []) },
    voiceRoom: {
      findUnique: vi.fn(async () => ({
        id: 'room',
        hostId: host.id,
        state: structuredClone(state),
        revision,
        passwordHash: null,
        isPrivate: false,
      })),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { revision: number };
          data: { state: VoiceRoomState };
        }) => {
          if (where.revision !== revision) return { count: 0 };
          state = structuredClone(data.state);
          revision++;
          return { count: 1 };
        },
      ),
    },
    voiceChatCommand: {
      findUnique: vi.fn(
        async ({ where }: { where: { roomId_userId_requestId: { requestId: string } } }) =>
          receipts.has(where.roomId_userId_requestId.requestId) ? { requestId } : null,
      ),
      create: vi.fn(async ({ data }: { data: { requestId: string } }) => {
        receipts.add(data.requestId);
        return data;
      }),
    },
    $queryRaw: vi.fn(async () => []),
    // Emulate only the message/gift CAS. Actual JSONB, authorization and rollback
    // behavior are covered by the PostgreSQL latency integration suites.
    $executeRaw: vi.fn(
      async (
        _sql: TemplateStringsArray,
        patch: string,
        actorPath: string[],
        _actorIndex: number,
        actorPatch: string,
        _roomId: string,
        expectedRevision: number,
      ) => {
        if (expectedRevision !== revision) return 0;
        state = {
          ...state,
          ...(JSON.parse(patch) as Pick<VoiceRoomState, 'messages'> | Record<string, never>),
          participants: state.participants.map((participant, index) =>
            index === Number(actorPath[1])
              ? { ...participant, ...(JSON.parse(actorPatch) as Partial<typeof participant>) }
              : participant,
          ),
        };
        revision++;
        return 1;
      },
    ),
    $transaction: vi.fn(async (work: (db: StubDatabase) => Promise<unknown>) => work(mock.db)),
  };
});
describe('chat receipt persistence boundary (mocked database)', () => {
  it('converges concurrent requests with one key to one committed message', async () => {
    const event = { type: 'message' as const, text: 'مرحبا 😂', requestId };
    await Promise.all([
      sendVoiceEvent('room', 'host', event),
      sendVoiceEvent('room', 'host', event),
    ]);
    expect(state.messages).toHaveLength(1);
    expect(mock.db.voiceChatCommand.create).toHaveBeenCalledOnce();
  });
  it('persists one message and receipt across an acknowledgement retry; plain text never queries assets', async () => {
    const event = { type: 'message' as const, text: 'هلا 😂', requestId };
    await sendVoiceEvent('room', 'host', event);
    await sendVoiceEvent('room', 'host', event);
    expect(state.messages).toHaveLength(1);
    expect(mock.db.voiceChatCommand.create).toHaveBeenCalledOnce();
    expect(mock.db.voiceEmoji.findMany).not.toHaveBeenCalled();
  });
  it('does not resurrect a deleted message when its command is replayed', async () => {
    const event = { type: 'message' as const, text: 'هلا', requestId };
    await sendVoiceEvent('room', 'host', event);
    state.messages = [];
    const snapshot = await sendVoiceEvent('room', 'host', event);
    expect(snapshot.messages).toEqual([]);
    expect(mock.db.voiceChatCommand.create).toHaveBeenCalledOnce();
  });
  it('keeps reaction retries from toggling the reaction twice and denies revoked membership', async () => {
    await sendVoiceEvent('room', 'host', { type: 'message', text: 'هلا' });
    const event = {
      type: 'reaction' as const,
      messageId: state.messages[0].id,
      emoji: '👏',
      requestId,
    };
    await sendVoiceEvent('room', 'host', event);
    await sendVoiceEvent('room', 'host', event);
    expect(state.messages[0].reactions['👏']).toEqual(['host']);
    state.participants = [];
    await expect(sendVoiceEvent('room', 'host', event)).rejects.toThrow();
  });
});

// Uses the same database receipt transaction as chat; no wallet or purchase path.
it('deduplicates a confirmed gift after a lost acknowledgement and deletion', async () => {
  const event = { type: 'gift' as const, giftId: 'car' as const, recipientId: 'host', requestId };
  await sendVoiceEvent('room', 'host', event);
  await sendVoiceEvent('room', 'host', event);
  expect(state.messages).toHaveLength(1);
  expect(state.messages[0].clientId).toBe(requestId);
  expect(mock.db.voiceChatCommand.create).toHaveBeenCalledOnce();
  state.messages = [];
  await sendVoiceEvent('room', 'host', event);
  expect(state.messages).toHaveLength(0);
});

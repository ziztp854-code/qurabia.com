import type { VoiceIdentity, VoiceRoomState } from './types';
import { randomUUID } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';
vi.stubGlobal('TextEncoder', TextEncoder);
vi.stubGlobal('TextDecoder', TextDecoder);
vi.stubGlobal('Uint8Array', new TextEncoder().encode('').constructor);
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '@tahaddi/database';
import { AccessToken, TokenVerifier } from 'livekit-server-sdk';
import { POST as tokenRoute } from '@/app/api/voice/rooms/[roomId]/token/route';
import { admitVoiceSignal } from './admission';
import { createVoiceToken } from './livekit';
import {
  createVoiceRoom,
  joinVoiceRoom,
  leaveVoiceRoom,
  withVoiceMediaSnapshot,
} from './repository';
import { createRoomSchema } from './schemas';
import { upgradeVoiceMembership } from './repository';

type Database = ReturnType<typeof createPrismaClient>;
const auth = vi.hoisted(() => ({ identity: undefined as unknown as VoiceIdentity }));
const boundary = vi.hoisted(() => ({
  client: (): Database => {
    throw new Error('DB not initialized');
  },
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => boundary.client() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: async () => null }));
vi.mock('./identity', () => ({
  voiceRateLimit: async () => {},
  voiceIdentity: async () => auth.identity,
}));
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
    throw new Error('Requires an isolated localhost voice_test_* database');
}
describe.skipIf(!url)('membership-bound voice admission with PostgreSQL', () => {
  let db: Database;
  const id = randomUUID();
  const host = { id: `epoch-host-${id}`, name: 'Host', image: null, tokenVersion: 0 };
  const member = { id: `epoch-member-${id}`, name: 'Member', image: null, tokenVersion: 0 };
  beforeAll(async () => {
    db = createPrismaClient(url!);
    boundary.client = () => db;
    vi.stubEnv('LIVEKIT_MODE', 'gateway');
    vi.stubEnv('LIVEKIT_URL', 'ws://127.0.0.1:7890');
    vi.stubEnv('LIVEKIT_INTERNAL_URL', 'ws://127.0.0.1:7880');
    vi.stubEnv('LIVEKIT_API_KEY', 'local-membership-test');
    vi.stubEnv('LIVEKIT_API_SECRET', 'local-membership-test-secret-32-characters');
    await db.user.createMany({ data: [host, member].map((u) => ({ id: u.id, name: u.name })) });
  });
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: { in: [host.id, member.id] } } });
      await db.$disconnect();
    }
    vi.unstubAllEnvs();
  });
  it('rejects stale or suspended identities before creating room membership', async () => {
    const user = { id: `stale-create-${randomUUID()}`, name: 'Stale', image: null, tokenVersion: 0 };
    await db.user.create({ data: { id: user.id, name: user.name } });
    try {
      await db.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
      await expect(createVoiceRoom(user, createRoomSchema.parse({ name: 'Stale' }))).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
      await db.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
      await expect(createVoiceRoom(user, createRoomSchema.parse({ name: 'Stale reactivated' }))).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
      expect(await db.voiceRoom.count({ where: { hostId: user.id } })).toBe(0);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });
  it('rejects a join when an overlapping account suspension commits before the room write', async () => {
    const user = { id: `stale-join-${randomUUID()}`, name: 'Stale', image: null, tokenVersion: 0 };
    await db.user.create({ data: { id: user.id, name: user.name } });
    const room = await createVoiceRoom(host, createRoomSchema.parse({ name: 'Concurrent join' }));
    let unblock!: () => void;
    let updated!: () => void;
    const updateStarted = new Promise<void>((resolve) => { updated = resolve; });
    const releaseUpdate = new Promise<void>((resolve) => { unblock = resolve; });
    const update = db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
      updated();
      await releaseUpdate;
    });
    try {
      await updateStarted;
      const joined = joinVoiceRoom(room.room.id, user, {});
      // Give the join time to reach the locked account row before committing the suspension.
      await new Promise((resolve) => setTimeout(resolve, 100));
      unblock();
      await update;
      await expect(joined).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
      const saved = await db.voiceRoom.findUniqueOrThrow({ where: { id: room.room.id } });
      expect((saved.state as unknown as VoiceRoomState).participants.some((p) => p.id === user.id)).toBe(false);
    } finally {
      unblock();
      await update.catch(() => undefined);
      await db.user.delete({ where: { id: user.id } });
    }
  });
  it('upgrades an already open legacy membership through the authenticated reconnect token endpoint', async () => {
    const room = await createVoiceRoom(host, createRoomSchema.parse({ name: 'Legacy reconnect' }));
    const roomId = room.room.id;
    await joinVoiceRoom(roomId, member, {});
    const record = await db.voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
    const state = structuredClone(record.state) as unknown as VoiceRoomState;
    delete state.participants.find((p) => p.id === member.id)!.membershipId;
    await db.voiceRoom.update({ where: { id: roomId }, data: { state: state as unknown as NonNullable<typeof record.state> } });
    const old = new AccessToken(
      'local-membership-test',
      'local-membership-test-secret-32-characters',
      {
        identity: member.id,
        metadata: JSON.stringify({ voiceSessionVersion: 0 }),
      },
    );
    old.addGrant({ roomJoin: true, room: `tahaddi-voice-${roomId}` });
    auth.identity = member;
    const request = () =>
      new Request(`http://localhost/api/voice/rooms/${roomId}/token`, {
        method: 'POST',
        headers: { origin: 'http://localhost' },
      });
    const response = await tokenRoute(request(), { params: Promise.resolve({ roomId }) });
    expect(response.status).toBe(200);
    const issued = await response.json();
    expect(issued.token).toBeTruthy();
    await expect(admitVoiceSignal(await old.toJwt())).rejects.toMatchObject({ status: 401 });
    await expect(admitVoiceSignal(issued.token)).resolves.toHaveProperty('token');
    await leaveVoiceRoom(roomId, member.id);
    expect((await tokenRoute(request(), { params: Promise.resolve({ roomId }) })).status).toBe(403);
  });
  it('hides membership in public snapshots while issuing, denying old and admitting renewed tokens', async () => {
    const room = await createVoiceRoom(host, createRoomSchema.parse({ name: 'Membership test' }));
    const roomId = room.room.id;
    const joined = await joinVoiceRoom(roomId, member, {});
    expect(JSON.stringify(joined)).not.toContain('membershipId');
    const issue = () =>
      withVoiceMediaSnapshot(roomId, (snapshot, ledger) => {
        const current = snapshot.participants.find((p) => p.id === member.id)!;
        expect(current.membershipId).toBeTruthy();
        return createVoiceToken(roomId, current, 0, ledger);
      });
    const old = await issue();
    await expect(admitVoiceSignal(old.token)).resolves.toHaveProperty('token');
    await leaveVoiceRoom(roomId, member.id);
    await joinVoiceRoom(roomId, member, {});
    await expect(admitVoiceSignal(old.token)).rejects.toMatchObject({ code: 'NOT_MEMBER' });
    const fresh = await issue();
    const admitted = await admitVoiceSignal(fresh.token);
    const claims = await new TokenVerifier(
      'local-membership-test',
      'local-membership-test-secret-32-characters',
    ).verify(admitted.token);
    expect(JSON.parse(claims.metadata!).voiceMembershipId).toBeTruthy();
    expect(claims.sub).toBe(member.id);
  });
  it('refuses legacy upgrade for suspended accounts and stale account sessions', async () => {
    const room = await createVoiceRoom(host, createRoomSchema.parse({ name: 'Legacy account' }));
    const roomId = room.room.id;
    await joinVoiceRoom(roomId, member, {});
    const record = await db.voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
    const state = structuredClone(record.state) as unknown as VoiceRoomState;
    delete state.participants.find((p) => p.id === member.id)!.membershipId;
    await db.voiceRoom.update({ where: { id: roomId }, data: { state: state as unknown as NonNullable<typeof record.state> } });
    await expect(upgradeVoiceMembership(roomId, member.id, 1)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    await db.user.update({ where: { id: member.id }, data: { status: 'SUSPENDED' } });
    try {
      await expect(upgradeVoiceMembership(roomId, member.id, 0)).rejects.toMatchObject({
        code: 'SESSION_REVOKED',
      });
    } finally {
      await db.user.update({ where: { id: member.id }, data: { status: 'ACTIVE' } });
    }
    const after = await db.voiceRoom.findUniqueOrThrow({ where: { id: roomId } });
    expect(
      (after.state as unknown as VoiceRoomState).participants.find((p) => p.id === member.id)!.membershipId,
    ).toBeUndefined();
  });
});

import type { VoiceIdentity } from './types';
// Opt-in acceptance test: real Cloud and isolated PostgreSQL. Never log tokens or SDK errors.
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '@tahaddi/database';
import { RoomServiceClient, TokenVerifier } from 'livekit-server-sdk';
import { POST as tokenRoute } from '@/app/api/voice/rooms/[roomId]/token/route';
import { processVoiceMediaJob } from './media-sync-queue';
import { createVoiceRoom, getVoiceSnapshot, joinVoiceRoom, leaveVoiceRoom } from './repository';
import { createRoomSchema } from './schemas';
import { voiceMediaRoomName } from './livekit';

type Database = ReturnType<typeof createPrismaClient>;
const fixture = vi.hoisted(() => ({
  database: (): Database => { throw new Error('Fixture database is not initialized'); },
  identity: undefined as unknown as VoiceIdentity,
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => fixture.database() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: async () => null }));
vi.mock('./identity', () => ({ voiceRateLimit: async () => {}, voiceIdentity: async () => fixture.identity }));

const expectedOrigin = 'wss://tahaddi-voice-security-test-fdul384n.livekit.cloud';
const dbUrl = process.env.VOICE_TEST_DATABASE_URL;
const cloudUrl = process.env.VOICE_TEST_CLOUD_URL;
const key = process.env.VOICE_TEST_CLOUD_KEY;
const secret = process.env.VOICE_TEST_CLOUD_SECRET;
if (dbUrl) {
  const u = new URL(dbUrl);
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ||
      !/^\/voice_test_[a-z0-9_]+$/.test(u.pathname) || u.search || u.hash)
    throw new Error('Cloud race acceptance requires a localhost voice_test_* database');
}
if (cloudUrl && cloudUrl !== expectedOrigin && cloudUrl !== `${expectedOrigin}/`)
  throw new Error('Cloud race acceptance refuses this Cloud endpoint');

describe('Cloud delayed revocation acceptance', () => {
  const id = randomUUID();
  const host = { id: `race-host-${id}`, name: 'Host', image: null, tokenVersion: 0 };
  const member = { id: `race-member-${id}`, name: 'Member', image: null, tokenVersion: 0 };
  let db: Database;
  let roomId = '';
  let service: RoomServiceClient;
  const sockets = new Set<WebSocket>();
  const require = createRequire(import.meta.url);
  const sdkRequire = createRequire(require.resolve('livekit-server-sdk'));
  const { SignalResponse } = sdkRequire('@livekit/protocol');

  beforeAll(async () => {
    if (!dbUrl || !cloudUrl || !key || !secret)
      throw new Error('Cloud race acceptance requires explicit test database and Cloud settings');
    vi.stubEnv('LIVEKIT_MODE', 'cloud');
    vi.stubEnv('LIVEKIT_URL', expectedOrigin);
    vi.stubEnv('LIVEKIT_INTERNAL_URL', '');
    vi.stubEnv('LIVEKIT_API_KEY', key!);
    vi.stubEnv('LIVEKIT_API_SECRET', secret!);
    db = createPrismaClient(dbUrl!);
    fixture.database = () => db;
    service = new RoomServiceClient(expectedOrigin.replace('wss:', 'https:'), key!, secret!, { requestTimeout: 8, failover: false });
    await db.user.createMany({ data: [host, member].map(({ id: userId, name }) => ({ id: userId, name })) });
    roomId = (await createVoiceRoom(host, createRoomSchema.parse({ name: 'Cloud race fixture' }))).room.id;
    await service.createRoom({ name: voiceMediaRoomName(roomId), emptyTimeout: 120, maxParticipants: 4 });
    await joinVoiceRoom(roomId, member, {});
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    for (const socket of sockets) socket.close();
    try {
      if (service && roomId) await service.deleteRoom(voiceMediaRoomName(roomId));
    } finally {
      try {
        if (db && roomId) await db.voiceRoom.deleteMany({ where: { id: roomId } });
        if (db) await db.user.deleteMany({ where: { id: { in: [host.id, member.id] } } });
      } finally { await db?.$disconnect(); vi.unstubAllEnvs(); }
    }
  });

  function signal(token: string): Promise<{ socket: WebSocket; participant: { identity: string; sid: string; permission: { canSubscribe: boolean } }; closed: () => boolean }> {
    return new Promise((resolve, reject) => {
      const url = new URL('/rtc', expectedOrigin);
      url.search = new URLSearchParams({ access_token: token, protocol: '15', sdk: 'js', version: '2.23.0', auto_subscribe: '0' }).toString();
      const socket = new WebSocket(url); sockets.add(socket); socket.binaryType = 'arraybuffer';
      let settled = false; let closed = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; socket.close(); reject(new Error('Signal timeout')); } }, 8000);
      const failed = (reason: string) => { closed = true; sockets.delete(socket); if (!settled) { settled = true; clearTimeout(timer); reject(new Error(reason)); } };
      socket.addEventListener('error', () => failed('Signal transport error'));
      socket.addEventListener('close', () => failed('Signal closed before joining'));
      socket.addEventListener('message', (event) => {
        try {
          const message = typeof event.data === 'string' ? SignalResponse.fromJson(JSON.parse(event.data)) : SignalResponse.fromBinary(new Uint8Array(event.data as ArrayBuffer));
          if (message.message.case === 'join' && !settled) {
            settled = true; clearTimeout(timer);
            resolve({ socket, participant: message.message.value.participant, closed: () => closed });
          }
          if (message.message.case === 'leave') failed('Signal left before joining');
        } catch { failed('Signal response parsing failed'); }
      });
    });
  }

  // Inspect the actual WebSocket upgrade response: an error, close, timeout or
  // malformed frame is not evidence that the signaling endpoint denied auth.
  function signalUpgradeStatus(token: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = new URL('/rtc', expectedOrigin.replace('wss:', 'https:'));
      url.search = new URLSearchParams({ access_token: token, protocol: '15', sdk: 'js', version: '2.23.0', auto_subscribe: '0' }).toString();
      const request = httpsRequest(url, { headers: {
        Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      } });
      request.setTimeout(8000, () => request.destroy(new Error('Signal upgrade timeout')));
      request.on('response', (response) => { response.resume(); resolve(response.statusCode ?? 0); });
      request.on('upgrade', (_response, socket) => { socket.destroy(); reject(new Error('Revoked token upgraded signaling')); });
      request.on('error', () => reject(new Error('Signal upgrade transport failed')));
      request.end();
    });
  }

  async function issue() {
    fixture.identity = member;
    return tokenRoute(new Request(`http://localhost/api/voice/rooms/${roomId}/token`, {
      method: 'POST', headers: { origin: 'http://localhost' },
    }), { params: Promise.resolve({ roomId }) });
  }

  it('keeps the new membership connected after an earlier removal arrives late', async () => {
    // Flush the initial durable job before issuing A through the real endpoint.
    expect(await processVoiceMediaJob(roomId)).toBe('completed');
    const firstResponse = await issue();
    expect(firstResponse.status).toBe(200);
    const a = (await firstResponse.json()).token as string;
    const claimsA = await new TokenVerifier(key!, secret!).verify(a);
    const sessionA = await signal(a);
    expect(sessionA.participant.identity).toBe(claimsA.sub);

    const original = RoomServiceClient.prototype.removeParticipant;
    let delayed: (() => Promise<unknown>) | undefined;
    const remove = vi.spyOn(RoomServiceClient.prototype, 'removeParticipant').mockImplementation(function (this: RoomServiceClient, room, identity, options) {
      if (!delayed && room === voiceMediaRoomName(roomId) && identity === claimsA.sub) {
        // Simulate a timeout before sending; release this captured request later.
        delayed = original.bind(this, room, identity, options);
        return Promise.reject(new Error('simulated provider timeout'));
      }
      return original.call(this, room, identity, options);
    });
    let restarted: Database | undefined;
    try {
      await leaveVoiceRoom(roomId, member.id);
      await joinVoiceRoom(roomId, member, {});
      expect(await processVoiceMediaJob(roomId)).toBe('failed');
      expect(delayed).toBeTypeOf('function');
      expect((await getVoiceSnapshot(roomId, host.id)).mediaSyncPending).toBe(true);
      const pending = await issue();
      expect(pending.status).toBe(409);
      expect((await pending.json()).code).toBe('MEDIA_RETRY');

      // A fresh DB client represents a restarted worker, retaining the persisted retry.
      restarted = createPrismaClient(dbUrl!); fixture.database = () => restarted!;
      await restarted.voiceMediaReconcileJob.update({ where: { roomId }, data: { nextAttemptAt: new Date(0) } });
      expect(await processVoiceMediaJob(roomId)).toBe('completed');
      expect(await restarted.voiceMediaReconcileJob.findUnique({ where: { roomId } })).toBeNull();
      expect((await getVoiceSnapshot(roomId, host.id)).mediaSyncPending).toBe(false);
      const responseB = await issue();
      expect(responseB.status).toBe(200);
      const b = (await responseB.json()).token as string;
      const claimsB = await new TokenVerifier(key!, secret!).verify(b);
      expect(claimsB.sub).not.toBe(claimsA.sub);
      const sessionB = await signal(b);
      expect(sessionB.participant.identity).toBe(claimsB.sub);
      expect(sessionB.participant.permission.canSubscribe).toBe(true);
      const sidB = sessionB.participant.sid;

      await delayed!();
      const participants = await service.listParticipants(voiceMediaRoomName(roomId));
      expect(participants.find((p) => p.identity === claimsB.sub)).toMatchObject({ sid: sidB, permission: { canSubscribe: true } });
      expect(sessionB.closed()).toBe(false);

      const validate = new URL('/rtc/validate', expectedOrigin.replace('wss:', 'https:'));
      validate.search = new URLSearchParams({ access_token: a, protocol: '15', sdk: 'js', version: '2.23.0' }).toString();
      let status: number;
      try { status = (await fetch(validate, { signal: AbortSignal.timeout(8000) })).status; }
      catch { throw new Error('Token validation request failed'); }
      expect(status).toBe(401);
      expect(await signalUpgradeStatus(a)).toBe(401);
      expect(sessionB.closed()).toBe(false);
    } finally {
      remove.mockRestore(); fixture.database = () => db;
      await restarted?.$disconnect();
    }
  });
});

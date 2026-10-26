// Opt-in: the dedicated runner requires an isolated localhost DB and SFU runtime.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '@tahaddi/database';
import { RoomServiceClient, TokenVerifier } from 'livekit-server-sdk';
import { admitVoiceSignal } from './admission';
import { createVoiceToken, reconcileVoiceMedia, voiceMediaRoomName } from './livekit';
import {
  createVoiceRoom,
  joinVoiceRoom,
  sendVoiceEvent,
  withVoiceMediaSnapshot,
} from './repository';
import { createRoomSchema } from './schemas';
import type { VoiceIdentity } from './types';

type Database = ReturnType<typeof createPrismaClient>;
const boundary = vi.hoisted(() => ({
  client: (): Database => {
    throw new Error('Local voice media acceptance database not initialized');
  },
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => boundary.client() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: async () => null }));

const databaseUrl = process.env.VOICE_TEST_DATABASE_URL;
const runtimePath = process.env.VOICE_TEST_SFU_RUNTIME;
if (databaseUrl) {
  const endpoint = new URL(databaseUrl);
  if (
    !['postgres:', 'postgresql:'].includes(endpoint.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
    !/^\/voice_test_[a-z0-9_]+$/.test(endpoint.pathname) ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error('Voice media acceptance refuses a non-fixture database');
}

describe.skipIf(!databaseUrl || !runtimePath)('real voice admission and late speaker grants', () => {
  let database: Database;
  let runtime: { url: string; key: string; secret: string };
  let service: RoomServiceClient;
  const userIds: string[] = [];

  beforeAll(() => {
    runtime = JSON.parse(fs.readFileSync(runtimePath!, 'utf8'));
    const endpoint = new URL(runtime.url);
    if (endpoint.hostname !== '127.0.0.1' || endpoint.port !== '17880')
      throw new Error('Voice media acceptance refuses a non-local SFU');
    database = createPrismaClient(databaseUrl!);
    boundary.client = () => database;
    vi.stubEnv('LIVEKIT_MODE', 'gateway');
    // The token's public URL must differ from the private SFU origin. This test
    // runs the real signaling admission function, then uses loopback transport.
    vi.stubEnv('LIVEKIT_URL', 'ws://127.0.0.1:17900');
    vi.stubEnv('LIVEKIT_INTERNAL_URL', runtime.url);
    vi.stubEnv('LIVEKIT_API_KEY', runtime.key);
    vi.stubEnv('LIVEKIT_API_SECRET', runtime.secret);
    for (const name of [
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
      'KV_REST_API_URL',
      'KV_REST_API_TOKEN',
    ])
      vi.stubEnv(name, '');
    service = new RoomServiceClient(
      runtime.url.replace(/^ws/, 'http'),
      runtime.key,
      runtime.secret,
    );
  });

  afterAll(async () => {
    try {
      if (database) await database.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await database?.$disconnect();
      vi.unstubAllEnvs();
    }
  });

  it.each(['before-connect', 'after-connect'] as const)(
    'delivers late speaker PCM to the existing host when promotion is %s',
    async (promotionOrder) => {
      const fixtureId = randomUUID();
      const identityByPersona = Object.fromEntries(
        ['receiver-a', 'receiver-b', 'late-publisher'].map((persona) => [
          persona,
          `media-${fixtureId}-${persona}`,
        ]),
      );
      const identities: Record<string, VoiceIdentity> = Object.fromEntries(
        Object.entries(identityByPersona).map(([persona, id]) => [
          persona,
          { id, name: persona, image: null, tokenVersion: 0 },
        ]),
      );
      const fixtureUsers = Object.values(identityByPersona);
      userIds.push(...fixtureUsers);
      await database.user.createMany({
        data: fixtureUsers.map((id) => ({ id, name: 'Local media fixture' })),
      });
      const host = identities['receiver-a'];
      const listener = identities['receiver-b'];
      const publisher = identities['late-publisher'];
      const room = await createVoiceRoom(host, createRoomSchema.parse({ name: 'Local media' }));
      await joinVoiceRoom(room.room.id, listener, {});
      const roomId = room.room.id;
      const roomName = voiceMediaRoomName(roomId);
      const artifacts = path.resolve(
        process.env.VOICE_TEST_MEDIA_ARTIFACTS || '../../output/voice-media-control-plane',
        `${promotionOrder}-${fixtureId}`,
      );
      const evidence: Array<{ stage: string; [key: string]: unknown }> = [];
      let hostSid: string | undefined;

      const permissions = async (stage: string) => {
        const peers = await service.listParticipants(roomName);
        const currentHost = peers.find((peer) => peer.identity === host.id);
        expect(currentHost?.permission?.canSubscribe).toBe(true);
        if (hostSid) expect(currentHost?.sid).toBe(hostSid);
        hostSid ??= currentHost!.sid;
        expect(peers.find((peer) => peer.identity === listener.id)?.permission?.canSubscribe).toBe(
          true,
        );
        evidence.push({
          stage,
          peers: peers.map((peer) => ({
            identity: peer.identity,
            sid: peer.sid,
            canPublish: peer.permission?.canPublish,
            canSubscribe: peer.permission?.canSubscribe,
          })),
        });
        return peers;
      };

      const promote = async () => {
        await sendVoiceEvent(roomId, host.id, { type: 'give-mic', userId: publisher.id });
        await reconcileVoiceMedia(roomId);
        const ready = await sendVoiceEvent(roomId, publisher.id, { type: 'mute', muted: false });
        expect(ready.me).toMatchObject({ role: 'speaker', muted: false, moderatorMuted: false });
      };
      const { checkBrowserLateJoin } = await import(
        '../../../../../tests/voice-acceptance/browser-late-join.mjs'
      );
      const report = await checkBrowserLateJoin(runtime, artifacts, {
        roomId,
        roomName,
        identityByPersona,
        async issueToken(persona: string) {
          const identity = identities[persona];
          const issued = await withVoiceMediaSnapshot(roomId, (snapshot, ledger) => {
            const member = snapshot.participants.find((person) => person.id === identity.id)!;
            return createVoiceToken(roomId, member, identity.tokenVersion, ledger);
          });
          const admitted = await admitVoiceSignal(issued.token);
          const claims = await new TokenVerifier(runtime.key, runtime.secret).verify(
            admitted.token,
          );
          expect(claims.sub).toBe(identity.id);
          expect(claims.video?.room).toBe(roomName);
          expect(claims.video?.canSubscribe).toBe(true);
          expect(claims.video?.canPublish).toBe(
            persona === 'receiver-a' ||
              (persona === 'late-publisher' && promotionOrder === 'before-connect'),
          );
          evidence.push({ stage: `admission-${persona}`, canPublish: admitted.canPublish });
          return { ...admitted, url: runtime.url };
        },
        async beforePublisherConnect() {
          await permissions('host-connected-before-new-member');
          await joinVoiceRoom(roomId, publisher, {});
          if (promotionOrder === 'before-connect') await promote();
          const peers = await permissions('new-member-before-sfu-connect');
          expect(peers.some((peer) => peer.identity === publisher.id)).toBe(false);
        },
        async afterPublisherConnect() {
          const peers = await permissions('publisher-connected');
          expect(peers.find((peer) => peer.identity === publisher.id)?.permission?.canPublish).toBe(
            promotionOrder === 'before-connect',
          );
          if (promotionOrder === 'after-connect') await promote();
          const reconciled = await permissions('publisher-granted');
          expect(
            reconciled.find((peer) => peer.identity === publisher.id)?.permission?.canPublish,
          ).toBe(true);
        },
      }).finally(() => {
        fs.mkdirSync(artifacts, { recursive: true });
        fs.writeFileSync(
          path.join(artifacts, 'control-plane.json'),
          JSON.stringify({ evidence }, null, 2),
        );
      });
      expect(report.ok).toBe(true);
      expect(evidence.map((entry) => entry.stage)).toEqual([
        'admission-receiver-a',
        'admission-receiver-b',
        'host-connected-before-new-member',
        'new-member-before-sfu-connect',
        'admission-late-publisher',
        'publisher-connected',
        'publisher-granted',
      ]);
      expect(
        report.receivers.every(
          (receiver: { tokenRequests: number }) => receiver.tokenRequests === 1,
        ),
      ).toBe(true);
      fs.mkdirSync(artifacts, { recursive: true });
      fs.writeFileSync(
        path.join(artifacts, 'report.json'),
        JSON.stringify({ ...report, evidence }, null, 2),
      );
    },
  );
});

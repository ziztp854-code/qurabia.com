// Replays the actual migration history in a disposable schema of a local test database.
// COMMUNITY_VOICE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55442/community_voice_test
// node node_modules/vitest/vitest.mjs run src/lib/community/community.integration.test.ts
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { URL as NodeURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaClient, type DatabaseClient } from '@tahaddi/database';

const context = vi.hoisted(() => ({
  db: null as DatabaseClient | null,
  actor: null as { id: string; tokenVersion: number } | null,
}));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => {
    if (!context.db) throw new Error('Integration database not initialized');
    return context.db;
  },
  hasDatabaseUrl: () => true,
}));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: async () => (context.actor ? { user: context.actor } : null),
  requirePermission: vi.fn(),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: async () => true }));

import {
  adminCommunityCommand,
  followProfile,
  getMyCommunityProfile,
  getPublicProfile,
  getUserIdentity,
  updateMyCommunityProfile,
} from './service';
import { commandVoiceRoom, createVoiceRoom } from '@/lib/voice/repository';

const connectionString = process.env.COMMUNITY_VOICE_TEST_DATABASE_URL;
const suite = describe.skipIf(!connectionString);
const prefix = `integration-${randomUUID()}`;
type MigrationClient = {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
};
const { Client } = createRequire(import.meta.url)('pg') as {
  Client: new (options: { connectionString?: string }) => MigrationClient;
};
const appearance = {
  frameId: null,
  effectId: null,
  primaryBadgeId: null,
  nameCardId: null,
  backgroundId: null,
  glowId: null,
};
type TestUser = { id: string; accountNumber: number; tokenVersion: number };

suite('community and voice with real PostgreSQL migrations and Prisma', () => {
  let db: DatabaseClient;
  let migrationClient: MigrationClient;
  let owner: TestUser;
  let admin: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let host: TestUser;

  async function newUser(name: string, role: 'USER' | 'ADMIN' = 'USER') {
    const user = await db.user.create({
      data: { id: `${prefix}-${name}`, name, email: `${prefix}-${name}@example.test`, role },
    });
    return user;
  }
  const as = (user: TestUser | null) => {
    context.actor = user ? { id: user.id, tokenVersion: user.tokenVersion } : null;
  };
  const voiceActor = (user: TestUser) => ({ userId: user.id, tokenVersion: user.tokenVersion });

  beforeAll(async () => {
    const url = new URL(connectionString!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/community_voice_test'
    )
      throw new Error('A dedicated local community_voice_test database is required');
    migrationClient = new Client({ connectionString });
    await migrationClient.connect();
    // This database is dedicated to this opt-in suite; production clients use public.
    await migrationClient.query('DROP SCHEMA public CASCADE');
    await migrationClient.query('CREATE SCHEMA public');
    const migrations = new NodeURL('../../../../../prisma/migrations/', import.meta.url);
    for (const directory of (await readdir(migrations, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (directory.name === '20261021220000_user_account_numbers') {
        await migrationClient.query(`INSERT INTO "User" (id,name,email,role,"updatedAt") VALUES
          ('legacy-owner','صاحب الموقع','owner@example.test','OWNER',NOW()),
          ('legacy-player','لاعب قديم','player@example.test','USER',NOW())`);
        await migrationClient.query(`INSERT INTO "Profile" (id,"userId","displayName",bio,"updatedAt")
          VALUES ('legacy-profile','legacy-player','الاسم المحفوظ','نبذة محفوظة',NOW())`);
      }
      await migrationClient.query(
        await readFile(new NodeURL(`${directory.name}/migration.sql`, migrations), 'utf8'),
      );
    }
    db = createPrismaClient(url.toString());
    context.db = db;
    owner = await db.user.findFirstOrThrow({ where: { role: 'OWNER', accountNumber: 1 } });
    admin = await newUser('admin', 'ADMIN');
    alice = await newUser('alice');
    bob = await newUser('bob');
    host = await newUser('host');
  }, 20000);

  afterAll(async () => {
    if (db) await db.$disconnect();
    if (migrationClient) {
      await migrationClient.query('ROLLBACK');
      await migrationClient.query('DROP SCHEMA IF EXISTS public CASCADE');
      await migrationClient.query('CREATE SCHEMA public');
      await migrationClient.end();
    }
    context.db = null;
  });

  it('retains legacy rows and custom account-number semantics after both migrations', async () => {
    const legacy = await db.user.findUniqueOrThrow({
      where: { id: 'legacy-player' },
      include: { profile: true },
    });
    expect(legacy.profile?.displayName).toBe('الاسم المحفوظ');
    expect(legacy.profile?.bio).toBe('نبذة محفوظة');
    expect(owner.accountNumber).toBe(1);
    expect(String(legacy.accountNumber)).toMatch(/^[1-9]\d{8}$/);
    expect(await db.communityBadge.count()).toBeGreaterThanOrEqual(18);
    expect(await db.profileCosmetic.count()).toBeGreaterThanOrEqual(6);
    await expect(
      db.user.update({ where: { id: alice.id }, data: { accountNumber: 555555555 } }),
    ).rejects.toThrow();
  });

  it('persists own profile settings, preserves names, and never serializes account secrets', async () => {
    as(alice);
    await updateMyCommunityProfile({
      bio: 'نبذة عربية محفوظة',
      username: `qa_${prefix.replaceAll('-', '').slice(-20)}`,
    });
    const mine = await getMyCommunityProfile();
    expect(mine.profile.name).toBe('alice');
    expect(mine.profile.bio).toBe('نبذة عربية محفوظة');
    const text = JSON.stringify(mine.profile);
    for (const forbidden of ['passwordHash', 'tokenVersion', 'emailVerified', '@example.test'])
      expect(text).not.toContain(forbidden);
    as(bob);
    await expect(updateMyCommunityProfile({ username: mine.profile.username })).rejects.toThrow();
  });

  it('checks privacy against the current session and permits unfollowing a newly private target', async () => {
    as(bob);
    await followProfile(alice.accountNumber, true);
    await followProfile(alice.accountNumber, true);
    expect(await db.userFollow.count({ where: { followerId: bob.id, targetId: alice.id } })).toBe(
      1,
    );
    as(alice);
    await updateMyCommunityProfile({ visibility: 'PRIVATE' });
    expect(await getPublicProfile(alice.accountNumber)).not.toBeNull();
    as(bob);
    expect(await getPublicProfile(alice.accountNumber)).toBeNull();
    await followProfile(alice.accountNumber, false);
    expect(await db.userFollow.count({ where: { followerId: bob.id, targetId: alice.id } })).toBe(
      0,
    );
    as(null);
    expect(await getPublicProfile(alice.accountNumber)).toBeNull();
    as(alice);
    await updateMyCommunityProfile({ visibility: 'PUBLIC' });
  });

  it('enforces owned cosmetics, resolves badge-linked items, revokes active appearance, and audits writes', async () => {
    as(alice);
    await expect(
      updateMyCommunityProfile({ appearance: { ...appearance, effectId: 'entrance-gold' } }),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_OWNED' });
    as(owner);
    await adminCommunityCommand({
      operation: 'grantBadge',
      accountNumber: alice.accountNumber,
      badgeId: 'gold-member',
    });
    as(alice);
    await updateMyCommunityProfile({
      appearance: {
        ...appearance,
        effectId: 'entrance-gold',
        frameId: 'frame-gold',
        primaryBadgeId: 'gold-member',
      },
    });
    expect((await getUserIdentity(alice.id))?.effect?.id).toBe('entrance-gold');
    expect((await db.user.findUniqueOrThrow({ where: { id: alice.id } })).role).toBe('USER');
    as(owner);
    await adminCommunityCommand({
      operation: 'revokeBadge',
      accountNumber: alice.accountNumber,
      badgeId: 'gold-member',
    });
    const identity = await getUserIdentity(alice.id);
    expect(identity?.effect).toBeNull();
    expect(identity?.frame).toBeNull();
    expect(identity?.badges.some((badge) => badge.id === 'gold-member')).toBe(false);
    expect(
      await db.auditLog.count({
        where: {
          targetUserId: alice.id,
          action: { in: ['community.grantBadge', 'community.revokeBadge'] },
        },
      }),
    ).toBe(2);
  });

  it('excludes expired grants and reserves sensitive badges for the actual owner', async () => {
    as(admin);
    await expect(
      adminCommunityCommand({
        operation: 'grantBadge',
        accountNumber: alice.accountNumber,
        badgeId: 'platform-founder',
      }),
    ).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    as(owner);
    await adminCommunityCommand({
      operation: 'grantCosmetic',
      accountNumber: bob.accountNumber,
      cosmeticId: 'entrance-diamond',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    as(bob);
    await updateMyCommunityProfile({ appearance: { ...appearance, effectId: 'entrance-diamond' } });
    await db.userCosmetic.updateMany({
      where: { userId: bob.id, cosmeticId: 'entrance-diamond' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await getUserIdentity(bob.id))?.effect).toBeNull();
    await expect(
      updateMyCommunityProfile({ appearance: { ...appearance, effectId: 'entrance-diamond' } }),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_OWNED' });
  });

  it('serializes competing room creation, joins, seat claims, and recipient-only signaling', async () => {
    const clientId = randomUUID();
    const started = Date.now();
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        createVoiceRoom(voiceActor(host), { name: 'غرفة اختبار قاعدة البيانات', clientId }, db),
      ),
    );
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(5000);
    const created = attempts.find(
      (result) => result.status === 'fulfilled',
    )! as PromiseFulfilledResult<Awaited<ReturnType<typeof createVoiceRoom>>>;
    const roomId = created.value.room.id;
    const users = await Promise.all(
      Array.from({ length: 7 }, (_, index) => newUser(`listener-${index}`)),
    );
    const clients = users.map(() => randomUUID());
    const joined = await Promise.all(
      users.map((user, index) =>
        commandVoiceRoom(roomId, voiceActor(user), { type: 'join', clientId: clients[index] }, db),
      ),
    );
    expect(joined.at(-1)?.room.members.length).toBeGreaterThanOrEqual(2);
    const snapshot = await commandVoiceRoom(
      roomId,
      voiceActor(host),
      { type: 'heartbeat', clientId },
      db,
    );
    expect(snapshot.room.members).toHaveLength(8);
    const serialized = JSON.stringify(snapshot.room.members);
    for (const privateKey of ['tokenVersion', 'clientId', 'lastSeenAt', 'limits', '@example.test'])
      expect(serialized).not.toContain(privateKey);
    const members = users.map((user) =>
      snapshot.room.members.find((member) => member.identity.userId === user.id)!,
    );
    // Entitlements must be refreshed for connected members, not frozen at first join.
    as(owner);
    await adminCommunityCommand({
      operation: 'grantBadge',
      accountNumber: users[0].accountNumber,
      badgeId: 'gold-member',
    });
    as(users[0]);
    await updateMyCommunityProfile({ appearance: { ...appearance, effectId: 'entrance-gold' } });
    const equipped = await commandVoiceRoom(
      roomId,
      voiceActor(users[0]),
      { type: 'heartbeat', clientId: clients[0] },
      db,
    );
    expect(
      equipped.room.members.find((member) => member.id === members[0].id)?.identity.effect?.id,
    ).toBe('entrance-gold');
    as(owner);
    await adminCommunityCommand({
      operation: 'revokeBadge',
      accountNumber: users[0].accountNumber,
      badgeId: 'gold-member',
    });
    const revoked = await commandVoiceRoom(
      roomId,
      voiceActor(users[0]),
      { type: 'heartbeat', clientId: clients[0] },
      db,
    );
    expect(
      revoked.room.members.find((member) => member.id === members[0].id)?.identity.effect,
    ).toBeNull();
    const seatResults = await Promise.allSettled(
      [0, 1].map((index) =>
        commandVoiceRoom(
          roomId,
          voiceActor(host),
          { type: 'approve-seat', clientId, memberId: members[index].id, seat: 2 },
          db,
        ),
      ),
    );
    expect(seatResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const self = snapshot.room.selfMemberId;
    await commandVoiceRoom(
      roomId,
      voiceActor(host),
      { type: 'mute', clientId, memberId: self, muted: false },
      db,
    );
    await commandVoiceRoom(
      roomId,
      voiceActor(host),
      {
        type: 'signal',
        clientId,
        targetMemberId: members[0].id,
        kind: 'offer',
        payload: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendonly\r\n',
      },
      db,
    );
    const recipient = await commandVoiceRoom(
      roomId,
      voiceActor(users[0]),
      { type: 'heartbeat', clientId: clients[0], cursor: 0 },
      db,
    );
    const bystander = await commandVoiceRoom(
      roomId,
      voiceActor(users[2]),
      { type: 'heartbeat', clientId: clients[2], cursor: 0 },
      db,
    );
    expect(recipient.room.signals).toHaveLength(1);
    expect(bystander.room.signals).toHaveLength(0);
    const pollStarted = Date.now();
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        commandVoiceRoom(
          roomId,
          voiceActor(users[index % users.length]),
          { type: 'heartbeat', clientId: clients[index % users.length] },
          db,
        ),
      ),
    );
    expect(Date.now() - pollStarted).toBeLessThan(5000);
    await commandVoiceRoom(roomId, voiceActor(host), { type: 'close', clientId }, db);
  }, 25000);

  it('deduplicates reconnect entrances, rejects an old tab, and prunes suspended members', async () => {
    const hostClient = randomUUID();
    const { room } = await createVoiceRoom(
      voiceActor(host),
      { name: 'اختبار إعادة الاتصال', clientId: hostClient },
      db,
    );
    const firstClient = randomUUID();
    const first = await commandVoiceRoom(
      room.id,
      voiceActor(bob),
      { type: 'join', clientId: firstClient },
      db,
    );
    const replacementClient = randomUUID();
    const replacement = await commandVoiceRoom(
      room.id,
      voiceActor(bob),
      { type: 'join', clientId: replacementClient },
      db,
    );
    expect(replacement.room.selfMemberId).toBe(first.room.selfMemberId);
    expect(
      replacement.room.entrances.filter(
        (entrance) => entrance.memberId === first.room.selfMemberId,
      ),
    ).toHaveLength(1);
    await expect(
      commandVoiceRoom(room.id, voiceActor(bob), { type: 'heartbeat', clientId: firstClient }, db),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_REQUIRED' });
    await db.user.update({ where: { id: bob.id }, data: { status: 'SUSPENDED' } });
    await expect(
      commandVoiceRoom(
        room.id,
        voiceActor(bob),
        { type: 'heartbeat', clientId: replacementClient },
        db,
      ),
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    const pruned = await commandVoiceRoom(
      room.id,
      voiceActor(host),
      { type: 'heartbeat', clientId: hostClient },
      db,
    );
    expect(pruned.room.members.some((member) => member.identity.userId === bob.id)).toBe(false);
    await commandVoiceRoom(room.id, voiceActor(host), { type: 'close', clientId: hostClient }, db);
  });

  it('enforces the 24-member limit when the last places are claimed concurrently', async () => {
    const hostClient = randomUUID();
    const { room } = await createVoiceRoom(
      voiceActor(host),
      { name: 'اختبار سعة الغرفة', clientId: hostClient },
      db,
    );
    const users = await Promise.all(
      Array.from({ length: 25 }, (_, index) => newUser(`capacity-${index}`)),
    );
    const results = await Promise.allSettled(
      users.map((user) =>
        commandVoiceRoom(room.id, voiceActor(user), { type: 'join', clientId: randomUUID() }, db),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(23);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(2);
    const snapshot = await commandVoiceRoom(
      room.id,
      voiceActor(host),
      { type: 'heartbeat', clientId: hostClient },
      db,
    );
    expect(snapshot.room.members).toHaveLength(24);
    await commandVoiceRoom(room.id, voiceActor(host), { type: 'close', clientId: hostClient }, db);
  }, 15000);
});

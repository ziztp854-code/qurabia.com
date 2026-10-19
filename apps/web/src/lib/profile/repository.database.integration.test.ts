import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaClient, type DatabaseClient } from '@tahaddi/database';
const holder = vi.hoisted(() => ({ db: undefined as DatabaseClient | undefined }));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => holder.db }));
import { profileSocialCounts, saveProfileIdentity } from './repository';
import { GET } from '@/app/api/profile/avatar/[userId]/route';
import sharp from 'sharp';
import { createVoiceRoom, getVoiceSnapshot, listVoiceRooms } from '@/lib/voice/repository';
import { createRoomSchema } from '@/lib/voice/schemas';

// Opt-in only, restricted to the disposable local database created by the test runner.
const url = process.env.PROFILE_TEST_DATABASE_URL;
const local =
  url &&
  new URL(url).hostname === '127.0.0.1' &&
  new URL(url).pathname.startsWith('/profile_test_');
if (url && !local)
  throw new Error('Profile integration tests require an isolated local test database.');
describe.skipIf(!local)('profile identity on real local PostgreSQL', () => {
  beforeAll(async () => {
    holder.db = createPrismaClient(url!);
    await holder.db.user.createMany({
      data: ['self', 'friend', 'blocked', 'inactive', 'racer1', 'racer2'].map((id) => ({
        id,
        name: `original-${id}`,
        status: id === 'inactive' ? ('SUSPENDED' as const) : ('ACTIVE' as const),
      })),
    });
    await holder.db.voicePreference.createMany({
      data: [
        {
          userId: 'self',
          state: { following: ['friend', 'blocked', 'inactive'], blockedUsers: [] },
        },
        { userId: 'friend', state: { following: ['self'], blockedUsers: [] } },
        { userId: 'blocked', state: { following: ['self'], blockedUsers: ['self'] } },
        { userId: 'inactive', state: { following: ['self'], blockedUsers: [] } },
      ],
    });
  });
  afterAll(async () => {
    await holder.db?.$disconnect();
  });
  it('counts actual follows with inactive and reciprocal blocking excluded', async () => {
    expect(await profileSocialCounts('self')).toEqual({ followers: 1, following: 1 });
  });
  it('creates a missing profile, persists identity/photo, serves it, and supports removal', async () => {
    const photo = await sharp({
      create: { width: 512, height: 512, channels: 3, background: 'white' },
    })
      .webp()
      .toBuffer();
    const identity = await saveProfileIdentity(
      'self',
      { displayName: 'اسم محفوظ', username: 'aziz_24', bio: 'نبذة محفوظة' },
      photo,
    );
    expect(identity).toMatchObject({
      displayName: 'اسم محفوظ',
      username: 'aziz_24',
      bio: 'نبذة محفوظة',
    });
    expect(identity.image).toMatch(/^\/api\/profile\/avatar\/self\?v=/);
    const user = await holder.db!.user.findUniqueOrThrow({ where: { id: 'self' } });
    expect(user.name).toBe('اسم محفوظ');
    expect(user.image).toBe(identity.image);
    const response = await GET(new Request('http://localhost/api/profile/avatar/self'), {
      params: Promise.resolve({ userId: 'self' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(photo);
    await saveProfileIdentity(
      'self',
      { displayName: 'اسم محفوظ', username: 'aziz_24', bio: '' },
      null,
    );
    expect(
      (await GET(new Request('http://localhost'), { params: Promise.resolve({ userId: 'self' }) }))
        .status,
    ).toBe(404);
  });
  it('atomically resolves concurrent username claims and rolls back the losing display-name write', async () => {
    const results = await Promise.allSettled(
      ['racer1', 'racer2'].map((id) =>
        saveProfileIdentity(id, { displayName: `changed-${id}`, username: 'one_unique', bio: '' }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { status: 409, code: 'USERNAME_TAKEN' },
    });
    const loser = results[0].status === 'rejected' ? 'racer1' : 'racer2';
    expect((await holder.db!.user.findUniqueOrThrow({ where: { id: loser } })).name).toBe(
      `original-${loser}`,
    );
  });
  it('refreshes an existing room host/participant identity from the edited profile without reconnecting', async () => {
    const room = await createVoiceRoom(
      { id: 'self', name: 'اسم قديم', image: null, tokenVersion: 0 },
      createRoomSchema.parse({ name: 'مجلس الاختبار المحلي' }),
    );
    await saveProfileIdentity('self', {
      displayName: 'اسم الغرفة الجديد',
      username: 'aziz_voice',
      bio: '',
    });
    const snapshot = await getVoiceSnapshot(room.room.id, 'self');
    expect(snapshot.room.hostName).toBe('اسم الغرفة الجديد');
    expect(snapshot.participants.find((p) => p.id === 'self')?.name).toBe('اسم الغرفة الجديد');
    expect((await listVoiceRooms('self')).rooms.find((r) => r.id === room.room.id)?.hostName).toBe(
      'اسم الغرفة الجديد',
    );
  });
});

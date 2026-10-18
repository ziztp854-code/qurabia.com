import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  expect,
  request as http,
  test,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { createPrismaClient, type DatabaseClient } from '@tahaddi/database';
import { hashPassword } from '../src/lib/auth/password';
import type {
  VoiceCreateInput,
  VoiceEvent,
  VoiceList,
  VoicePreferences,
  VoiceSnapshot,
} from '../src/lib/voice/types';

// Deliberately HTTP-only: no page/browser fixture or generated visual evidence.
const databaseUrl = process.env.VOICE_TEST_DATABASE_URL;
test.skip(!databaseUrl, 'Requires an explicitly isolated local voice_test database.');
const password = `VoiceAa42!${randomUUID()}`;
let passwordHash: string;
let db: DatabaseClient;
const userIds: string[] = [];
const roomIds: string[] = [];
const clients: APIRequestContext[] = [];
type Actor = { id: string; api: APIRequestContext; origin: string };

const settings: VoiceCreateInput = {
  name: 'مجلس اختبار محلي',
  description: 'بيانات اختبار محلية وليست نشاطًا إنتاجيًا',
  category: 'مجالس',
  cover: '/voice/covers/friends.webp',
  seatCount: 4,
  isPrivate: false,
  allowMicRequests: true,
  chatEnabled: true,
  moderatorsCanManage: true,
};

async function body<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.status()} ${await response.text()}`).toBeTruthy();
  expect(response.headers()['cache-control']).toContain('no-store');
  return response.json() as Promise<T>;
}

async function actor(baseURL: string): Promise<Actor> {
  const id = `voice_e2e_${randomUUID()}`;
  const email = `${id}@example.test`;
  userIds.push(id);
  await db.user.create({
    data: { id, email, name: 'مستخدم اختبار', passwordHash, role: 'USER', status: 'ACTIVE' },
  });
  const api = await http.newContext({ baseURL });
  clients.push(api);
  const csrf = await api.get('/api/auth/csrf');
  const { csrfToken } = await csrf.json();
  const signedIn = await api.post('/api/auth/callback/credentials', {
    form: { csrfToken, email, password, json: 'true', callbackUrl: '/voice' },
  });
  expect(signedIn.ok()).toBeTruthy();
  const session = await api.get('/api/auth/session');
  expect((await session.json()).user.id).toBe(id);
  return { id, api, origin: new URL(baseURL).origin };
}
function post(who: Actor, path: string, data: unknown) {
  return who.api.post(path, { headers: { Origin: who.origin }, data });
}
function event(who: Actor, id: string, data: VoiceEvent) {
  return post(who, `/api/voice/rooms/${id}/events`, data);
}
async function create(who: Actor, overrides: Partial<VoiceCreateInput> = {}) {
  const snapshot = await body<VoiceSnapshot>(
    await post(who, '/api/voice/rooms', { ...settings, ...overrides }),
  );
  roomIds.push(snapshot.room.id);
  expect(snapshot.room.hostId).toBe(who.id);
  return snapshot;
}
async function join(who: Actor, id: string, data: { password?: string; invite?: string } = {}) {
  return body<VoiceSnapshot>(await post(who, `/api/voice/rooms/${id}/join`, data));
}
async function snapshot(who: Actor, id: string) {
  return body<VoiceSnapshot>(await who.api.get(`/api/voice/rooms/${id}`));
}

test.beforeAll(async () => {
  const target = new URL(databaseUrl!);
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !/^\/voice_test(?:_[a-zA-Z0-9_-]+)?$/.test(target.pathname) ||
    target.search ||
    target.hash
  ) {
    throw new Error('Refusing to seed a non-isolated database.');
  }
  db = createPrismaClient(databaseUrl!);
  await db.$connect();
  passwordHash = await hashPassword(password);
});

test.afterAll(async () => {
  try {
    if (db) {
      // Only exact test-owned IDs; no global delete or production schema reset.
      for (const roomId of roomIds) {
        await db.$executeRaw`DELETE FROM "VoiceReport" WHERE "roomId" = ${roomId}`;
        await db.$executeRaw`DELETE FROM "VoiceRoom" WHERE "id" = ${roomId}`;
      }
      for (const userId of userIds)
        await db.$executeRaw`DELETE FROM "VoicePreference" WHERE "userId" = ${userId}`;
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
  } finally {
    await Promise.all(clients.map((client) => client.dispose()));
    if (db) await db.$disconnect();
  }
});

test('authentication, Origin, input validation and revoked sessions are enforced by the API', async ({
  request,
  baseURL,
}) => {
  const unauthenticated = await request.post('/api/voice/rooms', {
    headers: { Origin: baseURL! },
    data: settings,
  });
  expect(unauthenticated.status()).toBe(401);
  const host = await actor(baseURL!);
  expect((await host.api.post('/api/voice/rooms', { data: settings })).status()).toBe(403);
  expect(
    (
      await host.api.post('/api/voice/rooms', {
        headers: { Origin: 'https://foreign.example.test' },
        data: settings,
      })
    ).status(),
  ).toBe(403);
  for (const invalid of [
    { ...settings, hostId: host.id },
    { ...settings, cover: 'https://foreign.example.test/cover.svg' },
    { ...settings, seatCount: 99 },
    { ...settings, name: '' },
  ])
    expect((await post(host, '/api/voice/rooms', invalid)).status()).toBe(400);
  // Keep validation requests within the real create-rate limit.
  const malformedActor = await actor(baseURL!);
  const malformed = await malformedActor.api.post('/api/voice/rooms', {
    headers: { Origin: malformedActor.origin, 'Content-Type': 'application/json' },
    data: '{',
  });
  expect(malformed.status()).toBe(400);
  const huge = await post(malformedActor, '/api/voice/rooms', {
    ...settings,
    description: 'a'.repeat(20_000),
  });
  expect(huge.status()).toBe(413);
  const room = await create(host);
  // Four rejected schema payloads plus this creation exhaust the real five-per-minute quota.
  expect((await post(host, '/api/voice/rooms', settings)).status()).toBe(429);
  await db.user.update({ where: { id: host.id }, data: { tokenVersion: { increment: 1 } } });
  expect((await event(host, room.room.id, { type: 'close' })).status()).toBe(401);
});

test('private admission protects settings, chat and invitation scope without leaking secrets', async ({
  baseURL,
}) => {
  const host = await actor(baseURL!);
  const member = await actor(baseURL!);
  const outsider = await actor(baseURL!);
  const privatePassword = `PrivateAa42!${randomUUID()}`;
  const created = await create(host, { isPrivate: true, password: privatePassword });
  const id = created.room.id;
  const listed = await body<VoiceList>(await outsider.api.get('/api/voice/rooms'));
  expect(listed.rooms.some((room) => room.id === id)).toBe(false);
  expect((await outsider.api.get(`/api/voice/rooms/${id}`)).status()).toBe(403);
  expect((await outsider.api.get(`/api/voice/rooms/${id}/events`)).status()).toBe(403);
  expect(
    (await post(outsider, `/api/voice/rooms/${id}/join`, { password: 'wrong-password' })).status(),
  ).toBe(403);
  await join(member, id, { password: privatePassword });
  const firstInvite = await body<{ invite: string; url: string }>(
    await post(host, `/api/voice/rooms/${id}/invite`, {}),
  );
  const secondInvite = await body<{ invite: string; url: string }>(
    await post(host, `/api/voice/rooms/${id}/invite`, {}),
  );
  expect(firstInvite.invite).not.toBe(secondInvite.invite);
  expect(
    (await post(outsider, `/api/voice/rooms/${id}/join`, { invite: firstInvite.invite })).status(),
  ).toBe(403);
  await join(outsider, id, { invite: secondInvite.invite });
  const visible = await snapshot(member, id);
  const serialized = JSON.stringify(visible);
  for (const secret of [
    privatePassword,
    secondInvite.invite,
    'passwordHash',
    'inviteHash',
    'LIVEKIT_API_SECRET',
  ])
    expect(serialized).not.toContain(secret);
  expect((await post(member, `/api/voice/rooms/${id}/invite`, {})).status()).toBe(403);
});

test('listener privileges and concurrent seat allocation remain authoritative', async ({
  baseURL,
}) => {
  const host = await actor(baseURL!);
  const first = await actor(baseURL!);
  const second = await actor(baseURL!);
  const { room } = await create(host, { seatCount: 2 });
  const id = room.id;
  await join(first, id);
  await join(second, id);
  for (const command of [
    { type: 'role', userId: first.id, role: 'moderator' },
    { type: 'approve-seat', userId: first.id, seatIndex: 1 },
    { type: 'remove', userId: host.id },
    { type: 'close' },
    { type: 'mute', muted: false },
  ] satisfies VoiceEvent[])
    expect((await event(first, id, command)).status()).toBe(403);
  await body(await event(first, id, { type: 'request-seat', seatIndex: 1 }));
  await body(await event(second, id, { type: 'request-seat', seatIndex: 1 }));
  const approvals = await Promise.all([
    event(host, id, { type: 'approve-seat', userId: first.id, seatIndex: 1 }),
    event(host, id, { type: 'approve-seat', userId: second.id, seatIndex: 1 }),
  ]);
  expect(approvals.map((result) => result.status()).sort()).toEqual([200, 409]);
  const view = await snapshot(host, id);
  const seated = view.participants.filter((person) => person.seatIndex === 1);
  expect(seated).toHaveLength(1);
  const winner = seated[0].id === first.id ? first : second;
  const loser = winner.id === first.id ? second : first;
  await body(await event(host, id, { type: 'moderator-mute', userId: winner.id, muted: true }));
  expect((await event(winner, id, { type: 'mute', muted: false })).status()).toBe(403);
  await body(await event(winner, id, { type: 'leave-seat' }));
  await body(await event(host, id, { type: 'lock-seat', seatIndex: 1, locked: true }));
  expect((await event(loser, id, { type: 'request-seat', seatIndex: 1 })).status()).toBe(409);
  expect((await event(loser, id, { type: 'request-seat', seatIndex: 2 })).status()).toBe(400);
  await body(await event(host, id, { type: 'remove', userId: loser.id }));
  expect((await event(loser, id, { type: 'message', text: 'لا يسمح للمحظور' })).status()).toBe(403);
  expect((await post(loser, `/api/voice/rooms/${id}/join`, {})).status()).toBe(403);
});

test('chat is persisted, actor-bound and moderated from the server', async ({ baseURL }) => {
  const host = await actor(baseURL!);
  const member = await actor(baseURL!);
  const outsider = await actor(baseURL!);
  const { room } = await create(host);
  const id = room.id;
  await join(member, id);
  const unavailable = await post(host, `/api/voice/rooms/${id}/token`, {});
  expect(unavailable.status()).toBe(503);
  expect((await unavailable.json()).code).toBe('MEDIA_SETUP_REQUIRED');
  expect((await post(outsider, `/api/voice/rooms/${id}/token`, {})).status()).toBe(403);
  expect((await event(outsider, id, { type: 'message', text: 'غير مشارك' })).status()).toBe(403);
  const literalText = '<img src=x onerror=alert(1)> نص اختبار';
  const sent = await body<VoiceSnapshot>(
    await event(member, id, { type: 'message', text: literalText }),
  );
  const message = sent.messages.find((item) => item.text === literalText)!;
  expect(message.userId).toBe(member.id);
  expect((await snapshot(host, id)).messages).toContainEqual(message);
  const polled = await body<VoiceSnapshot>(await host.api.get(`/api/voice/rooms/${id}/events`));
  expect(polled.messages.some((item) => item.id === message.id)).toBe(true);
  expect(
    (
      await event(member, id, { type: 'pin-message', messageId: message.id, pinned: true })
    ).status(),
  ).toBe(403);
  await body(await event(host, id, { type: 'pin-message', messageId: message.id, pinned: true }));
  await body(await event(host, id, { type: 'message', text: 'رسالة المضيف', replyTo: message.id }));
  const hostMessage = (await snapshot(host, id)).messages.find((item) => item.userId === host.id)!;
  expect(
    (await event(member, id, { type: 'delete-message', messageId: hostMessage.id })).status(),
  ).toBe(403);
  await body(await event(member, id, { type: 'reaction', messageId: hostMessage.id, emoji: '👍' }));
  expect(
    (await snapshot(host, id)).messages.find((item) => item.id === hostMessage.id)!.reactions['👍'],
  ).toEqual([member.id]);
  await body(await event(host, id, { type: 'delete-message', messageId: message.id }));
  expect((await snapshot(member, id)).messages.some((item) => item.id === message.id)).toBe(false);
  await body(
    await host.api.patch(`/api/voice/rooms/${id}`, {
      headers: { Origin: host.origin },
      data: { chatEnabled: false, name: 'اسم محفوظ بعد التعديل' },
    }),
  );
  expect((await event(member, id, { type: 'message', text: 'الدردشة معطلة' })).status()).toBe(403);
  expect((await snapshot(member, id)).room.name).toBe('اسم محفوظ بعد التعديل');
  await body(await event(host, id, { type: 'close' }));
  expect((await post(outsider, `/api/voice/rooms/${id}/join`, {})).status()).toBe(410);
});

test('favorites and history are persisted per account', async ({ baseURL }) => {
  const host = await actor(baseURL!);
  const member = await actor(baseURL!);
  const outsider = await actor(baseURL!);
  const { room } = await create(host);
  await join(member, room.id);
  await body(
    await member.api.patch('/api/voice/preferences', {
      headers: { Origin: member.origin },
      data: { type: 'favorite', id: room.id, enabled: true },
    }),
  );
  const preferences = await body<VoicePreferences>(await member.api.get('/api/voice/preferences'));
  expect(preferences.favorites).toContain(room.id);
  expect(preferences.history.some((visit) => visit.roomId === room.id)).toBe(true);
  const other = await body<VoicePreferences>(await outsider.api.get('/api/voice/preferences'));
  expect(other.favorites).not.toContain(room.id);
  expect(other.history.some((visit) => visit.roomId === room.id)).toBe(false);
  await db.user.update({ where: { id: member.id }, data: { tokenVersion: { increment: 1 } } });
  const afterRevocation = await body<VoiceSnapshot>(
    await host.api.get(`/api/voice/rooms/${room.id}/events`),
  );
  expect(afterRevocation.participants.some((person) => person.id === member.id)).toBe(false);
  expect(afterRevocation.room.participantCount).toBe(1);
  expect(JSON.stringify(afterRevocation)).not.toContain('tokenVersion');
});

test('cover uploads decode real images and protect private room assets', async ({ baseURL }) => {
  const host = await actor(baseURL!);
  const member = await actor(baseURL!);
  const outsider = await actor(baseURL!);
  const image = await sharp({
    create: { width: 120, height: 80, channels: 3, background: '#b28549' },
  })
    .png()
    .toBuffer();
  const upload = async (who: Actor, buffer: Buffer, mimeType = 'image/png') =>
    who.api.post('/api/voice/uploads', {
      headers: { Origin: who.origin },
      multipart: { file: { name: 'cover.png', mimeType, buffer } },
    });
  expect(
    (await upload(host, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).status(),
  ).toBe(400);
  expect((await upload(host, image, 'image/jpeg')).status()).toBe(400);
  expect((await upload(host, Buffer.alloc(2 * 1024 * 1024 + 1))).status()).toBe(413);
  const { url } = await body<{ url: string }>(await upload(host, image));
  const created = await create(host, {
    isPrivate: true,
    password: 'PrivateCoverAa42!',
    cover: url,
  });
  const id = created.room.id;
  const ownCover = await host.api.get(url);
  expect(ownCover.status()).toBe(200);
  expect(ownCover.headers()['content-type']).toBe('image/webp');
  expect((await sharp(await ownCover.body()).metadata()).format).toBe('webp');
  expect((await outsider.api.get(url)).status()).toBe(404);
  await join(member, id, { password: 'PrivateCoverAa42!' });
  expect((await member.api.get(url)).status()).toBe(200);
  expect((await post(outsider, '/api/voice/rooms', { ...settings, cover: url })).status()).toBe(
    403,
  );
  await body(await event(host, id, { type: 'remove', userId: member.id }));
  expect((await member.api.get(url)).status()).toBe(404);
});

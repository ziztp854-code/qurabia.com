// From apps/web, with VOICE_TEST_DATABASE_URL pointing to a pre-provisioned localhost
// voice_test_* schema: node node_modules/vitest/vitest.mjs run --config vitest.voice-quota.config.ts
// No schema changes are performed here; only this run's UUID fixtures are removed.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '@tahaddi/database';
import { createVoiceRoom, listVoiceRooms, sendVoiceEvent } from './repository';
import { createRoomSchema } from './schemas';
import type { VoiceIdentity } from './types';

type Database = ReturnType<typeof createPrismaClient>;
const boundary = vi.hoisted(() => ({
  client: (): Database => { throw new Error('Voice quota test database not initialized'); },
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => boundary.client() }));

// Never fall back to DATABASE_URL. The parent harness must provision this isolated schema.
const connectionString = process.env.VOICE_TEST_DATABASE_URL;
if (connectionString) {
  const parsed = new URL(connectionString);
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    !/^\/voice_test_[a-z0-9_]+$/.test(parsed.pathname) || parsed.search || parsed.hash
  ) throw new Error('VOICE_TEST_DATABASE_URL must target a localhost voice_test_* database');
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
  beforeAll(async () => {
    clients.push(namedClient(appNames[0]), namedClient(appNames[1]), namedClient(`fixture-${fixtureId}`));
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
    const held = new Promise<void>((resolve) => { acquired = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    // Blocking this test host's FK check makes both public calls overlap deterministically.
    const coordinator = clients[2].$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${host.id} FOR UPDATE`;
      acquired();
      await released;
    }, { timeout: 15_000 });
    let pending: Promise<PromiseSettledResult<Awaited<ReturnType<typeof createVoiceRoom>>>[]> | undefined;
    try {
      await held;
      pending = Promise.allSettled(clients.slice(0, 2).map((client) =>
        context.run(client, () => createVoiceRoom(host, input))));
      const deadline = Date.now() + 3000;
      while (true) {
        const [activity] = await clients[2].$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE application_name IN (${appNames[0]}, ${appNames[1]}) AND wait_event_type = 'Lock'
        `;
        if (activity.waiting === 2) break;
        if (Date.now() >= deadline) throw new Error('Concurrent quota fixture did not reach both lock waits');
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
    expect((await listVoiceRooms(host.id)).rooms.filter((room) => room.hostId === host.id)).toHaveLength(5);
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
    expect((await listVoiceRooms(owner.id)).rooms.filter((room) => room.hostId === owner.id)).toHaveLength(5);
  });

  it('allows a different host to create while the first host creation is blocked', async () => {
    const owners = ['blocked', 'independent'].map((suffix) => ({ ...host, id: `quota-${suffix}-${fixtureId}` }));
    fixtureUsers.push(...owners.map((owner) => owner.id));
    await clients[2].user.createMany({ data: owners.map((owner) => ({ id: owner.id, name: owner.name })) });
    let release!: () => void;
    let acquired!: () => void;
    const held = new Promise<void>((resolve) => { acquired = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    const coordinator = clients[2].$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "User" WHERE id = ${owners[0].id} FOR UPDATE`;
      acquired();
      await released;
    }, { timeout: 15_000 });
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
        if (Date.now() >= deadline) throw new Error('Blocked host fixture did not reach its lock wait');
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
    await expect(context.run(clients[0], () => createVoiceRoom(owner, input)))
      .rejects.toMatchObject({ code: 'P2003' });
    await clients[2].user.create({ data: { id: owner.id, name: owner.name } });
    await expect(context.run(clients[1], () => createVoiceRoom(owner, input)))
      .resolves.toMatchObject({ room: { active: true, hostId: owner.id } });
    expect((await listVoiceRooms(owner.id)).rooms.filter((room) => room.hostId === owner.id)).toHaveLength(1);
  });
});

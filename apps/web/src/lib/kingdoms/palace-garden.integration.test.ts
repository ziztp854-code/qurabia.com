import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import { createWorld, executeCommand } from './engine';
import { readPalaceGarden, savePalaceGarden } from './palace-garden-repository';

const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Palace garden isolated PostgreSQL persistence', () => {
  let db: DatabaseClient;
  const users: string[] = [], worlds: string[] = [];
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) || url.search || url.hash)
      throw new Error('Garden tests require an isolated local kingdoms_test database.');
    const { createPrismaClient } = await import('@tahaddi/database');
    db = createPrismaClient(databaseUrl!);
    await db.$connect();
  });
  afterAll(async () => {
    if (!db) return;
    try {
      await db.kingdomWorld.deleteMany({ where: { id: { in: worlds } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    } finally { await db.$disconnect(); }
  });
  it('serializes Alice and Bob saves without losing either garden or gameplay', async () => {
    const identities = await Promise.all(['alice', 'bob'].map(async (name) => {
      const id = `garden_test_${randomUUID()}`;
      users.push(id);
      await db.user.create({ data: { id, name, status: 'ACTIVE', role: 'USER', tokenVersion: 0 } });
      return { id, tokenVersion: 0 };
    }));
    const now = Date.now();
    const state = identities.reduce((world, actor) =>
      executeCommand(world, actor.id, { type: 'found', name: 'مملكة الحديقة' }, now), createWorld(now));
    const worldId = `garden_test_${randomUUID()}`;
    worlds.push(worldId);
    await db.kingdomWorld.create({ data: { id: worldId, name: 'حدائق معزولة', state: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue } });
    const a = Object.values(state.villages).find((village) => village.ownerId === identities[0].id)!.id;
    const b = Object.values(state.villages).find((village) => village.ownerId === identities[1].id)!.id;
    await Promise.all([
      savePalaceGarden(worldId, a, identities[0], [{ slotId: 0, itemId: 'red-roses' }], db),
      savePalaceGarden(worldId, b, identities[1], [{ slotId: 4, itemId: 'purple-flowers' }], db),
    ]);
    expect((await readPalaceGarden(worldId, a, identities[0], db)).slots).toEqual([{ slotId: 0, itemId: 'red-roses' }]);
    expect((await readPalaceGarden(worldId, b, identities[1], db)).slots).toEqual([{ slotId: 4, itemId: 'purple-flowers' }]);
    await expect(readPalaceGarden(worldId, a, identities[1], db)).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: identities[0].id }, data: { tokenVersion: 1 } });
    await expect(savePalaceGarden(worldId, a, identities[0], [], db)).rejects.toMatchObject({ status: 401 });
  });
});

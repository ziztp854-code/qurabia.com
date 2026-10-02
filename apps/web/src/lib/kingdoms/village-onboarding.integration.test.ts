import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';

const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('Village onboarding account persistence', () => {
  let db: DatabaseClient;
  let onboarding: typeof import('./village-onboarding');
  const userIds: string[] = [];

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      throw new Error('Onboarding tests require an isolated local kingdoms_test database.');
    const { createPrismaClient } = await import('@tahaddi/database');
    db = createPrismaClient(databaseUrl!);
    onboarding = await import('./village-onboarding');
    await db.$connect();
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  });

  async function account() {
    const id = `village_onboarding_test_${randomUUID()}`;
    userIds.push(id);
    await db.user.create({
      data: { id, name: 'جولة القرية', status: 'ACTIVE', role: 'USER', tokenVersion: 0 },
    });
    return { id, tokenVersion: 0 };
  }

  it('persists completion on the account and preserves the first server timestamp', async () => {
    const actor = await account();
    const other = await account();
    expect(await onboarding.readVillageOnboarding(actor, db)).toEqual({
      completed: false,
      completedAt: null,
    });
    const [{ now: before }] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const completed = await onboarding.completeVillageOnboarding(actor, db);
    const [{ now: after }] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    expect(completed.completed).toBe(true);
    expect(Date.parse(completed.completedAt!)).toBeGreaterThanOrEqual(before.getTime() - 1);
    expect(Date.parse(completed.completedAt!)).toBeLessThanOrEqual(after.getTime());
    expect(await onboarding.readVillageOnboarding(actor, db)).toEqual(completed);
    expect(await onboarding.completeVillageOnboarding(actor, db)).toEqual(completed);
    expect(await onboarding.readVillageOnboarding(other, db)).toEqual({
      completed: false,
      completedAt: null,
    });
  });

  it('gives simultaneous completions the same timestamp', async () => {
    const actor = await account();
    const [first, second] = await Promise.all([
      onboarding.completeVillageOnboarding(actor, db),
      onboarding.completeVillageOnboarding(actor, db),
    ]);
    expect(first.completed).toBe(true);
    expect(first).toEqual(second);
    expect(await onboarding.readVillageOnboarding(actor, db)).toEqual(first);
  });

  it('rejects revoked and suspended sessions at persistence time', async () => {
    const actor = await account();
    await db.user.update({ where: { id: actor.id }, data: { tokenVersion: 1 } });
    await expect(onboarding.completeVillageOnboarding(actor, db)).rejects.toMatchObject({
      status: 401,
    });
    await expect(onboarding.readVillageOnboarding(actor, db)).rejects.toMatchObject({
      status: 401,
    });
    await db.user.update({ where: { id: actor.id }, data: { status: 'SUSPENDED' } });
    await expect(
      onboarding.completeVillageOnboarding({ ...actor, tokenVersion: 1 }, db),
    ).rejects.toMatchObject({ status: 401 });
  });
});

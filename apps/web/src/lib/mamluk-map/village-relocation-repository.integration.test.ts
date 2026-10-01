import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import { createWorld, executeCommand, projectWorld } from '../kingdoms/engine';
import { provisionVillageGeography } from './village-geography';
import { MamlukViewportService } from './viewport-service';
import { PrismaWorldMapRepository } from './repository';
import { readVillageRelocation, relocateVillage } from './village-relocation-repository';
import { commandKingdomWorld, readKingdomWorld } from '../kingdoms/repository';

const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('atomic village relocation PostgreSQL integration', () => {
  let db: DatabaseClient;
  const userIds: string[] = [];
  const worldIds: string[] = [];
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      throw new Error('Relocation tests require an isolated local kingdoms_test database.');
    const { createPrismaClient } = await import('@tahaddi/database');
    db = createPrismaClient(databaseUrl!);
    await db.$connect();
  });
  afterAll(async () => {
    if (!db) return;
    try {
      await db.kingdomCommand.deleteMany({ where: { worldId: { in: worldIds } } });
      await db.kingdomWorld.deleteMany({ where: { id: { in: worldIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  });
  async function fixture() {
    const identities = ['owner', 'other'].map((role) => ({
      id: `relocate_${role}_${randomUUID()}`,
      tokenVersion: 0,
    }));
    userIds.push(...identities.map(({ id }) => id));
    await db.user.createMany({
      data: identities.map(({ id }) => ({
        id,
        name: 'اختبار نقل قرية',
        status: 'ACTIVE',
        role: 'USER',
        tokenVersion: 0,
      })),
    });
    const [{ now }] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const worldId = `relocation_${randomUUID()}`;
    worldIds.push(worldId);
    const state = provisionVillageGeography(
      worldId,
      identities.reduce(
        (world, actor) =>
          executeCommand(world, actor.id, { type: 'found', name: 'مملكة اختبار' }, now.getTime()),
        createWorld(now.getTime()),
      ),
    );
    await db.kingdomWorld.create({
      data: {
        id: worldId,
        name: 'اختبار نقل القرية',
        state: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue,
        revision: 1,
        nextEventAt: null,
      },
    });
    const owner = identities[0]!;
    const other = identities[1]!;
    const villageId = Object.values(state.villages).find(
      (village) => village.ownerId === owner.id,
    )!.id;
    const input = { worldId, villageId, idempotencyKey: randomUUID(), longitude: 35, latitude: 32 };
    return { owner, other, input, state };
  }
  it('commits once, supports exact retries and replaces old viewport geometry atomically', async () => {
    const { owner, input } = await fixture();
    expect(
      (await readVillageRelocation(input.worldId, input.villageId, owner, db)).canRelocate,
    ).toBe(true);
    const moved = await relocateVillage(input, owner, db);
    expect(moved).toMatchObject({ longitude: 35, latitude: 32, relocationUsed: true, revision: 2 });
    expect(await relocateVillage(input, owner, db)).toEqual(moved);
    const map = new MamlukViewportService(new PrismaWorldMapRepository(owner, db));
    const newViewport = await map.getViewport(
      { worldId: input.worldId, bounds: { west: 34, south: 31, east: 36, north: 33 } },
      { playerId: owner.id },
    );
    expect(
      newViewport.layers.cities.features.find((feature) => feature.id === input.villageId)?.geometry
        .coordinates,
    ).toEqual([35, 32]);
    expect(
      newViewport.layers.territories.features.some((feature) => feature.id === input.villageId),
    ).toBe(true);
    const oldViewport = await map.getViewport(
      { worldId: input.worldId, bounds: { west: 31, south: 29, east: 32, north: 31 } },
      { playerId: owner.id },
    );
    expect(
      oldViewport.layers.cities.features.some((feature) => feature.id === input.villageId),
    ).toBe(false);
    await expect(
      relocateVillage({ ...input, idempotencyKey: randomUUID(), longitude: 36 }, owner, db),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('serializes competing submissions so exactly one location is committed', async () => {
    const { owner, input } = await fixture();
    const results = await Promise.allSettled([
      relocateVillage(input, owner, db),
      relocateVillage({ ...input, longitude: 36, idempotencyKey: randomUUID() }, owner, db),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const stored = await readVillageRelocation(input.worldId, input.villageId, owner, db);
    expect(stored.revision).toBe(2);
    expect(stored.relocationUsed).toBe(true);
    await expect(relocateVillage({ ...input, latitude: 33 }, owner, db)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('fails closed for another owner, another world and a revoked session', async () => {
    const { owner, other, input } = await fixture();
    await expect(
      readVillageRelocation(input.worldId, input.villageId, other, db),
    ).rejects.toMatchObject({ status: 404 });
    await expect(relocateVillage(input, other, db)).rejects.toMatchObject({ status: 404 });
    await expect(
      relocateVillage({ ...input, worldId: 'missing-world' }, owner, db),
    ).rejects.toMatchObject({ status: 404 });
    await expect(relocateVillage(input, { ...owner, tokenVersion: 1 }, db)).rejects.toMatchObject({
      status: 401,
    });
    expect((await readVillageRelocation(input.worldId, input.villageId, owner, db)).revision).toBe(
      1,
    );
  });

  it('allows a renderable high-latitude location without breaking bounded vision', async () => {
    const { owner, input } = await fixture();
    await relocateVillage({ ...input, longitude: 179.9, latitude: 85 }, owner, db);
    const map = new MamlukViewportService(new PrismaWorldMapRepository(owner, db));
    const payload = await map.getViewport(
      { worldId: input.worldId, bounds: { west: 179.8, south: 84.9, east: 180, north: 85.1 } },
      { playerId: owner.id },
    );
    expect(
      payload.layers.cities.features.find((feature) => feature.id === input.villageId)?.geometry
        .coordinates,
    ).toEqual([179.9, 85]);
    expect(payload.layers.visibility.features).toHaveLength(1);
  });

  it('preserves the once-use flag through ordinary game commands without exposing internal metadata', async () => {
    const { owner, input, state } = await fixture();
    const before = await readKingdomWorld(input.worldId, owner, false, db);
    await relocateVillage(input, owner, db);
    const after = await readKingdomWorld(input.worldId, owner, false, db);
    if (!('map' in before) || !('map' in after))
      throw new Error('Expected player world projections');
    expect(after.map).toEqual(before.map);
    expect(after.villages.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
      before.villages.map(({ id, x, y }) => ({ id, x, y })),
    );
    expect(after.villages).toEqual(projectWorld(state, owner.id, after.serverNow).villages);
    expect(JSON.stringify(after)).not.toContain('villageRelocations');
    await commandKingdomWorld(
      input.worldId,
      owner,
      randomUUID(),
      { type: 'build', villageId: input.villageId, building: 'wall' },
      db,
    );
    expect(await readVillageRelocation(input.worldId, input.villageId, owner, db)).toMatchObject({
      longitude: 35,
      latitude: 32,
      relocationUsed: true,
      canRelocate: false,
    });
    await expect(
      relocateVillage({ ...input, longitude: 36, idempotencyKey: randomUUID() }, owner, db),
    ).rejects.toMatchObject({ status: 409 });
  });
});

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import type { Army, AreaGeometry, City } from '@mamluk/world-map-core';
import { WorldMapService } from '@mamluk/world-map-core/server';
import { createWorld, executeCommand } from '../kingdoms/engine';
import { PrismaWorldMapRepository, listMamlukMapWorlds } from './repository';
import { storeMapRecord, type MamlukMapState } from './storage';

const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;
function assertIsolatedDatabase(value: string): void {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Map integration tests require an explicitly isolated local kingdoms_test database.',
    );
}
const bounds = { west: 30, south: 29, east: 34, north: 33 };
const polygon: AreaGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [30, 29],
      [33, 29],
      [33, 32],
      [30, 32],
      [30, 29],
    ],
    [
      [31.4, 30.4],
      [31.6, 30.4],
      [31.6, 30.6],
      [31.4, 30.6],
      [31.4, 30.4],
    ],
  ],
};

describe.skipIf(!databaseUrl)('Mamluk geography PostgreSQL snapshots', () => {
  let db: DatabaseClient;
  const userIds: string[] = [];
  const worldIds: string[] = [];
  beforeAll(async () => {
    assertIsolatedDatabase(databaseUrl!);
    const { createPrismaClient } = await import('@tahaddi/database');
    db = createPrismaClient(databaseUrl!);
    await db.$connect();
  });
  afterAll(async () => {
    if (!db) return;
    try {
      await db.kingdomWorld.deleteMany({ where: { id: { in: worldIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  });

  async function fixture() {
    const viewer = { id: `map_test_${randomUUID()}`, tokenVersion: 0 };
    const outsider = { id: `map_test_${randomUUID()}`, tokenVersion: 0 };
    userIds.push(viewer.id, outsider.id);
    await db.user.createMany({
      data: [viewer, outsider].map((identity) => ({
        id: identity.id,
        name: 'اختبار خريطة',
        status: 'ACTIVE',
        role: 'USER',
        tokenVersion: 0,
      })),
    });
    const [{ now }] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const serverTime = now.getTime();
    const worldId = `map_world_${randomUUID()}`;
    worldIds.push(worldId);
    const base = executeCommand(
      createWorld(serverTime),
      viewer.id,
      { type: 'found', name: 'مملكة اختبار' },
      serverTime,
    );
    const city = (
      id: string,
      longitude: number,
      latitude: number,
      ownerPlayerId = outsider.id,
    ): City => ({
      id,
      worldId,
      name: id,
      regionId: 'egypt',
      longitude,
      latitude,
      ownerPlayerId,
      ownerSultanateId: null,
      fortificationLevel: 2,
      strategicValue: 10,
    });
    const army = (
      id: string,
      longitude: number,
      latitude: number,
      ownerPlayerId = outsider.id,
    ): Army => ({
      id,
      worldId,
      ownerPlayerId,
      ownerSultanateId: null,
      route: null,
      position: {
        armyId: id,
        longitude,
        latitude,
        status: 'stationed',
        origin: null,
        destination: null,
        departureTime: null,
        arrivalTime: null,
      },
    });
    const grant = (id: string, recipientPlayerId = viewer.id, expiresAt = serverTime + 60000) =>
      storeMapRecord({
        region: {
          id,
          worldId,
          recipientPlayerId,
          kind: 'watchtower' as const,
          geometry: polygon,
          startsAt: serverTime - 1000,
          expiresAt,
        },
        visibleTerritoryIds: ['territory'],
        visibleSultanateTerritoryIds: ['sultanate'],
      });
    const geography: MamlukMapState = {
      version: 1,
      cities: [
        city('cairo', 31.2357, 30.0444, viewer.id),
        city('visible-city', 31, 30),
        city('secret-city', 33.5, 32.5),
        city('outside-viewport', 40, 35),
        city('hole-city', 31.5, 30.5),
      ].map((value) => storeMapRecord(value)),
      castles: [storeMapRecord({ ...city('castle', 31.1, 30.1), cityId: 'visible-city' })],
      territories: [
        storeMapRecord({
          id: 'territory',
          worldId,
          regionId: 'egypt',
          geometry: polygon,
          ownerPlayerId: outsider.id,
          ownerSultanateId: null,
        }),
      ],
      sultanateTerritories: [
        storeMapRecord({ id: 'sultanate', worldId, sultanateId: 'mamluk', geometry: polygon }),
      ],
      armies: [
        army('visible-army', 31, 30),
        army('secret-army', 33.5, 32.5),
        army('hole-army', 31.5, 30.5),
        army('own-army', 33.7, 32.7, viewer.id),
      ].map((value) => storeMapRecord(value)),
      sieges: [
        storeMapRecord({
          id: 'siege',
          worldId,
          targetId: 'visible-city',
          targetKind: 'city',
          status: 'active',
          attackerPlayerId: outsider.id,
          defenderPlayerId: viewer.id,
          longitude: 31,
          latitude: 30,
        }),
      ],
      visibility: [
        grant('active'),
        grant('expired', viewer.id, serverTime - 1),
        grant('other-player', outsider.id),
      ],
    };
    const state = { ...base, geography };
    await db.kingdomWorld.create({
      data: {
        id: worldId,
        name: 'حملة الاختبار',
        state: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue,
        revision: 7,
      },
    });
    return { viewer, outsider, worldId, geography, state };
  }

  it('executes real bounded JSONB queries and removes hole/hidden enemies before projection', async () => {
    const { viewer, worldId } = await fixture();
    const payload = await new WorldMapService(new PrismaWorldMapRepository(viewer, db)).getViewport(
      { worldId, bounds },
      { playerId: viewer.id },
    );
    expect(payload.revision).toBe('7');
    expect(payload.layers.cities.features.map((feature) => feature.id)).toEqual([
      'cairo',
      'visible-city',
    ]);
    expect(payload.layers.armies.features.map((feature) => feature.id)).toEqual([
      'own-army',
      'visible-army',
    ]);
    expect(payload.layers.castles.features).toHaveLength(1);
    expect(payload.layers.territories.features).toHaveLength(1);
    expect(payload.layers.sultanateBorders.features).toHaveLength(1);
    expect(payload.layers.sieges.features).toHaveLength(1);
    const serialized = JSON.stringify(payload);
    for (const secret of [
      'secret-city',
      'secret-army',
      'hole-city',
      'hole-army',
      'outside-viewport',
      'other-player',
      'expired',
    ])
      expect(serialized).not.toContain(secret);
  });

  it('refuses nonmembers and revoked tokens and lists only authorized geographic campaigns', async () => {
    const { viewer, outsider, worldId } = await fixture();
    await expect(listMamlukMapWorlds(viewer, db)).resolves.toContainEqual({
      id: worldId,
      name: 'حملة الاختبار',
    });
    await expect(listMamlukMapWorlds(outsider, db)).resolves.toEqual([]);
    await expect(
      new PrismaWorldMapRepository(outsider, db).withSnapshot(
        worldId,
        { playerId: outsider.id },
        async () => true,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await db.user.update({ where: { id: viewer.id }, data: { tokenVersion: 1 } });
    await expect(
      new PrismaWorldMapRepository(viewer, db).withSnapshot(
        worldId,
        { playerId: viewer.id },
        async () => true,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('holds revision, grants and ownership constant while another transaction updates the world', async () => {
    const { viewer, worldId, state, geography } = await fixture();
    const result = await new PrismaWorldMapRepository(viewer, db).withSnapshot(
      worldId,
      { playerId: viewer.id },
      async (session) => {
        const before = await session.getCitiesInBounds({ bounds, limit: 100 });
        await db.kingdomWorld.update({
          where: { id: worldId },
          data: {
            revision: { increment: 1 },
            state: JSON.parse(
              JSON.stringify({ ...state, geography: { ...geography, cities: [], visibility: [] } }),
            ) as Prisma.InputJsonValue,
          },
        });
        const after = await session.getCitiesInBounds({ bounds, limit: 100 });
        return {
          revision: session.snapshot.revision,
          before: before.map((city) => city.id),
          after: after.map((city) => city.id),
        };
      },
    );
    expect(result).toEqual({
      revision: '7',
      before: ['cairo', 'visible-city'],
      after: ['cairo', 'visible-city'],
    });
    const current = await new WorldMapService(new PrismaWorldMapRepository(viewer, db)).getViewport(
      { worldId, bounds },
      { playerId: viewer.id },
    );
    expect(current.revision).toBe('8');
    expect(current.layers.cities.features).toHaveLength(0);
  });

  it('applies the database result limit and recognizes both dateline coordinates', async () => {
    const { viewer, worldId, state, geography } = await fixture();
    const seamCities = [175, -175, -180, 180, 0].map((longitude, index) =>
      storeMapRecord({
        ...geography.cities[0]!.value,
        id: `seam-${index}`,
        longitude,
        latitude: 0,
      }),
    );
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(
          JSON.stringify({
            ...state,
            geography: { ...geography, cities: seamCities, visibility: [] },
          }),
        ) as Prisma.InputJsonValue,
      },
    });
    await new PrismaWorldMapRepository(viewer, db).withSnapshot(
      worldId,
      { playerId: viewer.id },
      async (session) => {
        const crossing = { west: 170, east: -170, south: -10, north: 10 };
        const all = await session.getCitiesInBounds({ bounds: crossing, limit: 100 });
        expect(all.map((city) => city.id)).toEqual(['seam-0', 'seam-1', 'seam-2', 'seam-3']);
        const limited = await session.getCitiesInBounds({ bounds: crossing, limit: 1 });
        expect(limited).toHaveLength(1);
        const edge = await session.getCitiesInBounds({
          bounds: { west: 170, east: 180, south: -10, north: 10 },
          limit: 100,
        });
        expect(edge.map((city) => city.id)).toEqual(['seam-0', 'seam-2', 'seam-3']);
      },
    );
  });

  it('accepts full-precision browser bounds and echoes their unchanged WGS84 values', async () => {
    const { viewer, worldId } = await fixture();
    const browserBounds = {
      west: 26.61120012494348,
      east: 41.3887998750572,
      south: 25.43477330511665,
      north: 35.1251305927309,
    };
    const payload = await new WorldMapService(new PrismaWorldMapRepository(viewer, db)).getViewport(
      { worldId, bounds: browserBounds },
      { playerId: viewer.id },
    );
    expect(payload.bounds).toEqual(browserBounds);
    expect(payload.layers.cities.features.map((feature) => feature.id)).toEqual([
      'cairo',
      'visible-city',
    ]);
  });
});

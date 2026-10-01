import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import type { Army, AreaGeometry, City } from '@mamluk/world-map-core';
import { WorldMapService } from '@mamluk/world-map-core/server';
import { createWorld, executeCommand } from '../kingdoms/engine';
import { commandKingdomWorld } from '../kingdoms/repository';
import type { KingdomsWorld } from '../kingdoms/types';
import {
  PrismaWorldMapRepository,
  listMamlukMapWorlds,
  getOwnVillageMapLocations,
} from './repository';
import { storeMapRecord, type MamlukMapState } from './storage';
import { MamlukViewportService } from './viewport-service';

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
const withoutGeography = (state: KingdomsWorld) =>
  Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'geography')) as KingdomsWorld;
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

  it('provisions public actual villages once while keeping private enemy intelligence hidden', async () => {
    const { viewer, outsider, worldId, state } = await fixture();
    const original = withoutGeography(state);
    const legacy = executeCommand(
      original,
      outsider.id,
      { type: 'found', name: 'خصم بعيد' },
      original.updatedAt,
    );
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(JSON.stringify(legacy)) as Prisma.InputJsonValue,
      },
    });
    const own = Object.values(legacy.villages).find((village) => village.ownerId === viewer.id)!;
    const enemy = Object.values(legacy.villages).find(
      (village) => village.ownerId === outsider.id,
    )!;
    const service = new MamlukViewportService(new PrismaWorldMapRepository(viewer, db));
    const read = () =>
      service.getViewport(
        { worldId, bounds: { west: 28, south: 29, east: 35, north: 33 } },
        { playerId: viewer.id },
      );
    const [first, second] = await Promise.all([read(), read()]);
    for (const payload of [first, second]) {
      expect(payload.revision).toBe('8');
      expect(payload.layers.cities.features.map((feature) => feature.id)).toEqual(
        [own.id, enemy.id].sort(),
      );
      expect(payload.layers.territories.features.map((feature) => feature.id)).toEqual(
        [own.id, enemy.id].sort(),
      );
      expect(
        payload.layers.cities.features.find((feature) => feature.id === enemy.id)!.properties,
      ).toMatchObject({ ownerPlayerId: outsider.id, fortificationLevel: 0 });
      expect(payload.layers.cities.features[0]!.geometry.coordinates).toEqual([31.24967, 30.06263]);
      expect(payload.layers.armies.features).toEqual([]);
      expect(payload.layers.visibility.features).toHaveLength(1);
      expect(JSON.stringify(payload)).toContain(enemy.name);
      expect(JSON.stringify(payload)).not.toContain('public-village-viewport');
      expect(JSON.stringify(payload)).not.toContain('resources');
      expect(JSON.stringify(payload)).not.toContain('troops');
    }
    expect((await read()).revision).toBe('8');
    expect(await getOwnVillageMapLocations(worldId, viewer, db)).toEqual([
      { villageId: own.id, name: own.name, longitude: 31.24967, latitude: 30.06263 },
    ]);
    const persisted = (await db.kingdomWorld.findUniqueOrThrow({ where: { id: worldId } }))
      .state as unknown as typeof legacy & { geography: MamlukMapState };
    const { geography: savedGeography, ...unchanged } = persisted;
    expect(unchanged).toEqual(legacy);
    const enemyPoint = savedGeography.cities.find((record) => record.value.id === enemy.id)!.value;
    const secretArmy: Army = {
      id: 'secret-colocated-army',
      worldId,
      ownerPlayerId: outsider.id,
      ownerSultanateId: null,
      position: {
        armyId: 'secret-colocated-army',
        longitude: enemyPoint.longitude,
        latitude: enemyPoint.latitude,
        origin: null,
        destination: null,
        departureTime: null,
        arrivalTime: null,
        status: 'stationed',
      },
      route: null,
    };
    const privateGeography = {
      ...savedGeography,
      armies: [storeMapRecord(secretArmy)],
      sieges: [
        storeMapRecord({
          id: 'secret-colocated-siege',
          worldId,
          targetId: enemy.id,
          targetKind: 'city' as const,
          status: 'active' as const,
          attackerPlayerId: outsider.id,
          defenderPlayerId: viewer.id,
          longitude: enemyPoint.longitude,
          latitude: enemyPoint.latitude,
        }),
      ],
    };
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(
          JSON.stringify({ ...persisted, geography: privateGeography }),
        ) as Prisma.InputJsonValue,
      },
    });
    const publicWithPrivate = await read();
    expect(publicWithPrivate.layers.cities.features.map((feature) => feature.id)).toContain(
      enemy.id,
    );
    expect(publicWithPrivate.layers.territories.features.map((feature) => feature.id)).toContain(
      enemy.id,
    );
    expect(publicWithPrivate.layers.armies.features).toEqual([]);
    expect(publicWithPrivate.layers.armyRoutes.features).toEqual([]);
    expect(publicWithPrivate.layers.sieges.features).toEqual([]);
    expect(publicWithPrivate.layers.visibility).toEqual(first.layers.visibility);
    expect(publicWithPrivate.layers.fog).toEqual(first.layers.fog);
    expect(JSON.stringify(publicWithPrivate)).not.toContain('secret-colocated');
    // Simulate the deployed old managed layout: points exist but plots are missing.
    const oldLayout = {
      ...savedGeography,
      territories: [],
      villagePlotsVersion: undefined,
      omittedVillagePlotIds: undefined,
    };
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(
          JSON.stringify({ ...persisted, geography: oldLayout }),
        ) as Prisma.InputJsonValue,
      },
    });
    const upgraded = await read();
    expect(upgraded.revision).toBe('9');
    expect(upgraded.layers.territories.features).toHaveLength(2);
    expect((await read()).revision).toBe('9');
    const upgradedState = (await db.kingdomWorld.findUniqueOrThrow({ where: { id: worldId } }))
      .state as unknown as typeof persisted;
    expect(withoutGeography(upgradedState)).toEqual(legacy);
    expect(upgradedState.geography.cities).toEqual(savedGeography.cities);
    // Current names and owners must win over the original stored city copy.
    const changed = {
      ...persisted,
      villages: {
        ...persisted.villages,
        [own.id]: { ...own, ownerId: outsider.id, name: 'قرية انتقلت ملكيتها' },
      },
    };
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(JSON.stringify(changed)) as Prisma.InputJsonValue,
      },
    });
    expect(
      (await read()).layers.cities.features.find((feature) => feature.id === own.id)!.properties,
    ).toMatchObject({ name: changed.villages[own.id]!.name, ownerPlayerId: outsider.id });
    expect(
      (await read()).layers.territories.features.find((feature) => feature.id === own.id)!
        .properties,
    ).toMatchObject({ ownerPlayerId: outsider.id });
    expect(await getOwnVillageMapLocations(worldId, viewer, db)).toEqual([]);
    expect(await getOwnVillageMapLocations(worldId, outsider, db)).toContainEqual({
      villageId: own.id,
      name: 'قرية انتقلت ملكيتها',
      longitude: 31.24967,
      latitude: 30.06263,
    });
    expect(savedGeography.cities[0]!.value.ownerPlayerId).toBe(viewer.id);
    const remainingVillages = Object.fromEntries(
      Object.entries(changed.villages).filter(([id]) => id !== own.id),
    );
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(
          JSON.stringify({ ...changed, villages: remainingVillages }),
        ) as Prisma.InputJsonValue,
      },
    });
    expect(await getOwnVillageMapLocations(worldId, outsider, db)).toHaveLength(1);
    expect((await read()).layers.cities.features.map((feature) => feature.id)).toEqual([enemy.id]);
    expect((await read()).layers.territories.features.map((feature) => feature.id)).toEqual([
      enemy.id,
    ]);
  });

  it('allocates newly founded actual villages inside the existing authoritative game transaction', async () => {
    const { viewer, outsider, worldId, state } = await fixture();
    const legacy = withoutGeography(state);
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(JSON.stringify(legacy)) as Prisma.InputJsonValue,
      },
    });
    const result = await commandKingdomWorld(
      worldId,
      outsider,
      randomUUID(),
      {
        type: 'found',
        name: 'مملكة جديدة',
      },
      db,
    );
    const locations = await getOwnVillageMapLocations(worldId, outsider, db);
    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({
      name: 'عاصمة مملكة جديدة',
      longitude: 29.91582,
      latitude: 31.20176,
    });
    expect(await getOwnVillageMapLocations(worldId, viewer, db)).toHaveLength(1);
    const snapshot = await new PrismaWorldMapRepository(outsider, db).withSnapshot(
      worldId,
      { playerId: outsider.id },
      async (session) => session.snapshot,
    );
    // Focus reads must not provision a second time after the game mutation.
    expect(snapshot.revision).toBe(String(result.revision));
  });

  it('never provisions legacy worlds for outsiders or revoked sessions', async () => {
    const { viewer, outsider, worldId, state } = await fixture();
    const legacy = withoutGeography(state);
    await db.kingdomWorld.update({
      where: { id: worldId },
      data: {
        state: JSON.parse(JSON.stringify(legacy)) as Prisma.InputJsonValue,
      },
    });
    await expect(getOwnVillageMapLocations(worldId, outsider, db)).rejects.toMatchObject({
      status: 404,
    });
    await db.user.update({ where: { id: viewer.id }, data: { tokenVersion: 1 } });
    await expect(getOwnVillageMapLocations(worldId, viewer, db)).rejects.toMatchObject({
      status: 401,
    });
    const row = await db.kingdomWorld.findUniqueOrThrow({ where: { id: worldId } });
    expect(row.state).toEqual(legacy);
    expect(row.revision).toBe(7);
  });
});

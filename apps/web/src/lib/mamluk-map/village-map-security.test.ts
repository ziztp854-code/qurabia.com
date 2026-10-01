import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import { createWorld, executeCommand, projectWorld } from '../kingdoms/engine';
import { provisionVillageGeography } from './village-geography';
import { ensureVillageGeography } from './village-persistence';
import { buildVillageTerritories } from './village-territories';
import { storeMapRecord } from './storage';
import {
  boundsGeometry,
  MapQueryError,
  pointInArea,
  validateArea,
  WorldMapService,
  type Army,
  type City,
  type Territory,
  type VisibilitySnapshot,
  type WorldMapRepository,
} from '@mamluk/world-map-core/server';
import type { PublicVillageReadSession } from './repository';
import { MamlukViewportService } from './viewport-service';

const now = 1_800_000_000_000;

function settlementSession() {
  const bounds = { west: 30, south: 29, east: 35, north: 33 };
  const city: City = {
    id: 'public-village',
    worldId: 'security-world',
    name: 'قرية عامة',
    longitude: 34,
    latitude: 32,
    regionId: 'egypt',
    ownerPlayerId: 'bob',
    ownerSultanateId: null,
    fortificationLevel: 0,
    strategicValue: 0,
  };
  const territory: Territory = {
    id: city.id,
    worldId: city.worldId,
    regionId: city.regionId,
    ownerPlayerId: 'bob',
    ownerSultanateId: null,
    geometry: boundsGeometry({ west: 33.99, south: 31.99, east: 34.01, north: 32.01 }),
  };
  const grants: VisibilitySnapshot = {
    regions: [],
    visibleTerritoryIds: [],
    visibleSultanateTerritoryIds: [],
  };
  const session: PublicVillageReadSession = {
    settlementsPublic: true,
    snapshot: {
      worldId: city.worldId,
      viewerPlayerId: 'alice',
      revision: '7',
      serverTime: now,
      validUntil: now + 15000,
    },
    getCitiesInBounds: async () => [],
    getTerritoriesInBounds: async () => [],
    getCastlesInBounds: async () => [],
    getSultanateTerritoriesInBounds: async () => [],
    getSiegesInBounds: async () => [],
    getVisibleArmiesInBounds: async () => [],
    getVisibilityInBounds: async () => grants,
    getPublicVillageCitiesInBounds: async () => [city],
    getPublicVillageTerritoriesInBounds: async () => [territory],
  };
  const repository: WorldMapRepository = {
    withSnapshot: async (_world, _viewer, read) => read(session),
  };
  return {
    session,
    repository,
    city,
    territory,
    grants,
    request: { worldId: city.worldId, bounds },
    viewer: { playerId: 'alice' },
  };
}

function populatedWorld() {
  const own = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'القاهرة' }, now);
  return executeCommand(own, 'bob', { type: 'found', name: 'قرية الخصم' }, now);
}

describe('public settlement and private intelligence isolation', () => {
  it('does not reveal a colocated enemy army, route, siege or extra resource fields', async () => {
    const fixture = settlementSession();
    const origin = { longitude: 34, latitude: 32 };
    const destination = { longitude: 34.5, latitude: 32.5 };
    const route = {
      origin,
      destination,
      waypoints: [],
      distance: 12345,
      departureTime: now - 1000,
      arrivalTime: now + 10000,
    };
    const army: Army = {
      id: 'classified-moving-army',
      worldId: fixture.city.worldId,
      ownerPlayerId: 'bob',
      ownerSultanateId: null,
      route,
      position: { armyId: 'classified-moving-army', ...origin, ...route, status: 'moving' },
    };
    fixture.session.getVisibleArmiesInBounds = async () => [army];
    fixture.session.getSiegesInBounds = async () => [
      {
        id: 'classified-siege',
        worldId: fixture.city.worldId,
        targetId: fixture.city.id,
        targetKind: 'city',
        status: 'active',
        attackerPlayerId: 'bob',
        defenderPlayerId: 'enemy',
        ...origin,
      },
    ];
    fixture.session.getPublicVillageCitiesInBounds = async () => [
      {
        ...fixture.city,
        confidentialResources: 'resource-secret',
        confidentialTroops: 'troop-secret',
      },
    ];
    const before = structuredClone(fixture.grants);
    const privatePayload = await new WorldMapService(fixture.repository).getViewport(
      fixture.request,
      fixture.viewer,
    );
    const payload = await new MamlukViewportService(fixture.repository).getViewport(
      fixture.request,
      fixture.viewer,
    );

    expect(payload.layers.cities.features.map(({ id }) => id)).toEqual([fixture.city.id]);
    expect(payload.layers.territories.features.map(({ id }) => id)).toEqual([fixture.city.id]);
    expect(payload.layers.armies.features).toEqual([]);
    expect(payload.layers.armyRoutes.features).toEqual([]);
    expect(payload.layers.sieges.features).toEqual([]);
    expect(payload.layers.visibility).toEqual(privatePayload.layers.visibility);
    expect(payload.layers.fog).toEqual(privatePayload.layers.fog);
    expect(fixture.grants).toEqual(before);
    for (const secret of [
      'classified-moving-army',
      'classified-siege',
      'resource-secret',
      'troop-secret',
    ]) {
      expect(JSON.stringify(payload)).not.toContain(secret);
    }
  });

  it('preserves authorized private movement and the original intelligence expiry', async () => {
    const fixture = settlementSession();
    const origin = { longitude: 31, latitude: 30 };
    const destination = { longitude: 31.5, latitude: 30.5 };
    const route = {
      origin,
      destination,
      waypoints: [],
      distance: 12345,
      departureTime: now - 1000,
      arrivalTime: now + 10000,
    };
    fixture.session.getVisibleArmiesInBounds = async () => [
      {
        id: 'own-moving-army',
        worldId: fixture.city.worldId,
        ownerPlayerId: 'alice',
        ownerSultanateId: null,
        route,
        position: { armyId: 'own-moving-army', ...origin, ...route, status: 'moving' },
      },
    ];
    fixture.session.getVisibilityInBounds = async () => ({
      ...fixture.grants,
      regions: [
        {
          id: 'short-lived-scout',
          worldId: fixture.city.worldId,
          recipientPlayerId: 'alice',
          kind: 'scouting',
          startsAt: now - 100,
          expiresAt: now + 1200,
          geometry: boundsGeometry({ west: 30.9, south: 29.9, east: 31.1, north: 30.1 }),
        },
      ],
    });
    const privatePayload = await new WorldMapService(fixture.repository).getViewport(
      fixture.request,
      fixture.viewer,
    );
    const payload = await new MamlukViewportService(fixture.repository).getViewport(
      fixture.request,
      fixture.viewer,
    );

    expect(payload.expiresAt).toBe(now + 1200);
    for (const layer of ['armies', 'armyRoutes', 'sieges', 'visibility', 'fog'] as const) {
      expect(payload.layers[layer]).toEqual(privatePayload.layers[layer]);
    }
    expect(payload.layers.armyRoutes.features).toHaveLength(1);
  });

  it('rejects the combined vertex count even when each batch independently fits', async () => {
    const fixture = settlementSession();
    await expect(
      new MamlukViewportService(fixture.repository, { maxVertices: 10 }).getViewport(
        fixture.request,
        fixture.viewer,
      ),
    ).rejects.toBeInstanceOf(MapQueryError);
    await expect(
      new WorldMapService(fixture.repository, { maxVertices: 10 }).getViewport(
        fixture.request,
        fixture.viewer,
      ),
    ).resolves.toHaveProperty('worldId', fixture.city.worldId);
  });

  it('rejects combined UTF-8 bytes that exceed the private response budget', async () => {
    const fixture = settlementSession();
    const privatePayload = await new WorldMapService(fixture.repository).getViewport(
      fixture.request,
      fixture.viewer,
    );
    const maxPayloadBytes = new TextEncoder().encode(JSON.stringify(privatePayload)).byteLength + 1;

    await expect(
      new MamlukViewportService(fixture.repository, { maxPayloadBytes }).getViewport(
        fixture.request,
        fixture.viewer,
      ),
    ).rejects.toBeInstanceOf(MapQueryError);
    await expect(
      new WorldMapService(fixture.repository, { maxPayloadBytes }).getViewport(
        fixture.request,
        fixture.viewer,
      ),
    ).resolves.toHaveProperty('worldId', fixture.city.worldId);
  });

  it('rejects an oversized public candidate batch before filtering distant villages', async () => {
    const fixture = settlementSession();
    fixture.session.getPublicVillageCitiesInBounds = async () =>
      Array.from({ length: 3 }, (_, index) => ({
        ...fixture.city,
        id: `candidate-${index}`,
        longitude: 40,
      }));

    await expect(
      new MamlukViewportService(fixture.repository, { maxEntities: 2 }).getViewport(
        fixture.request,
        fixture.viewer,
      ),
    ).rejects.toBeInstanceOf(MapQueryError);
  });
});

function provisioningDatabase(
  row: unknown,
  account: { status: string; tokenVersion: number } | null,
  allowWrite = false,
) {
  const transaction = {
    user: { findUnique: vi.fn(async () => account) },
    $queryRaw: vi.fn(async (query: Prisma.Sql) => {
      if (/^\s*UPDATE\s+"KingdomWorld"/.test(query.sql)) {
        if (!allowWrite) throw new Error('Unauthorized provisioning attempted a database write');
        return [];
      }
      return row ? [row] : [];
    }),
  };
  return {
    $transaction: async <T>(read: (tx: typeof transaction) => Promise<T>) => read(transaction),
  } as unknown as DatabaseClient;
}

describe('legacy player projection geographic privacy', () => {
  it('never includes the server geography extension in a legacy player response', () => {
    const state = {
      ...populatedWorld(),
      geography: {
        version: 1,
        cities: [{ hiddenGeographicCoordinates: [44.4, 33.3] }],
        armies: [{ classifiedArmy: 'enemy-geographic-secret' }],
        visibility: [{ secretRecipient: 'enemy-vision-secret' }],
        villagePlotsVersion: 1,
        omittedVillagePlotIds: ['internal-omitted-plot'],
      },
    };
    const view = projectWorld(state, 'alice', now);
    const payload = JSON.stringify(view);

    expect(view).not.toHaveProperty('geography');
    expect(payload).not.toContain('hiddenGeographicCoordinates');
    expect(payload).not.toContain('enemy-geographic-secret');
    expect(payload).not.toContain('enemy-vision-secret');
    expect(payload).not.toContain('internal-omitted-plot');
    expect(payload).not.toContain('villagePlotsVersion');
  });

  it('allowlists enemy village metadata without troops, resources or geographic fields', () => {
    const state = populatedWorld();
    const enemy = Object.values(state.villages).find((village) => village.ownerId === 'bob')!;
    const extended = {
      ...state,
      villages: {
        ...state.villages,
        [enemy.id]: {
          ...enemy,
          longitude: 44.4,
          latitude: 33.3,
          confidentialResources: 'enemy-resource-secret',
          confidentialTroops: 'enemy-troop-secret',
        },
      },
    };
    const view = projectWorld(extended, 'alice', now);
    const mapEnemy = view.map.find((village) => village.id === enemy.id)!;

    expect(view.villages.every((village) => village.ownerId === 'alice')).toBe(true);
    expect(mapEnemy).not.toHaveProperty('longitude');
    expect(mapEnemy).not.toHaveProperty('latitude');
    expect(mapEnemy).not.toHaveProperty('resources');
    expect(mapEnemy).not.toHaveProperty('troops');
    expect(JSON.stringify(view)).not.toContain('enemy-resource-secret');
    expect(JSON.stringify(view)).not.toContain('enemy-troop-secret');
  });
});

describe('village provisioning authorization boundary', () => {
  const identity = { id: 'alice', tokenVersion: 0 };
  const row = {
    id: 'security-world',
    revision: 7,
    geography: null,
    villages: { v1: { id: 'v1', name: 'القاهرة', ownerId: 'alice', buildings: { wall: 0 } } },
  };

  it('denies a revoked account before writing geographic metadata', async () => {
    const db = provisioningDatabase(row, { status: 'ACTIVE', tokenVersion: 1 });

    await expect(ensureVillageGeography('security-world', identity, db)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('denies an authenticated nonmember before writing geographic metadata', async () => {
    const db = provisioningDatabase(null, { status: 'ACTIVE', tokenVersion: 0 });

    await expect(ensureVillageGeography('security-world', identity, db)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('reports a conflicting world revision rather than returning false success', async () => {
    const db = provisioningDatabase(row, { status: 'ACTIVE', tokenVersion: 0 }, true);

    await expect(ensureVillageGeography('security-world', identity, db)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('persisted village border safety', () => {
  function plotsFor(points: readonly (readonly [number, number])[]) {
    const cities = points.map(([longitude, latitude], index) =>
      storeMapRecord({
        id: `plot-${index}`,
        worldId: 'security-world',
        name: `قرية ${index}`,
        longitude,
        latitude,
        regionId: 'egypt',
        ownerPlayerId: 'alice',
        ownerSultanateId: null,
        fortificationLevel: 0,
        strategicValue: 0,
      }),
    );
    const villages = Object.fromEntries(
      cities.map(({ value }) => [
        value.id,
        {
          id: value.id,
          name: value.name,
          ownerId: 'bob',
          buildings: { wall: 0 },
        },
      ]),
    );
    return { cities, villages };
  }

  it('keeps metre-scale adjacent village plots valid and disjoint without moving centres', () => {
    const fixture = plotsFor([
      [31, 30],
      [31.000001, 30],
      [31, 30.000001],
      [31.000001, 30.000001],
    ]);
    const before = structuredClone(fixture);
    const plots = buildVillageTerritories('security-world', fixture.cities, fixture.villages);

    expect(plots).toHaveLength(4);
    for (const plot of plots) {
      expect(() => validateArea(plot.value.geometry)).not.toThrow();
      const centre = fixture.cities.find(({ value }) => value.id === plot.value.id)!.value;
      expect(pointInArea(centre, plot.value.geometry)).toBe(true);
      expect(plot.value.ownerPlayerId).toBe('bob');
      for (const other of plots) {
        if (other.value.id === plot.value.id) continue;
        const overlapsInterior =
          Math.min(plot.east, other.east) > Math.max(plot.west, other.west) &&
          Math.min(plot.north, other.north) > Math.max(plot.south, other.south);
        expect(overlapsInterior).toBe(false);
      }
    }
    expect(fixture).toEqual(before);
  });

  it('omits an invalid microscopic plot while retaining every city and the surrounding valid plots', () => {
    const points = Array.from(
      { length: 9 },
      (_, index) => [31 + Math.floor(index / 3) * 0.000001, 30 + (index % 3) * 0.000001] as const,
    );
    const fixture = plotsFor(points);
    const before = structuredClone(fixture);
    const plots = buildVillageTerritories('security-world', fixture.cities, fixture.villages);

    expect(plots).toHaveLength(8);
    expect(plots.some(({ value }) => value.id === 'plot-4')).toBe(false);
    expect(fixture.cities).toHaveLength(9);
    expect(fixture).toEqual(before);
  });

  it('handles a long tied-longitude column without recursive degeneration', () => {
    const points = Array.from({ length: 512 }, (_, index) => [31, 30 + index * 0.00002] as const);
    const fixture = plotsFor([...points, [31.5, 30.5]]);
    const plots = buildVillageTerritories('security-world', fixture.cities, fixture.villages);

    expect(plots).toHaveLength(513);
    expect(new Set(plots.map(({ value }) => value.id)).size).toBe(513);
    for (const plot of plots) expect(() => validateArea(plot.value.geometry)).not.toThrow();
  });
});

describe('geographic village provisioning security', () => {
  it('stores only geographic presentation fields and keeps the entire legacy state intact', () => {
    const original = populatedWorld();
    const before = structuredClone(original);
    const provisioned = provisionVillageGeography('security-world', original);
    const { geography, ...legacy } = provisioned;

    expect(legacy).toEqual(before);
    expect(original).toEqual(before);
    expect(original).not.toHaveProperty('geography');
    expect(geography?.cities).toHaveLength(2);
    for (const record of geography!.cities) {
      expect(Object.keys(record.value).sort()).toEqual([
        'fortificationLevel',
        'id',
        'latitude',
        'longitude',
        'name',
        'ownerPlayerId',
        'ownerSultanateId',
        'regionId',
        'strategicValue',
        'worldId',
      ]);
      expect(record.value.longitude).toBeGreaterThanOrEqual(-180);
      expect(record.value.longitude).toBeLessThanOrEqual(180);
      expect(record.value.latitude).toBeGreaterThanOrEqual(-90);
      expect(record.value.latitude).toBeLessThanOrEqual(90);
    }
    expect(geography!.armies).toEqual([]);
    expect(geography!.visibility).toEqual([]);
  });

  it('does not relocate persisted villages after ownership or legacy grid changes', () => {
    const original = provisionVillageGeography('security-world', populatedWorld());
    const before = structuredClone(original);
    const changed = {
      ...original,
      villages: Object.fromEntries(
        Object.entries(original.villages).map(([id, village]) => [
          id,
          { ...village, x: 900, y: -900, ownerId: 'bob', name: 'اسم جديد' },
        ]),
      ),
    };
    const provisioned = provisionVillageGeography('security-world', changed);

    expect(provisioned).toBe(changed);
    expect(provisioned.geography!.cities).toEqual(before.geography!.cities);
    expect(original).toEqual(before);
  });

  it('preserves explicit campaign geography without replacing or enriching its records', () => {
    const state = {
      ...populatedWorld(),
      geography: { version: 1, source: 'explicit-campaign', confidentialExtension: 'keep-me' },
    };
    const before = structuredClone(state);

    expect(provisionVillageGeography('security-world', state)).toBe(state);
    expect(state).toEqual(before);
  });

  it('allocates geographic coordinates independently from the historical grid', () => {
    const state = populatedWorld();
    const shifted = {
      ...state,
      villages: Object.fromEntries(
        Object.entries(state.villages).map(([id, village]) => [
          id,
          { ...village, x: 900, y: -900 },
        ]),
      ),
    };

    expect(provisionVillageGeography('security-world', shifted).geography).toEqual(
      provisionVillageGeography('security-world', state).geography,
    );
  });

  it('appends new village locations without reordering or moving existing locations', () => {
    const initial = provisionVillageGeography('security-world', populatedWorld());
    const before = structuredClone(initial);
    const village = Object.values(initial.villages)[0]!;
    const newVillages = Object.fromEntries(
      Array.from({ length: 15 }, (_, index) => {
        const id = `a-new-village-${index}`;
        return [id, { ...village, id }];
      }),
    );
    const grown = provisionVillageGeography('security-world', {
      ...initial,
      villages: { ...initial.villages, ...newVillages },
    });

    expect(grown.geography!.cities).toHaveLength(17);
    expect(grown.geography!.cities.slice(0, 2)).toEqual(before.geography!.cities);
    const locations = grown.geography!.cities.map(
      ({ value }) => `${value.longitude},${value.latitude}`,
    );
    expect(new Set(locations).size).toBe(17);
    expect(initial).toEqual(before);
  });
});

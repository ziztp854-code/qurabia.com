import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import type { WorldMapReadSession } from '@mamluk/world-map-core/server';
import {
  PrismaWorldMapRepository,
  listMamlukMapWorlds,
  getOwnVillageMapLocations,
} from './repository';

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => {
    throw new Error('Explicit test database required');
  },
}));

const identity = { id: 'viewer', tokenVersion: 2 };
const query = { bounds: { west: 30, south: 29, east: 34, north: 33 }, limit: 100 };
const shape = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [30, 29],
      [34, 29],
      [34, 33],
      [30, 33],
      [30, 29],
    ],
  ] as const,
};
const mapCity = {
  id: 'city',
  worldId: 'world',
  name: 'القاهرة',
  regionId: 'egypt',
  longitude: 31,
  latitude: 30,
  ownerPlayerId: 'viewer',
  ownerSultanateId: null,
  fortificationLevel: 3,
  strategicValue: 50,
};
const mapGrant = {
  region: {
    id: 'grant',
    worldId: 'world',
    recipientPlayerId: 'viewer',
    kind: 'alliance',
    geometry: shape,
    startsAt: 1000,
    expiresAt: 8000,
  },
  visibleTerritoryIds: ['territory'],
  visibleSultanateTerritoryIds: ['border'],
};

function database(
  options: {
    status?: string;
    tokenVersion?: number;
    world?: boolean;
    ownLocations?: unknown[];
    records?: Record<string, unknown[] | undefined>;
  } = {},
) {
  const calls: Prisma.Sql[] = [];
  const tx = {
    user: {
      findUnique: vi.fn(async () => ({
        status: options.status ?? 'ACTIVE',
        tokenVersion: options.tokenVersion ?? 2,
      })),
    },
    $queryRaw: vi.fn(async (sql: Prisma.Sql) => {
      calls.push(sql);
      if (sql.text.includes('AS "serverTime"'))
        return options.world === false
          ? []
          : [
              {
                id: sql.values.find(
                  (value) => typeof value === 'string' && value.startsWith('world'),
                ),
                revision: 42,
                geographyVersion: '1',
                geographySource: options.ownLocations ? 'kingdom-villages-v1' : undefined,
                serverTime: new Date(2000),
              },
            ];
      if (sql.text.includes('SELECT w.id, w.name')) return [{ id: 'world', name: 'Campaign' }];
      if (sql.text.includes('AS "villageId"')) return options.ownLocations ?? [];
      const collection = sql.values.find(
        (value) =>
          typeof value === 'string' &&
          [
            'visibility',
            'cities',
            'castles',
            'territories',
            'sultanateTerritories',
            'armies',
            'sieges',
          ].includes(value),
      );
      return (options.records?.[collection as string] ?? []).map((value) => ({ value }));
    }),
  };
  const transaction = vi.fn(async (read: (client: typeof tx) => Promise<unknown>) => read(tx));
  return { db: { $transaction: transaction } as unknown as DatabaseClient, tx, calls, transaction };
}

describe('Prisma geographic map repository authorization', () => {
  it('binds a map read to the authenticated member and one repeatable database snapshot', async () => {
    const test = database();
    const snapshot = await new PrismaWorldMapRepository(identity, test.db).withSnapshot(
      'world',
      { playerId: identity.id },
      async (session) => session.snapshot,
    );
    expect(snapshot).toEqual({
      worldId: 'world',
      viewerPlayerId: 'viewer',
      revision: '42',
      serverTime: 2000,
      validUntil: 17000,
    });
    expect(test.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'RepeatableRead' }),
    );
    expect(test.calls[0]!.text).not.toMatch(/SELECT\s+(?:\*|w\.state)/i);
    expect(test.calls[0]!.values).toContain('viewer');
    expect(test.calls[0]!.text).toContain("w.state->>'version' = '1'");
    expect(test.calls[0]!.text).toContain("NOT (w.state ? 'geography') OR");
  });

  it.each([{ status: 'BANNED' }, { tokenVersion: 3 }])(
    'rejects suspended or revoked sessions before reading geographic state',
    async (options) => {
      const test = database(options);
      await expect(
        new PrismaWorldMapRepository(identity, test.db).withSnapshot(
          'world',
          { playerId: 'viewer' },
          async () => null,
        ),
      ).rejects.toMatchObject({ status: 401 });
      expect(test.calls).toHaveLength(0);
    },
  );

  it('rejects caller-selected player identities and worlds without membership', async () => {
    const test = database();
    await expect(
      new PrismaWorldMapRepository(identity, test.db).withSnapshot(
        'world',
        { playerId: 'enemy' },
        async () => null,
      ),
    ).rejects.toThrow();
    expect(test.transaction).not.toHaveBeenCalled();
    const inaccessible = database({ world: false });
    await expect(
      new PrismaWorldMapRepository(identity, inaccessible.db).withSnapshot(
        'world',
        { playerId: 'viewer' },
        async () => null,
      ),
    ).rejects.toThrow();
  });

  it('runs bounded parameterized database queries instead of loading the world state', async () => {
    const test = database();
    await new PrismaWorldMapRepository(identity, test.db).withSnapshot(
      "world'",
      { playerId: 'viewer' },
      async (session) => {
        await session.getVisibilityInBounds({ ...query, limit: 129 });
        await session.getCitiesInBounds(query);
        await session.getCastlesInBounds(query);
        await session.getTerritoriesInBounds(query);
        await session.getSultanateTerritoriesInBounds(query);
        await session.getVisibleArmiesInBounds(query);
        await session.getSiegesInBounds(query);
      },
    );
    expect(test.calls.slice(1)).toHaveLength(7);
    for (const sql of test.calls.slice(1)) {
      expect(sql.text).toContain('jsonb_array_elements');
      expect(sql.text).toContain('LIMIT');
      expect(sql.values).toContain(
        sql.values.includes('visibility') &&
          !sql.values.includes('cities') &&
          !sql.values.includes('castles') &&
          !sql.values.includes('armies') &&
          !sql.values.includes('sieges')
          ? 129
          : 100,
      );
      expect(sql.values).toContain(29);
      expect(sql.text).not.toContain("world'");
      expect(sql.text).not.toMatch(/SELECT\s+(?:\*|w\.state)/i);
    }
  });

  it('lists only geographic campaign metadata for the current member', async () => {
    const test = database();
    await expect(listMamlukMapWorlds(identity, test.db)).resolves.toEqual([
      { id: 'world', name: 'Campaign' },
    ]);
    expect(test.calls[0]!.text).toContain('LIMIT 50');
    expect(test.calls[0]!.values).toContain('viewer');
    expect(test.calls[0]!.text).not.toContain("geography'->>'version' = '1'");
  });

  it('returns only bounded owned village locations for authorized map focus', async () => {
    const test = database({
      ownLocations: [
        {
          villageId: 'v1',
          name: 'عاصمة الحاكم',
          longitude: 31.24967,
          latitude: 30.06263,
        },
      ],
    });
    await expect(getOwnVillageMapLocations('world', identity, test.db)).resolves.toEqual([
      { villageId: 'v1', name: 'عاصمة الحاكم', longitude: 31.24967, latitude: 30.06263 },
    ]);
    const sql = test.calls.at(-1)!;
    expect(sql.values).toContain('viewer');
    expect(sql.text).toContain('LIMIT 100');
    expect(sql.text).not.toMatch(/SELECT\s+(?:\*|w\.state)/i);
  });

  it('rejects invalid bounds and limits and closes the session at the transaction boundary', async () => {
    const test = database();
    let saved: WorldMapReadSession | undefined;
    await new PrismaWorldMapRepository(identity, test.db).withSnapshot(
      'world',
      { playerId: 'viewer' },
      async (session) => {
        saved = session;
        await expect(session.getCitiesInBounds({ ...query, limit: 0 })).rejects.toThrow();
        await expect(session.getCitiesInBounds({ ...query, limit: 10002 })).rejects.toThrow();
        await expect(
          session.getCitiesInBounds({ ...query, bounds: { west: 0, east: 0, south: 0, north: 1 } }),
        ).rejects.toThrow();
      },
    );
    await expect(saved!.getCitiesInBounds(query)).rejects.toThrow('ended');
  });

  it('filters enemy army candidates inside grant holes while preserving owned armies', async () => {
    const grant = {
      region: {
        id: 'vision',
        worldId: 'world',
        recipientPlayerId: 'viewer',
        kind: 'watchtower',
        startsAt: 1000,
        expiresAt: 8000,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [30, 29],
              [34, 29],
              [34, 33],
              [30, 33],
              [30, 29],
            ],
            [
              [31, 30],
              [32, 30],
              [32, 31],
              [31, 31],
              [31, 30],
            ],
          ],
        },
      },
      visibleTerritoryIds: [],
      visibleSultanateTerritoryIds: [],
    };
    const army = (id: string, longitude: number, latitude: number, ownerPlayerId: string) => ({
      id,
      worldId: 'world',
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
    const test = database({
      records: {
        visibility: [grant],
        armies: [
          army('visible', 33, 32, 'enemy'),
          army('secret', 31.5, 30.5, 'enemy'),
          army('own', 31.5, 30.5, 'viewer'),
        ],
      },
    });
    const armies = await new PrismaWorldMapRepository(identity, test.db).withSnapshot(
      'world',
      { playerId: 'viewer' },
      (session) => session.getVisibleArmiesInBounds(query),
    );
    expect(armies.map((army) => army.id)).toEqual(['visible', 'own']);
    expect(JSON.stringify(armies)).not.toContain('secret');
  });

  it('rejects grants for another recipient even if a database returns an invalid row', async () => {
    const test = database({
      records: {
        visibility: [
          {
            region: {
              id: 'secret',
              worldId: 'world',
              recipientPlayerId: 'enemy',
              kind: 'alliance',
              startsAt: 1000,
              expiresAt: 8000,
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [30, 29],
                    [34, 29],
                    [34, 33],
                    [30, 33],
                    [30, 29],
                  ],
                ],
              },
            },
            visibleTerritoryIds: [],
            visibleSultanateTerritoryIds: [],
          },
        ],
      },
    });
    await expect(
      new PrismaWorldMapRepository(identity, test.db).withSnapshot(
        'world',
        { playerId: 'viewer' },
        (session) => session.getVisibilityInBounds(query),
      ),
    ).rejects.toThrow('scope');
  });

  it('returns all authorized entity types using allowlisted domain records', async () => {
    const route = {
      origin: { longitude: 31, latitude: 30 },
      destination: { longitude: 32, latitude: 31 },
      waypoints: [],
      distance: 1000,
      departureTime: 1000,
      arrivalTime: 9000,
    };
    const test = database({
      records: {
        visibility: [mapGrant],
        cities: [{ ...mapCity, serverSecret: 'private' }],
        castles: [{ ...mapCity, id: 'castle', cityId: 'city' }],
        territories: [
          {
            id: 'territory',
            worldId: 'world',
            regionId: 'egypt',
            geometry: shape,
            ownerPlayerId: 'enemy',
            ownerSultanateId: 'mamluk',
          },
        ],
        sultanateTerritories: [
          { id: 'border', worldId: 'world', sultanateId: 'mamluk', geometry: shape },
        ],
        armies: [
          {
            id: 'moving',
            worldId: 'world',
            ownerPlayerId: 'viewer',
            ownerSultanateId: null,
            route,
            position: {
              armyId: 'moving',
              longitude: 31.2,
              latitude: 30.2,
              status: 'moving',
              origin: route.origin,
              destination: route.destination,
              departureTime: 1000,
              arrivalTime: 9000,
            },
          },
        ],
        sieges: [
          {
            id: 'siege',
            worldId: 'world',
            targetId: 'city',
            targetKind: 'city',
            status: 'active',
            attackerPlayerId: 'enemy',
            defenderPlayerId: 'viewer',
            longitude: 31,
            latitude: 30,
          },
        ],
      },
    });
    const records = await new PrismaWorldMapRepository(identity, test.db).withSnapshot(
      'world',
      { playerId: 'viewer' },
      async (session) => ({
        grants: await session.getVisibilityInBounds({ ...query, limit: 129 }),
        cities: await session.getCitiesInBounds(query),
        castles: await session.getCastlesInBounds(query),
        territories: await session.getTerritoriesInBounds(query),
        borders: await session.getSultanateTerritoriesInBounds(query),
        armies: await session.getVisibleArmiesInBounds(query),
        sieges: await session.getSiegesInBounds(query),
      }),
    );
    expect(records.cities.map((value) => value.id)).toEqual(['city']);
    expect(records.castles.map((value) => value.id)).toEqual(['castle']);
    expect(records.territories.map((value) => value.id)).toEqual(['territory']);
    expect(records.borders.map((value) => value.id)).toEqual(['border']);
    expect(records.armies[0]!.route).toEqual(route);
    expect(records.sieges.map((value) => value.id)).toEqual(['siege']);
    expect(records.grants.visibleTerritoryIds).toEqual(['territory']);
    expect(JSON.stringify(records)).not.toContain('private');
  });

  it.each([
    { cities: [{ ...mapCity, worldId: 'other-world' }] },
    { visibility: [{ ...mapGrant, visibleTerritoryIds: [42] }] },
    { visibility: [{ ...mapGrant, visibleTerritoryIds: null }] },
    { visibility: [{ ...mapGrant, region: { ...mapGrant.region, kind: 'implicit-alliance' } }] },
    { visibility: [{ ...mapGrant, region: { ...mapGrant.region, startsAt: 3000 } }] },
    { visibility: [{ ...mapGrant, region: { ...mapGrant.region, expiresAt: 1999 } }] },
    {
      sieges: [
        {
          id: 'siege',
          worldId: 'world',
          targetId: 'city',
          targetKind: 'city',
          status: 'invalid',
          attackerPlayerId: 'viewer',
          defenderPlayerId: null,
          longitude: 31,
          latitude: 30,
        },
      ],
    },
  ])('fails closed for malformed persisted geographic state', async (records) => {
    const test = database({ records });
    await expect(
      new PrismaWorldMapRepository(identity, test.db).withSnapshot(
        'world',
        { playerId: 'viewer' },
        async (session) => {
          if ('sieges' in records) return session.getSiegesInBounds(query);
          return session.getCitiesInBounds(query);
        },
      ),
    ).rejects.toThrow();
  });

  it('refuses excessive grants before running point-membership checks', async () => {
    const test = database({
      records: {
        visibility: Array.from({ length: 129 }, (_, index) => ({
          ...mapGrant,
          region: { ...mapGrant.region, id: `grant-${index}` },
        })),
      },
    });
    await expect(
      new PrismaWorldMapRepository(identity, test.db).withSnapshot(
        'world',
        { playerId: 'viewer' },
        (session) => session.getCitiesInBounds(query),
      ),
    ).rejects.toThrow('budget');
  });

  it('keeps persisted visibility areas immutable for the lifetime of the read snapshot', async () => {
    const test = database({ records: { visibility: [mapGrant] } });
    await new PrismaWorldMapRepository(identity, test.db).withSnapshot(
      'world',
      { playerId: 'viewer' },
      async (session) => {
        const grant = (await session.getVisibilityInBounds(query)).regions[0]!;
        expect(() => {
          (grant.geometry.coordinates as unknown as number[][][])[0]![0]![0] = -120;
        }).toThrow();
        expect(grant.geometry.coordinates).toEqual(shape.coordinates);
      },
    );
  });

  it('fails closed when a full candidate page contains hidden armies rather than sending an incomplete page', async () => {
    const army = (id: string, longitude: number, ownerPlayerId: string) => ({
      id,
      worldId: 'world',
      ownerPlayerId,
      ownerSultanateId: null,
      route: null,
      position: {
        armyId: id,
        longitude,
        latitude: 30,
        status: 'stationed',
        origin: null,
        destination: null,
        departureTime: null,
        arrivalTime: null,
      },
    });
    const test = database({
      records: { armies: [army('visible', 31, 'viewer'), army('hidden', 33, 'enemy')] },
    });
    await expect(
      new PrismaWorldMapRepository(identity, test.db).withSnapshot(
        'world',
        { playerId: 'viewer' },
        (session) => session.getVisibleArmiesInBounds({ ...query, limit: 2 }),
      ),
    ).rejects.toThrow('candidate budget');
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Army, City, Territory, WorldMapRepository } from '@mamluk/world-map-core/server';
import { boundsGeometry, MapQueryError, WorldMapService } from '@mamluk/world-map-core/server';
import type { PublicVillageReadSession } from './repository';
import { MamlukViewportService } from './viewport-service';
const bounds = { west: 30, east: 35, south: 29, north: 33 };
const request = { worldId: 'world', bounds };
const viewer = { playerId: 'alice' };
function fixture() {
  const city: City = {
    id: 'public-enemy-village',
    worldId: 'world',
    name: 'Other village',
    longitude: 34,
    latitude: 32,
    regionId: 'egypt',
    ownerPlayerId: 'enemy',
    ownerSultanateId: null,
    fortificationLevel: 0,
    strategicValue: 0,
  };
  const territory: Territory = {
    id: city.id,
    worldId: 'world',
    regionId: 'egypt',
    ownerPlayerId: 'enemy',
    ownerSultanateId: null,
    geometry: boundsGeometry({ west: 33.99, east: 34.01, south: 31.99, north: 32.01 }),
  };
  const army: Army = {
    id: 'secret-army',
    worldId: 'world',
    ownerPlayerId: 'enemy',
    ownerSultanateId: null,
    route: null,
    position: {
      armyId: 'secret-army',
      longitude: 34,
      latitude: 32,
      origin: null,
      destination: null,
      departureTime: null,
      arrivalTime: null,
      status: 'stationed',
    },
  };
  const session: PublicVillageReadSession = {
    settlementsPublic: true,
    snapshot: {
      worldId: 'world',
      viewerPlayerId: 'alice',
      revision: '7',
      serverTime: 1000,
      validUntil: 16000,
    },
    getCitiesInBounds: async () => [city],
    getTerritoriesInBounds: async () => [],
    getCastlesInBounds: async () => [],
    getSultanateTerritoriesInBounds: async () => [],
    getSiegesInBounds: async () => [],
    getVisibleArmiesInBounds: async () => [army],
    getVisibilityInBounds: async () => ({
      regions: [],
      visibleTerritoryIds: [],
      visibleSultanateTerritoryIds: [],
    }),
    getPublicVillageCitiesInBounds: vi.fn(async () => [city]),
    getPublicVillageTerritoriesInBounds: vi.fn(async () => [territory]),
  };
  const read = vi.fn(
    async (
      _world: string,
      _viewer: unknown,
      callback: (session: PublicVillageReadSession) => Promise<unknown>,
    ) => callback(session),
  );
  const repository = { withSnapshot: read } as WorldMapRepository;
  return { session, repository, read };
}
describe('host public settlements with private intelligence', () => {
  it('classifies retained settlement presentation only from the same authorized public snapshot', async () => {
    const { session, repository, read } = fixture();
    const service = new MamlukViewportService(repository);
    const result = await service.getViewportResult(request, viewer);
    expect(result.publicSettlements).toBe(true);
    expect(read).toHaveBeenCalledOnce();
    expect(result.payload.layers.armies.features).toEqual([]);
    expect(result.payload).not.toHaveProperty('publicSettlements');
    const privateSession: PublicVillageReadSession = { ...session, settlementsPublic: false };
    repository.withSnapshot = async (_world, _viewer, callback) => callback(privateSession);
    const privateResult = await service.getViewportResult(request, viewer);
    expect(privateResult.publicSettlements).toBe(false);
    expect(privateResult.payload.layers.cities.features).toEqual([]);
  });
  it('publishes village and plot without widening private fog, grants or army vision in one snapshot', async () => {
    const { session, repository, read } = fixture();
    const privatePayload = await new WorldMapService(repository).getViewport(request, viewer);
    read.mockClear();
    const payload = await new MamlukViewportService(repository).getViewport(request, viewer);
    expect(read).toHaveBeenCalledOnce();
    expect(payload.layers.cities.features.map((f) => f.id)).toEqual(['public-enemy-village']);
    expect(payload.layers.territories.features.map((f) => f.id)).toEqual(['public-enemy-village']);
    expect(payload.layers.armies.features).toEqual([]);
    expect(payload.layers.armyRoutes.features).toEqual([]);
    expect(payload.layers.visibility).toEqual(privatePayload.layers.visibility);
    expect(payload.layers.fog).toEqual(privatePayload.layers.fog);
    expect(payload.revision).toBe('7');
    expect(payload.serverTime).toBe(1000);
    expect(payload.expiresAt).toBe(16000);
    expect(JSON.stringify(payload)).not.toContain('secret-army');
    expect(session.getPublicVillageCitiesInBounds).toHaveBeenCalledWith({ bounds, limit: 2001 });
  });
  it('preserves explicit campaign privacy and never invokes its public methods', async () => {
    const { session, repository } = fixture();
    const privateSession: PublicVillageReadSession = { ...session, settlementsPublic: false };
    repository.withSnapshot = async (_world, _viewer, read) => read(privateSession);
    const payload = await new MamlukViewportService(repository).getViewport(request, viewer);
    expect(payload.layers.cities.features).toEqual([]);
    expect(session.getPublicVillageCitiesInBounds).not.toHaveBeenCalled();
  });
  it('clips public borders and excludes villages outside the requested viewport', async () => {
    const { repository } = fixture();
    const narrow = {
      ...request,
      bounds: { west: 33.995, east: 34.005, south: 31.995, north: 32.005 },
    };
    const payload = await new MamlukViewportService(repository).getViewport(narrow, viewer);
    expect(payload.layers.territories.features[0]!.geometry).toEqual(boundsGeometry(narrow.bounds));
    const elsewhere = await new MamlukViewportService(repository).getViewport(
      { ...request, bounds: { west: 30, east: 31, south: 29, north: 30 } },
      viewer,
    );
    expect(elsewhere.layers.cities.features).toEqual([]);
    expect(elsewhere.layers.territories.features).toEqual([]);
  });
  it('enforces combined public settlements and private entity budget', async () => {
    const { session, repository } = fixture();
    session.getVisibleArmiesInBounds = async () => [
      {
        id: 'own',
        worldId: 'world',
        ownerPlayerId: 'alice',
        ownerSultanateId: null,
        route: null,
        position: {
          armyId: 'own',
          longitude: 31,
          latitude: 30,
          origin: null,
          destination: null,
          departureTime: null,
          arrivalTime: null,
          status: 'stationed',
        },
      },
    ];
    await expect(
      new MamlukViewportService(repository, { maxEntities: 2 }).getViewport(request, viewer),
    ).rejects.toBeInstanceOf(MapQueryError);
  });
  it('captures caller identity and bounds before asynchronous work', async () => {
    const { repository, read } = fixture();
    const mutable = { worldId: 'world', bounds: { ...bounds } };
    const identity = { playerId: 'alice' };
    const pending = new MamlukViewportService(repository).getViewport(mutable, identity);
    mutable.worldId = 'foreign';
    mutable.bounds.west = -180;
    identity.playerId = 'enemy';
    expect((await pending).bounds).toEqual(bounds);
    expect(read.mock.calls[0]![1]).toEqual(viewer);
  });
});

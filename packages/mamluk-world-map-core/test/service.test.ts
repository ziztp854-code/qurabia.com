import { expect, it } from 'vitest';
import { WorldMapService, MapQueryError } from '../src/service';
import type { WorldMapRepository } from '../src/queries';
import { army, batch, city, region, snapshot, bounds, area, repository } from './fixtures';
const request = { worldId: 'world', bounds };
const viewer = { playerId: 'p1' };

it('runs the complete server pipeline without serializing hidden enemy information', async () => {
  const output = await new WorldMapService(repository()).getViewport(request, viewer);
  expect(output.revision).toBe('42');
  expect(output.expiresAt).toBe(8000);
  expect(output.layers.cities.features[0]?.id).toBe('cairo');
  expect(output.layers.armies.features.map((f) => f.id)).toEqual(['own', 'enemy']);
  expect(output.layers.armyRoutes.features.map((f) => f.id)).toEqual(['own']);
  expect(JSON.stringify(output)).not.toContain('secret');
});

it('passes bounding boxes and a bounded sentinel limit to spatial read interfaces', async () => {
  const queries: unknown[] = [];
  const record = async (query: unknown) => {
    queries.push(query);
    return [];
  };
  await new WorldMapService(
    repository({
      getCitiesInBounds: record,
      getTerritoriesInBounds: record,
      getVisibleArmiesInBounds: record,
    }),
  ).getViewport(request, viewer);
  expect(queries).toEqual([
    { bounds, limit: 2001 },
    { bounds, limit: 2001 },
    { bounds, limit: 2001 },
  ]);
});

it('rejects invalid/oversized viewports before opening a world snapshot', async () => {
  let reads = 0;
  const port: WorldMapRepository = {
    withSnapshot: async () => {
      reads += 1;
      throw new Error('not expected');
    },
  };
  for (const bounds of [
    { west: 0, south: 0, east: 181, north: 5 },
    { west: -180, south: -90, east: 180, north: 90 },
    { west: 0, south: 0, east: 0, north: 5 },
  ]) {
    await expect(
      new WorldMapService(port).getViewport({ worldId: 'world', bounds }, viewer),
    ).rejects.toThrow(MapQueryError);
  }
  expect(reads).toBe(0);
});

it('fails closed on foreign viewer/world, stale snapshots, and invalid revisions', async () => {
  for (const changed of [
    { viewerPlayerId: 'other' },
    { worldId: 'other' },
    { validUntil: 2000 },
    { revision: 'not-a-revision' },
  ]) {
    await expect(
      new WorldMapService(repository({ snapshot: { ...snapshot, ...changed } })).getViewport(
        request,
        viewer,
      ),
    ).rejects.toThrow(MapQueryError);
  }
});

it('enforces feature, geometry and byte budgets with generic non-secret errors', async () => {
  const service = new WorldMapService(repository(), { maxEntities: 1 });
  await expect(service.getViewport(request, viewer)).rejects.toThrow('Map viewport unavailable');
  await expect(
    new WorldMapService(repository(), { maxPayloadBytes: 10 }).getViewport(request, viewer),
  ).rejects.toThrow(MapQueryError);
  await expect(
    new WorldMapService(
      repository({
        getTerritoriesInBounds: async () => [
          {
            id: 'land',
            worldId: 'world',
            regionId: 'egypt',
            geometry: area,
            ownerPlayerId: null,
            ownerSultanateId: null,
          },
        ],
      }),
      { maxVertices: 4 },
    ).getViewport(request, viewer),
  ).rejects.toThrow(MapQueryError);
  expect(() => new WorldMapService(repository(), { maxEntities: -1 })).toThrow();
});

it('supports antimeridian queries while rejecting armies outside the viewport', async () => {
  const wrap = { west: 175, south: -10, east: -175, north: 10 };
  const output = await new WorldMapService(
    repository({
      getCitiesInBounds: async () => [],
      getVisibleArmiesInBounds: async () => [
        army('east', 179, 0),
        army('west', -179, 0),
        army('outside', 0, 0),
      ],
      getVisibilityInBounds: async () => ({
        regions: [],
        visibleTerritoryIds: [],
        visibleSultanateTerritoryIds: [],
      }),
    }),
  ).getViewport({ worldId: 'world', bounds: wrap }, viewer);
  expect(output.layers.armies.features.map((f) => f.id)).toEqual(['east', 'west']);
});

it('does not include ungranted borders, castles, siege participants or visibility provenance', async () => {
  const hidden = batch({
    castles: [{ ...city('hidden', 33, 32, 'enemy'), cityId: null }],
    sieges: [
      {
        id: 'hidden-siege',
        worldId: 'world',
        longitude: 33,
        latitude: 32,
        targetId: 'secret',
        targetKind: 'castle',
        status: 'active',
        attackerPlayerId: 'attacker',
        defenderPlayerId: null,
      },
    ],
  });
  const output = await new WorldMapService(
    repository({
      getCastlesInBounds: async () => hidden.castles,
      getSiegesInBounds: async () => hidden.sieges,
      getSultanateTerritoriesInBounds: async () => [
        { id: 'hidden-border', worldId: 'world', sultanateId: 'secret-sultanate', geometry: area },
      ],
    }),
  ).getViewport(request, viewer);
  expect(output.layers.castles.features).toEqual([]);
  expect(output.layers.sieges.features).toEqual([]);
  expect(output.layers.sultanateBorders.features).toEqual([]);
  expect(JSON.stringify(output)).not.toContain('recipientPlayerId');
});

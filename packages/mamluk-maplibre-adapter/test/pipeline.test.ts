import { expect, it } from 'vitest';
import { parseMapPayload, type Army, type VisibilityRegion } from '@mamluk/world-map-core';
import {
  WorldMapService,
  type WorldMapReadSession,
  type WorldMapRepository,
} from '@mamluk/world-map-core/server';
import { MapLibreAdapter } from '../src/adapter';
import { FakeMap } from './fixtures';

const bounds = { west: 30, south: 29, east: 34, north: 33 };
const grant: VisibilityRegion = {
  id: 'tower',
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
        [32, 29],
        [32, 32],
        [30, 32],
        [30, 29],
      ],
    ],
  },
};

function army(id: string, longitude: number, latitude: number, ownerPlayerId: string): Army {
  const route = {
    origin: { longitude: 31, latitude: 30 },
    destination: { longitude: 36.2765, latitude: 33.5138 },
    waypoints: [],
    distance: 620000,
    departureTime: 1000,
    arrivalTime: 9000,
  };
  return {
    id,
    worldId: 'world',
    ownerPlayerId,
    ownerSultanateId: null,
    route,
    position: {
      armyId: id,
      longitude,
      latitude,
      origin: route.origin,
      destination: route.destination,
      departureTime: 1000,
      arrivalTime: 9000,
      status: 'moving',
    },
  };
}

function repository(revision: string, visible: boolean): WorldMapRepository {
  const session: WorldMapReadSession = {
    snapshot: {
      worldId: 'world',
      viewerPlayerId: 'viewer',
      revision,
      serverTime: 2000,
      validUntil: 10000,
    },
    getCitiesInBounds: async () => [],
    getCastlesInBounds: async () => [],
    getTerritoriesInBounds: async () => [],
    getSultanateTerritoriesInBounds: async () => [],
    getSiegesInBounds: async () => [],
    // Deliberately over-return secret data to exercise the real service's security boundary.
    getVisibleArmiesInBounds: async () => [
      army('own', 31, 30, 'viewer'),
      army('visible-enemy', 31, 30, 'enemy'),
      army('hidden-enemy', 33, 32, 'enemy'),
    ],
    getVisibilityInBounds: async () => ({
      regions: visible ? [grant] : [],
      visibleTerritoryIds: [],
      visibleSultanateTerritoryIds: [],
    }),
  };
  return { withSnapshot: async (_world, _viewer, read) => read(session) };
}

it('enforces fog before the wire payload and removes enemies after server vision revocation', async () => {
  const map = new FakeMap();
  const adapter = new MapLibreAdapter(map.port(), { now: () => 0 });
  adapter.resetSession('world');
  const first = await new WorldMapService(repository('1', true)).getViewport(
    { worldId: 'world', bounds },
    { playerId: 'viewer' },
  );
  const wire = JSON.stringify(first);
  expect(wire).not.toContain('hidden-enemy');
  adapter.render(parseMapPayload(JSON.parse(wire)));
  expect(map.data('armies').features.map((feature: { id: string }) => feature.id)).toEqual([
    'own',
    'visible-enemy',
  ]);
  expect(map.data('armyRoutes').features.map((feature: { id: string }) => feature.id)).toEqual([
    'own',
  ]);
  const enemy = map
    .data('armies')
    .features.find((feature: { id: string }) => feature.id === 'visible-enemy');
  expect(JSON.stringify(enemy)).not.toMatch(
    /destination|origin|departureTime|arrivalTime|36\.2765/,
  );
  expect(JSON.stringify([...map.sources.values()].map((source) => source.data))).not.toContain(
    'hidden-enemy',
  );
  const revoked = await new WorldMapService(repository('2', false)).getViewport(
    { worldId: 'world', bounds },
    { playerId: 'viewer' },
  );
  adapter.render(parseMapPayload(JSON.parse(JSON.stringify(revoked))));
  expect(map.data('armies').features.map((feature: { id: string }) => feature.id)).toEqual(['own']);
  expect(JSON.stringify([...map.sources.values()].map((source) => source.data))).not.toContain(
    'visible-enemy',
  );
  adapter.dispose();
});

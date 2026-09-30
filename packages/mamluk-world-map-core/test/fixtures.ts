import type { Army, City, VisibilityRegion } from '../src/models';
import type {
  MapReadSnapshot,
  WorldMapBatch,
  WorldMapReadSession,
  WorldMapRepository,
} from '../src/queries';

export const bounds = { west: 30, south: 29, east: 34, north: 33 };
export const area = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [30, 29],
      [32, 29],
      [32, 32],
      [30, 32],
      [30, 29],
    ] as const,
  ],
};
export const snapshot: MapReadSnapshot = {
  worldId: 'world',
  viewerPlayerId: 'p1',
  revision: '42',
  serverTime: 2000,
  validUntil: 10000,
};
export function city(
  id: string,
  longitude = 31,
  latitude = 30,
  ownerPlayerId: string | null = 'p1',
): City {
  return {
    id,
    worldId: 'world',
    name: id === 'cairo' ? 'القاهرة' : id,
    longitude,
    latitude,
    regionId: 'egypt',
    ownerPlayerId,
    ownerSultanateId: null,
    fortificationLevel: 3,
    strategicValue: 80,
  };
}
export function army(id: string, longitude = 31, latitude = 30, ownerPlayerId = 'p1'): Army {
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
    route,
  };
}
export function region(overrides: Partial<VisibilityRegion> = {}): VisibilityRegion {
  return {
    id: 'grant',
    worldId: 'world',
    recipientPlayerId: 'p1',
    kind: 'watchtower',
    geometry: area,
    startsAt: 1000,
    expiresAt: 8000,
    ...overrides,
  };
}
export function batch(overrides: Partial<WorldMapBatch> = {}): WorldMapBatch {
  return {
    territories: [],
    cities: [],
    armies: [],
    castles: [],
    sultanateTerritories: [],
    sieges: [],
    ...overrides,
  };
}

export function repository(overrides: Partial<WorldMapReadSession> = {}): WorldMapRepository {
  const session: WorldMapReadSession = {
    snapshot,
    getCitiesInBounds: async () => [city('cairo')],
    getTerritoriesInBounds: async () => [],
    getVisibleArmiesInBounds: async () => [
      army('own'),
      army('enemy', 31, 30, 'enemy'),
      army('secret', 33, 32, 'enemy'),
    ],
    getCastlesInBounds: async () => [],
    getSultanateTerritoriesInBounds: async () => [],
    getSiegesInBounds: async () => [],
    getVisibilityInBounds: async () => ({
      regions: [region()],
      visibleTerritoryIds: [],
      visibleSultanateTerritoryIds: [],
    }),
    ...overrides,
  };
  return { withSnapshot: async (_world, _viewer, read) => read(session) };
}

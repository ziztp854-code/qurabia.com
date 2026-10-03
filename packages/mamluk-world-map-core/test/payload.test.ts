import { expect, it } from 'vitest';
import { parseMapPayload } from '../src/payload';
import { WorldMapService } from '../src/service';
import { army, bounds, region, repository } from './fixtures';

it('decodes a real authorized server payload and rejects malformed wire data', async () => {
  const payload = await new WorldMapService(repository()).getViewport(
    { worldId: 'world', bounds },
    { playerId: 'p1' },
  );
  expect(parseMapPayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  for (const change of [
    null,
    { ...payload, schemaVersion: 2 },
    { ...payload, revision: 'x' },
    { ...payload, expiresAt: 0 },
    { ...payload, serverTime: NaN },
    { ...payload, extraSecret: 'secret' },
    { ...payload, bounds: { west: 181, south: 0, east: 0, north: 1 } },
  ])
    expect(() => parseMapPayload(change)).toThrow();
  const broken = structuredClone(payload);
  Object.assign(broken.layers.cities.features[0]!.geometry, { coordinates: [90, 181] });
  expect(() => parseMapPayload(broken)).toThrow();
});

it('accepts the maximum default marker, route and vision counts in a complete server pipeline', async () => {
  const armies = Array.from({ length: 2000 }, (_, index) => army(`a${index}`));
  const grants = Array.from({ length: 128 }, (_, index) => region({ id: `v${index}` }));
  const service = new WorldMapService(
    repository({
      getCitiesInBounds: async () => [],
      getVisibleArmiesInBounds: async () => armies,
      getVisibilityInBounds: async () => ({
        regions: grants,
        visibleTerritoryIds: [],
        visibleSultanateTerritoryIds: [],
      }),
    }),
  );
  const payload = await service.getViewport({ worldId: 'world', bounds }, { playerId: 'p1' });
  const decoded = parseMapPayload(JSON.parse(JSON.stringify(payload)));
  expect(decoded.layers.armies.features).toHaveLength(2000);
  expect(decoded.layers.armyRoutes.features).toHaveLength(2000);
  expect(decoded.layers.visibility.features).toHaveLength(128);
});

it('rejects accidental secret fields and invalid GeoJSON geometry/property contracts', async () => {
  const payload = await new WorldMapService(repository()).getViewport(
    { worldId: 'world', bounds },
    { playerId: 'p1' },
  );
  for (const change of [
    { secretEnemyDestination: [35, 32] },
    { strategicValue: -1 },
    { ownerPlayerId: undefined },
  ]) {
    const mutated = structuredClone(payload);
    Object.assign(mutated.layers.cities.features[0]!.properties, change);
    expect(() => parseMapPayload(mutated)).toThrow();
  }
  const mutated = structuredClone(payload);
  Object.assign(mutated.layers.fog.features[0]!.geometry, {
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 2],
      ],
    ],
  });
  expect(() => parseMapPayload(mutated)).toThrow();
});

it('decodes seam-safe multiline routes and multipart fog while rejecting other shapes', async () => {
  const payload = await new WorldMapService(repository()).getViewport(
    { worldId: 'world', bounds },
    { playerId: 'p1' },
  );
  const seamRoute = {
    type: 'MultiLineString',
    coordinates: [
      [
        [179, 0],
        [180, 0],
      ],
      [
        [-180, 0],
        [-179, 0],
      ],
    ],
  };
  const multipart = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [30, 29],
          [31, 29],
          [31, 30],
          [30, 30],
          [30, 29],
        ],
      ],
      [
        [
          [33, 32],
          [34, 32],
          [34, 33],
          [33, 33],
          [33, 32],
        ],
      ],
    ],
  };
  const valid = structuredClone(payload);
  Object.assign(valid.layers.armyRoutes.features[0]!.geometry, seamRoute);
  Object.assign(valid.layers.fog.features[0]!.geometry, multipart);
  expect(parseMapPayload(valid).layers.armyRoutes.features[0]?.geometry.type).toBe(
    'MultiLineString',
  );
  expect(parseMapPayload(valid).layers.fog.features[0]?.geometry.type).toBe('MultiPolygon');
  for (const shape of [
    { type: 'GeometryCollection', coordinates: [] },
    { type: 'MultiLineString', coordinates: [] },
    { type: 'MultiPolygon', coordinates: [] },
    { type: 'Point', coordinates: [NaN, 0] },
  ]) {
    const value = structuredClone(valid);
    Object.assign(value.layers.armyRoutes.features[0]!.geometry, shape);
    expect(() => parseMapPayload(value)).toThrow();
  }
  const wrongType = structuredClone(payload);
  Object.assign(wrongType.layers.cities.features[0]!.geometry, {
    type: 'LineString',
    coordinates: [
      [30, 29],
      [31, 30],
    ],
  });
  expect(() => parseMapPayload(wrongType)).toThrow();
});

it('round-trips tile distances and legacy metre routes while rejecting unknown units', async () => {
  const own = army('tile-route');
  const tileArmy = {
    ...own,
    route: { ...own.route!, distance: 5, distanceUnit: 'tiles' as const },
  };
  const payload = await new WorldMapService(
    repository({ getVisibleArmiesInBounds: async () => [tileArmy, army('legacy-route')] }),
  ).getViewport({ worldId: 'world', bounds }, { playerId: 'p1' });
  const decoded = parseMapPayload(JSON.parse(JSON.stringify(payload)));
  expect(
    decoded.layers.armyRoutes.features.find((feature) => feature.id === 'tile-route')?.properties
      .distanceUnit,
  ).toBe('tiles');
  expect(
    decoded.layers.armyRoutes.features.find((feature) => feature.id === 'legacy-route')?.properties,
  ).not.toHaveProperty('distanceUnit');
  const invalid = structuredClone(payload);
  Object.assign(invalid.layers.armyRoutes.features[0]!.properties, { distanceUnit: 'pixels' });
  expect(() => parseMapPayload(invalid)).toThrow();
});

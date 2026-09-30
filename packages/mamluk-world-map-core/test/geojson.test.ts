import { expect, it } from 'vitest';
import { GeoJsonProjection, CityGeoJsonBuilder } from '../src/builders';
import { VisibilityFilter, type VisibleWorld } from '../src/visibility';
import { army, batch, city, region, snapshot, bounds, area } from './fixtures';

it('projects longitude first and preserves only explicitly allowed city properties', () => {
  const safe = new VisibilityFilter().filter(
    batch({ cities: [{ ...city('cairo'), secret: 'hidden' } as ReturnType<typeof city>] }),
    { regions: [], visibleTerritoryIds: [], visibleSultanateTerritoryIds: [] },
    snapshot,
    bounds,
  );
  const output = new CityGeoJsonBuilder().build(safe);
  expect(output.features[0]?.geometry).toEqual({ type: 'Point', coordinates: [31, 30] });
  expect(output.features[0]?.properties.name).toBe('القاهرة');
  expect(JSON.stringify(output)).not.toContain('secret');
  expect(() => new CityGeoJsonBuilder().build(batch() as unknown as VisibleWorld)).toThrow();
});

it('builds all presentation layers after filtering and removes enemy plans and hidden ownership', () => {
  const safe = new VisibilityFilter().filter(
    batch({
      cities: [city('cairo')],
      castles: [{ ...city('citadel'), cityId: 'cairo' }],
      armies: [army('own'), army('enemy', 31, 30, 'enemy'), army('hidden', 33, 32, 'enemy')],
      territories: [
        {
          id: 'visible-land',
          worldId: 'world',
          regionId: 'egypt',
          geometry: area,
          ownerPlayerId: 'p1',
          ownerSultanateId: 'mamluks',
        },
        {
          id: 'secret-land',
          worldId: 'world',
          regionId: 'egypt',
          geometry: area,
          ownerPlayerId: 'secret-owner',
          ownerSultanateId: 'secret-sultanate',
        },
      ],
      sultanateTerritories: [
        { id: 'border', worldId: 'world', sultanateId: 'mamluks', geometry: area },
      ],
      sieges: [
        {
          id: 'siege',
          worldId: 'world',
          longitude: 31,
          latitude: 30,
          targetId: 'cairo',
          targetKind: 'city',
          status: 'active',
          attackerPlayerId: 'hidden-attacker',
          defenderPlayerId: 'p1',
        },
        {
          id: 'hidden-siege',
          worldId: 'world',
          longitude: 33,
          latitude: 32,
          targetId: 'hidden',
          targetKind: 'castle',
          status: 'active',
          attackerPlayerId: 'hidden',
          defenderPlayerId: null,
        },
      ],
    }),
    {
      regions: [region()],
      visibleTerritoryIds: ['visible-land'],
      visibleSultanateTerritoryIds: ['border'],
    },
    snapshot,
    bounds,
  );
  const layers = new GeoJsonProjection().build(safe);
  expect(layers.armies.features).toHaveLength(2);
  expect(layers.armyRoutes.features.map((feature) => feature.id)).toEqual(['own']);
  expect(layers.armyRoutes.features[0]?.properties.arrivalTime).toBe(9000);
  expect(layers.castles.features).toHaveLength(1);
  expect(layers.territories.features).toHaveLength(1);
  expect(layers.sultanateBorders.features).toHaveLength(1);
  expect(layers.sieges.features[0]?.properties.status).toBe('active');
  expect(layers.fog.features).toHaveLength(1);
  const wire = JSON.stringify(layers);
  for (const secret of [
    'secret-land',
    'secret-owner',
    'secret-sultanate',
    'hidden-attacker',
    'hidden-siege',
    'recipientPlayerId',
  ])
    expect(wire).not.toContain(secret);
});

it('emits no fog when the entire bounded viewport has authorized vision', () => {
  const wholeViewport = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [30, 29],
        [34, 29],
        [34, 33],
        [30, 33],
        [30, 29],
      ] as const,
    ],
  };
  const safe = new VisibilityFilter().filter(
    batch(),
    {
      regions: [region({ geometry: wholeViewport })],
      visibleTerritoryIds: [],
      visibleSultanateTerritoryIds: [],
    },
    snapshot,
    bounds,
  );
  expect(new GeoJsonProjection().build(safe).fog.features).toEqual([]);
});

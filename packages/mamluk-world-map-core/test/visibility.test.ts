import { expect, it } from 'vitest';
import { VisibilityFilter } from '../src/visibility';
import { army, batch, city, region, snapshot, bounds } from './fixtures';

it('removes hidden enemies and strips future plans from visible enemy markers', () => {
  const visible = new VisibilityFilter().filter(
    batch({
      armies: [army('enemy-visible', 31, 30, 'enemy'), army('enemy-secret', 40, 40, 'enemy')],
      cities: [city('hidden-city', 40, 40, 'enemy')],
    }),
    { regions: [region()], visibleTerritoryIds: [], visibleSultanateTerritoryIds: [] },
    snapshot,
    bounds,
  );
  expect(visible.armies.map((a) => a.id)).toEqual(['enemy-visible']);
  const serialized = JSON.stringify(visible);
  expect(serialized).not.toContain('enemy-secret');
  expect(serialized).not.toContain('hidden-city');
  expect(serialized).not.toContain('destination');
  expect(serialized).not.toContain('arrivalTime');
  expect(visible.routes).toEqual([]);
});

it('keeps own authoritative position and plan while copying only allowed fields', () => {
  const own = { ...army('own', 31, 30, 'p1'), secretToken: 'private-internal' };
  const visible = new VisibilityFilter().filter(
    batch({ armies: [own] }),
    { regions: [], visibleTerritoryIds: [], visibleSultanateTerritoryIds: [] },
    snapshot,
    bounds,
  );
  expect(visible.armies[0]?.longitude).toBe(31);
  expect(visible.routes[0]?.route.arrivalTime).toBe(9000);
  expect(JSON.stringify(visible)).not.toContain('private-internal');
});

it('requires active directional grants for alliance, watchtower, and scouting vision', () => {
  for (const kind of ['alliance', 'watchtower', 'scouting'] as const) {
    const filter = (overrides = {}) =>
      new VisibilityFilter().filter(
        batch({ armies: [army('enemy', 31, 30, 'enemy')] }),
        {
          regions: [region({ kind, ...overrides })],
          visibleTerritoryIds: [],
          visibleSultanateTerritoryIds: [],
        },
        snapshot,
        bounds,
      );
    expect(filter().armies).toHaveLength(1);
    expect(filter({ recipientPlayerId: 'ally' }).armies).toHaveLength(0);
    expect(filter({ expiresAt: snapshot.serverTime }).armies).toHaveLength(0);
    expect(filter({ startsAt: snapshot.serverTime + 1 }).armies).toHaveLength(0);
    expect(filter({ worldId: 'other' }).armies).toHaveLength(0);
  }
});

it('filters viewport and foreign-world entities even when repository returns them', () => {
  const visible = new VisibilityFilter().filter(
    batch({
      cities: [
        city('cairo', 31, 30, 'p1'),
        city('outside', 45, 40, 'p1'),
        { ...city('foreign', 31, 30, 'p1'), worldId: 'other' },
      ],
    }),
    { regions: [], visibleTerritoryIds: [], visibleSultanateTerritoryIds: [] },
    snapshot,
    bounds,
  );
  expect(visible.cities.map((c) => c.id)).toEqual(['cairo']);
});

it('freezes filtered collections so hidden records cannot be inserted before projection', () => {
  const result = new VisibilityFilter().filter(
    batch({ armies: [army('own')] }),
    { regions: [], visibleTerritoryIds: [], visibleSultanateTerritoryIds: [] },
    snapshot,
    bounds,
  );
  expect(Object.isFrozen(result.armies)).toBe(true);
  expect(Object.isFrozen(result.routes[0]?.route.waypoints)).toBe(true);
  expect(() => Object.assign(result.armies[0]!, { id: 'hidden-enemy' })).toThrow();
  expect(() =>
    new VisibilityFilter().filter(
      batch(),
      { regions: [], visibleTerritoryIds: [], visibleSultanateTerritoryIds: [] },
      { ...snapshot, validUntil: 1000 },
      bounds,
    ),
  ).toThrow();
});

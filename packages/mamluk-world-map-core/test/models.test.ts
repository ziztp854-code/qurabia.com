import { describe, expect, it } from 'vitest';
import {
  createArmyPosition,
  createArmyRoute,
  createCity,
  withTerritoryOwnership,
  validateArmy,
} from '../src/validation';
import type { City, Territory } from '../src/models';

const cairo = { longitude: 31.2357, latitude: 30.0444 };
const damascus = { longitude: 36.2765, latitude: 33.5138 };
const city: City = {
  ...cairo,
  id: 'cairo',
  worldId: 'world',
  name: 'القاهرة',
  regionId: 'egypt',
  ownerPlayerId: 'p1',
  ownerSultanateId: 'mamluks',
  fortificationLevel: 3,
  strategicValue: 80,
};
const territory: Territory = {
  id: 'egypt',
  worldId: 'world',
  regionId: 'nile',
  ownerPlayerId: 'p1',
  ownerSultanateId: 'mamluks',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [30, 29],
        [32, 29],
        [32, 31],
        [30, 31],
        [30, 29],
      ],
    ],
  },
};

describe('authoritative map models', () => {
  it('preserves geographic cities and rejects invalid fortifications', () => {
    expect(createCity(city)).toEqual(city);
    expect(Object.isFrozen(createCity(city))).toBe(true);
    expect(() => createCity({ ...city, fortificationLevel: -1 })).toThrow();
    expect(() => createCity({ ...city, strategicValue: NaN })).toThrow();
    expect(() => createCity({ ...city, id: '' })).toThrow();
  });
  it('changes ownership only through a server model without mutating the previous territory', () => {
    const updated = withTerritoryOwnership(territory, {
      ownerPlayerId: 'p2',
      ownerSultanateId: null,
    });
    expect(updated.ownerPlayerId).toBe('p2');
    expect(territory.ownerPlayerId).toBe('p1');
    expect(() =>
      withTerritoryOwnership(territory, { ownerPlayerId: '', ownerSultanateId: null }),
    ).toThrow();
  });
  it('retains the engine position and schedule without interpolating or deriving duration', () => {
    const position = createArmyPosition({
      ...cairo,
      armyId: 'a1',
      origin: cairo,
      destination: damascus,
      departureTime: 1000,
      arrivalTime: 9000,
      status: 'moving',
    });
    expect(position.longitude).toBe(31.2357);
    expect(position.arrivalTime).toBe(9000);
    expect(() => createArmyPosition({ ...position, arrivalTime: 999 })).toThrow();
    expect(() => createArmyPosition({ ...position, destination: null })).toThrow();
  });
  it('requires no travel plan for a stationary army', () => {
    const stationary = {
      ...cairo,
      armyId: 'a1',
      origin: null,
      destination: null,
      departureTime: null,
      arrivalTime: null,
      status: 'stationed' as const,
    };
    expect(createArmyPosition(stationary).origin).toBeNull();
    expect(() => createArmyPosition({ ...stationary, arrivalTime: 9000 })).toThrow();
  });
  it('validates routes and makes an independent copy of waypoints', () => {
    const waypoint = { longitude: 34, latitude: 32 };
    const route = createArmyRoute({
      origin: cairo,
      destination: damascus,
      waypoints: [waypoint],
      distance: 620000,
      departureTime: 1000,
      arrivalTime: 9000,
    });
    waypoint.longitude = 35;
    expect(route.waypoints[0]?.longitude).toBe(34);
    expect(() => createArmyRoute({ ...route, distance: -1 })).toThrow();
    expect(() => createArmyRoute({ ...route, departureTime: Infinity })).toThrow();
  });
  it('rejects army identity and route schedule mismatches', () => {
    const route = createArmyRoute({
      origin: cairo,
      destination: damascus,
      waypoints: [],
      distance: 620000,
      departureTime: 1000,
      arrivalTime: 9000,
    });
    const position = createArmyPosition({ ...cairo, armyId: 'a1', ...route, status: 'moving' });
    const army = {
      id: 'a1',
      worldId: 'world',
      ownerPlayerId: 'p1',
      ownerSultanateId: null,
      position,
      route,
    };
    expect(() => validateArmy(army)).not.toThrow();
    expect(() => validateArmy({ ...army, id: 'wrong' })).toThrow();
    expect(() => validateArmy({ ...army, route: { ...route, arrivalTime: 10000 } })).toThrow();
  });

  it('rejects malformed castle names, states and oversized route plans', () => {
    expect(() => createCity({ ...city, name: '' })).toThrow();
    const plan = {
      origin: cairo,
      destination: damascus,
      waypoints: [],
      distance: 620000,
      departureTime: 1000,
      arrivalTime: 9000,
    };
    expect(() =>
      createArmyRoute({ ...plan, waypoints: Array.from({ length: 10001 }, () => cairo) }),
    ).toThrow();
    expect(() =>
      createArmyPosition({
        ...cairo,
        armyId: 'army',
        origin: null,
        destination: null,
        departureTime: null,
        arrivalTime: null,
        status: 'unknown' as never,
      }),
    ).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand } from '../kingdoms/engine';
import { provisionVillageGeography } from './village-geography';
import { KingdomMapProjection } from './kingdom-projection';

const at = 1000;
function fixture() {
  const first = executeCommand(createWorld(at), 'viewer', { type: 'found', name: 'الأولى' }, at);
  const state = executeCommand(first, 'enemy', { type: 'found', name: 'الثانية' }, at);
  const own = Object.values(state.villages).find((v) => v.ownerId === 'viewer')!;
  const enemy = Object.values(state.villages).find((v) => v.ownerId === 'enemy')!;
  const movement = {
    id: 'scouts',
    ownerId: 'viewer',
    sourceId: own.id,
    mission: 'scout' as const,
    targetX: enemy.x,
    targetY: enemy.y,
    departedAt: at,
    arrivesAt: 11000,
    travelMs: 10000,
    troops: { guard: 0, rider: 0, scout: 9876, settler: 0 },
    loot: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
  };
  return {
    own,
    enemy,
    state: provisionVillageGeography('world', {
      ...state,
      villages: { ...state.villages, [own.id]: { ...own, troops: { ...own.troops, guard: 1 } } },
      movements: [
        movement,
        { ...movement, id: 'hidden', ownerId: 'enemy', sourceId: enemy.id },
        { ...movement, id: 'return', mission: 'return' as const },
        { ...movement, id: 'unmapped', targetX: 30, targetY: 30 },
      ],
    }),
  };
}
describe('live geographic gameplay projection', () => {
  it('keeps far-away public villages while hiding their forces and private fortifications', () => {
    const { enemy, state } = fixture();
    const far = {
      ...state,
      villages: {
        ...state.villages,
        [enemy.id]: {
          ...enemy,
          x: 40,
          y: 40,
          troops: { ...enemy.troops, guard: 9999 },
        },
      },
    };
    const result = new KingdomMapProjection(far, 'world', 'viewer', at);
    const city = state.geography!.cities.find((c) => c.value.id === enemy.id)!.value;
    expect(result.city({ ...city, longitude: 140, latitude: 60 })).toMatchObject({
      id: enemy.id,
      ownerPlayerId: 'enemy',
      longitude: 140,
      latitude: 60,
      fortificationLevel: 0,
    });
    expect(result.armies.every((army) => army.ownerPlayerId === 'viewer')).toBe(true);
    expect(JSON.stringify(result.armies)).not.toContain('9999');
  });
  it('preserves relocated positions and authoritative ETA, excludes enemies and unknown origins', () => {
    const { own, enemy, state } = fixture();
    const cities = state.geography!.cities.map((record) =>
      record.value.id === own.id
        ? { ...record, value: { ...record.value, longitude: 42, latitude: 25 } }
        : record,
    );
    const relocated = { ...state, geography: { ...state.geography!, cities } };
    const before = structuredClone(relocated);
    const result = new KingdomMapProjection(relocated, 'world', 'viewer', 6000);
    expect(result.armies.map((a) => a.id)).toEqual([`garrison:${own.id}`, 'scouts']);
    const route = result.armies.find((a) => a.id === 'scouts')!.route!;
    expect(route.origin).toEqual({ longitude: 42, latitude: 25 });
    expect(route.destination).toEqual(
      expect.objectContaining({
        longitude: cities.find((c) => c.value.id === enemy.id)!.value.longitude,
      }),
    );
    expect(route).toMatchObject({
      departureTime: 1000,
      arrivalTime: 11000,
      distanceUnit: 'tiles',
      distance: Math.hypot(enemy.x - own.x, enemy.y - own.y),
    });
    expect(JSON.stringify(result.armies)).not.toContain('9876');
    expect(relocated).toEqual(before);
  });
  it('refreshes public ownership and forms only own alliance plot borders', () => {
    const { own, enemy, state } = fixture();
    const allied = {
      ...state,
      players: { ...state.players, viewer: { ...state.players.viewer, allianceId: 'alliance' } },
      alliances: {
        alliance: {
          id: 'alliance',
          name: 'تحالف',
          members: { viewer: 'leader' as const },
          diplomacy: {},
        },
      },
    };
    const result = new KingdomMapProjection(allied, 'world', 'viewer', at);
    const ownCity = state.geography!.cities.find((c) => c.value.id === own.id)!.value;
    const enemyCity = state.geography!.cities.find((c) => c.value.id === enemy.id)!.value;
    expect(result.city({ ...ownCity, ownerPlayerId: 'old-owner' })).toMatchObject({
      ownerPlayerId: 'viewer',
      ownerSultanateId: 'alliance',
    });
    expect(result.city({ ...enemyCity, fortificationLevel: 99 })?.fortificationLevel).toBe(0);
    expect(result.borders).toHaveLength(1);
    expect(result.borders[0].sultanateId).toBe('alliance');
    expect(result.city({ ...ownCity, id: 'deleted' })).toBeNull();
  });
});

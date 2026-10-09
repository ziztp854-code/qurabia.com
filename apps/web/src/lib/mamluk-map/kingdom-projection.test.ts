import { emptyTroops } from '@/lib/kingdoms/simulation';
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
    troops: { ...emptyTroops(), guard: 0, rider: 0, scout: 9876, settler: 0 },
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
  it('projects only the viewer building levels, without troops or an invented layout', () => {
    const { own, enemy, state } = fixture();
    const projection = new KingdomMapProjection(state, 'world', 'viewer', at);
    const city = (id: string) =>
      state.geography!.cities.find((entry) => entry.value.id === id)!.value;
    const ownCity = projection.city(city(own.id))!;
    expect(JSON.parse(ownCity.villageBuildings!)).toEqual(state.villages[own.id]!.buildings);
    expect(projection.city(city(enemy.id))!.villageBuildings).toBeNull();
    expect(ownCity.villageBuildings).not.toContain('troops');
    expect(ownCity.villageBuildings).not.toContain('layout');
  });
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
      villageLevel: 1,
      villageRank: null,
      villagePower: null,
      villageVisualTier: null,
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

it('publishes stored village level for every visible settlement and keeps private progression private', () => {
  const { own, enemy, state } = fixture();
  const second = {
    ...enemy,
    id: 'enemy-second',
    name: 'الثانية البعيدة',
    x: enemy.x + 3,
    y: enemy.y + 3,
    progression: enemy.progression ? { ...enemy.progression, level: 14, xp: 999999 } : undefined,
  };
  const published = {
    ...state,
    villages: {
      ...state.villages,
      [own.id]: {
        ...own,
        progression: own.progression ? { ...own.progression, level: 20 } : undefined,
      },
      [enemy.id]: {
        ...enemy,
        progression: enemy.progression ? { ...enemy.progression, level: 50, xp: 1 } : undefined,
      },
      [second.id]: second,
    },
  };
  const geography = provisionVillageGeography('world', published);
  const projected = new KingdomMapProjection(geography, 'world', 'viewer', at);
  const city = (id: string) => geography.geography!.cities.find((c) => c.value.id === id)!.value;
  const ownCity = projected.city(city(own.id));
  const enemyCity = projected.city(city(enemy.id));
  const secondCity = projected.city(city(second.id));
  expect(ownCity).toMatchObject({
    villageLevel: 20,
    villageRank: 'مستوطنة',
    villageVisualTier: 1,
    population: null,
    constructionStatus: 'IDLE',
    kingdomName: 'الأولى',
    allianceName: null,
  });
  expect(enemyCity).toMatchObject({
    villageLevel: 50,
    villageRank: null,
    villagePower: null,
    villageVisualTier: null,
    population: null,
    constructionStatus: null,
    kingdomName: 'الثانية',
  });
  expect(typeof ownCity?.villagePower).toBe('number');
  expect(secondCity).toMatchObject({ villageLevel: 14, villagePower: null, villageRank: null });
  const serialized = JSON.stringify(enemyCity);
  for (const secret of [
    '"xp"',
    '"troops"',
    '"resources"',
    '"training"',
    '"signature"',
    '"requirements"',
    '999999',
  ])
    expect(serialized).not.toContain(secret);
  expect(enemyCity?.villagePower).toBeNull();
  const missing = {
    ...geography,
    villages: {
      ...geography.villages,
      [enemy.id]: { ...geography.villages[enemy.id]!, progression: undefined },
      legacy: { ...enemy, id: 'legacy', progression: { ...enemy.progression!, level: 0 } },
      fractional: {
        ...enemy,
        id: 'fractional',
        progression: { ...enemy.progression!, level: 1.5 },
      },
      overflow: { ...enemy, id: 'overflow', progression: { ...enemy.progression!, level: 51 } },
    },
  };
  const guarded = new KingdomMapProjection(missing, 'world', 'viewer', at);
  const probe = (id: string) => guarded.city({ ...city(enemy.id), id })?.villageLevel;
  expect(probe(enemy.id)).toBeNull();
  expect(probe('legacy')).toBeNull();
  expect(probe('fractional')).toBeNull();
  expect(probe('overflow')).toBeNull();
});

it('renders a saved return origin toward home, preserving ETA and never inventing legacy origins', () => {
  const { own, enemy, state } = fixture();
  const original = state.movements[0]!;
  const returning = {
    ...state,
    movements: [
      {
        ...original,
        id: 'return-mapped',
        mission: 'return' as const,
        originX: enemy.x,
        originY: enemy.y,
        targetX: own.x,
        targetY: own.y,
      },
      {
        ...original,
        id: 'legacy-return',
        mission: 'return' as const,
        targetX: own.x,
        targetY: own.y,
      },
    ],
  };
  const projection = new KingdomMapProjection(returning, 'world', 'viewer', 6000);
  expect(projection.armies.map((army) => army.id)).toEqual([`garrison:${own.id}`, 'return-mapped']);
  const route = projection.armies.find((army) => army.id === 'return-mapped')!;
  const anchor = (id: string) => {
    const city = state.geography!.cities.find((record) => record.value.id === id)!.value;
    return { longitude: city.longitude, latitude: city.latitude };
  };
  expect(route).toMatchObject({
    route: {
      mission: 'return',
      origin: anchor(enemy.id),
      destination: anchor(own.id),
      departureTime: 1000,
      arrivalTime: 11000,
    },
    position: { status: 'retreating' },
  });
});

it('projects only traveling owner transports with their saved timetable and no resource details', () => {
  const { own, enemy, state } = fixture();
  const caravan = {
    id: 'transport',
    ownerId: 'viewer',
    originVillageId: own.id,
    targetVillageId: enemy.id,
    resources: { wood: 654321, stone: 0, iron: 0, food: 0, gold: 0 },
    departsAt: 1000,
    arrivesAt: 11000,
    status: 'traveling' as const,
    route: [
      { x: own.x, y: own.y },
      { x: enemy.x, y: enemy.y },
    ],
    exposed: true,
  };
  const traveling = {
    ...state,
    caravans: [
      caravan,
      { ...caravan, id: 'hidden', ownerId: 'enemy' },
      { ...caravan, id: 'cancelled', status: 'returned' as const },
    ],
  };
  const result = new KingdomMapProjection(traveling, 'world', 'viewer', 6000);
  const marker = result.armies.find((army) => army.id === 'caravan:transport')!;
  expect(marker.route).toMatchObject({
    mission: 'transport',
    departureTime: 1000,
    arrivalTime: 11000,
    distanceUnit: 'tiles',
  });
  expect(
    result.armies.some((army) => army.id === 'caravan:hidden' || army.id === 'caravan:cancelled'),
  ).toBe(false);
  expect(JSON.stringify(result.armies)).not.toContain('654321');
});


it('maps authorized abandoned gathering and its saved return origin without publishing cargo or enemies', () => {
  const { own, state } = fixture();
  const worldId = 'kw_map_gather';
  const site = { id: 'saved-egypt', name: 'Saved village', region: 'egypt' as const, countryCode: 'EG', longitude: 31.2357, latitude: 30.0444,
    x: 180, y: 180, stock: { wood: 100, stone: 100, iron: 100, food: 100, gold: 100 }, stockUpdatedAt: at };
  const movement = { ...state.movements[0]!, id: 'gather-saved', mission: 'gather' as const, originX: own.x, originY: own.y,
    targetX: site.x, targetY: site.y, troops: { ...emptyTroops(), guard: 1 }, abandonedGather: { targetId: site.id, worldId } };
  const gathering = { ...state, movements: [movement, { ...movement, id: 'hidden-gather', ownerId: 'enemy' }],
    abandonedVillages: { version: 1 as const, scope: 'kingdom-world' as const, worldId, seed: 'saved-map-gather', domainVersion: 'saved-fixture-v1', generatedAt: at, villages: { [site.id]: site } } };
  const before = structuredClone(gathering);
  const projected = new KingdomMapProjection(gathering, worldId, 'viewer', 6000);
  const outward = projected.armies.find((army) => army.id === movement.id)!;
  const home = state.geography!.cities.find((record) => record.value.id === own.id)!.value;
  expect(outward.route).toMatchObject({ mission: 'gather', destination: { longitude: site.longitude, latitude: site.latitude }, distance: Math.hypot(site.x - own.x, site.y - own.y), arrivalTime: 11000 });
  expect(outward.position.latitude).toBeCloseTo((home.latitude + site.latitude) / 2);
  expect(projected.armies.some((army) => army.id === 'hidden-gather')).toBe(false);
  const returned = new KingdomMapProjection(gathering, worldId, 'viewer', 11001).armies.find((army) => army.route?.mission === 'return')!;
  expect(returned.route).toMatchObject({ origin: { longitude: site.longitude, latitude: site.latitude }, destination: { longitude: home.longitude, latitude: home.latitude }, departureTime: 11000, arrivalTime: 21000 });
  expect(gathering).toEqual(before);
  for (const forbidden of ['troops', 'loot', 'stock', 'available']) expect(JSON.stringify(projected.armies)).not.toContain(forbidden);
  const wrongWorld = { ...gathering, movements: [{ ...movement, abandonedGather: { targetId: site.id, worldId: 'kw_wrong' } }] };
  expect(new KingdomMapProjection(wrongWorld, worldId, 'viewer', 6000).armies.some((army) => army.id === movement.id)).toBe(false);
});


describe('stationed support visibility', () => {
  it('publishes only support from owned sources without exposing troop counts', () => {
    const { own, enemy, state } = fixture();
    state.villages[enemy.id].reinforcements = {
      [own.id]: { ...emptyTroops(), guard: 1234 },
      [enemy.id]: { ...emptyTroops(), guard: 9876 },
      missing: { ...emptyTroops(), guard: 7654 },
    };
    const before = structuredClone(state);
    const result = new KingdomMapProjection(state, 'world', 'viewer', at);
    const support = result.armies.filter((army) => army.id.startsWith('reinforcement:'));
    expect(support).toHaveLength(1);
    expect(support[0]).toMatchObject({
      id: expect.stringMatching(/^reinforcement:[a-f0-9]{24}$/),
      ownerPlayerId: 'viewer',
      route: null,
      position: { status: 'stationed', arrivalTime: null },
    });
    const host = state.geography!.cities.find(({ value }) => value.id === enemy.id)!.value;
    expect(support[0].position).toMatchObject({ longitude: host.longitude, latitude: host.latitude });
    expect(JSON.stringify(result.armies)).not.toMatch(/1234|9876|7654|troops/);
    expect(state).toEqual(before);
    state.villages[own.id].ownerId = 'enemy';
    expect(new KingdomMapProjection(state, 'world', 'viewer', at).armies).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: support[0].id })]),
    );
  });

  it('shows support at the exact arrival and replaces it with a return on recall', () => {
    const { own, enemy, state } = fixture();
    state.movements = [];
    state.players.viewer.allianceId = 'allies';
    state.players.enemy.allianceId = 'allies';
    state.villages[own.id].troops = { ...emptyTroops(), guard: 5 };
    const sent = provisionVillageGeography('world', executeCommand(state, 'viewer', {
      type: 'march', villageId: own.id, mission: 'reinforce',
      targetX: enemy.x, targetY: enemy.y, troops: { ...emptyTroops(), guard: 5 },
    }, at));
    const movement = sent.movements[0];
    const before = structuredClone(sent);
    const arriving = new KingdomMapProjection(sent, 'world', 'viewer', movement.arrivesAt - 1);
    expect(arriving.armies.map(({ id }) => id)).toContain(movement.id);
    const arrived = new KingdomMapProjection(sent, 'world', 'viewer', movement.arrivesAt);
    expect(arrived.armies).toHaveLength(1);
    const supportId = arrived.armies[0].id;
    expect(supportId).toMatch(/^reinforcement:[a-f0-9]{24}$/);
    expect(sent).toEqual(before);
    const recalled = provisionVillageGeography('world', executeCommand(sent, 'viewer', {
      type: 'recall', villageId: own.id, hostVillageId: enemy.id,
    }, movement.arrivesAt));
    const returning = new KingdomMapProjection(recalled, 'world', 'viewer', movement.arrivesAt);
    expect(returning.armies.map(({ id }) => id)).not.toContain(supportId);
    expect(returning.armies).toHaveLength(1);
    expect(returning.armies[0]).toMatchObject({
      id: recalled.movements[0].id,
      position: { status: 'retreating' }, route: { mission: 'return' },
    });
  });
});

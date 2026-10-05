import { emptyTroops } from '@/lib/kingdoms/simulation';
import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand } from '../kingdoms/engine';
import { provisionVillageGeography } from './village-geography';
import { applyVillageRelocation, getVillageRelocationStatus } from './village-relocation';
import { storeMapRecord } from './storage';
import type { Movement } from '../kingdoms/types';
import { villageRelocationRequestSchema } from './relocation-request';

function fixture() {
  const state = provisionVillageGeography(
    'world',
    executeCommand(createWorld(1000), 'ruler', { type: 'found', name: 'مملكة الاختبار' }, 1000),
  );
  const villageId = Object.keys(state.villages)[0]!;
  const context = { worldId: 'world', actorId: 'ruler', villageId, revision: 7, paused: false };
  return { state, villageId, context };
}

describe('one geographic relocation per actual village', () => {
  it('relocates the owned village and plot once while preserving its actual game state', () => {
    const { state, villageId, context } = fixture();
    expect(getVillageRelocationStatus(state, context).canRelocate).toBe(true);
    const geography = applyVillageRelocation(state, context, { longitude: 35, latitude: 32 }, 2000);
    expect(geography.cities.find(({ value }) => value.id === villageId)?.value).toMatchObject({
      longitude: 35,
      latitude: 32,
    });
    expect(geography.territories.find(({ value }) => value.id === villageId)).toMatchObject({
      west: 34.991,
      east: 35.009,
      south: 31.991,
      north: 32.009,
    });
    expect(state.geography?.cities[0]?.value.longitude).toBe(31.24967);
    expect(getVillageRelocationStatus({ ...state, geography }, context)).toMatchObject({
      longitude: 35,
      latitude: 32,
      relocationUsed: true,
      canRelocate: false,
      reason: 'used',
    });
    expect(() =>
      applyVillageRelocation(
        { ...state, geography },
        context,
        { longitude: 36, latitude: 33 },
        3000,
      ),
    ).toThrow();
  });

  it.each([
    { longitude: 180, latitude: 0 },
    { longitude: 0, latitude: 86 },
    { longitude: NaN, latitude: 32 },
  ])('rejects a location outside authoritative world bounds %o', (point) => {
    const { state, context } = fixture();
    expect(() => applyVillageRelocation(state, context, point, 2000)).toThrow();
    expect(getVillageRelocationStatus(state, context).relocationUsed).toBe(false);
  });

  it('rejects no-op and occupied locations without consuming the relocation', () => {
    const { state, context } = fixture();
    const original = state.geography!.cities[0]!.value;
    expect(() => applyVillageRelocation(state, context, original, 2000)).toThrow();
    const other = storeMapRecord({ ...original, id: 'other', longitude: 35, latitude: 32 });
    const occupied = {
      ...state,
      geography: { ...state.geography!, cities: [...state.geography!.cities, other] },
    };
    expect(() =>
      applyVillageRelocation(occupied, context, { longitude: 35, latitude: 32 }, 2000),
    ).toThrow();
  });

  it('denies paused worlds and active military activity without revealing its cause', () => {
    const { state, villageId, context } = fixture();
    const village = state.villages[villageId]!;
    const movement: Movement = {
      id: 'secret-order',
      ownerId: 'enemy',
      sourceId: 'other',
      targetX: village.x,
      targetY: village.y,
      mission: 'attack',
      troops: { ...emptyTroops(), guard: 1, rider: 0, scout: 0, settler: 0 },
      departedAt: 1000,
      arrivesAt: 5000,
      travelMs: 4000,
      loot: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
    };
    for (const candidate of [
      { ...state, movements: [movement] },
      { ...state, movements: [{ ...movement, sourceId: villageId, targetX: village.x + 1 }] },
      { ...state, season: { ...state.season, status: 'ended' as const } },
    ]) {
      expect(getVillageRelocationStatus(candidate, context)).toMatchObject({
        canRelocate: false,
        reason: 'unavailable',
        relocationUsed: false,
      });
      expect(() =>
        applyVillageRelocation(candidate, context, { longitude: 35, latitude: 32 }, 2000),
      ).toThrow();
      expect(JSON.stringify(getVillageRelocationStatus(candidate, context))).not.toMatch(
        /secret-order|troops|attack|enemy/,
      );
    }
    expect(getVillageRelocationStatus(state, { ...context, paused: true }).canRelocate).toBe(false);
  });

  it('retains the village-use flag after capture and excludes foreign ownership', () => {
    const { state, villageId, context } = fixture();
    expect(() => getVillageRelocationStatus(state, { ...context, actorId: 'enemy' })).toThrow();
    const geography = applyVillageRelocation(state, context, { longitude: 35, latitude: 32 }, 2000);
    const captured = {
      ...state,
      geography,
      players: { ...state.players, enemy: { ...state.players.ruler!, id: 'enemy' } },
      villages: {
        ...state.villages,
        [villageId]: { ...state.villages[villageId]!, ownerId: 'enemy' },
      },
    };
    expect(getVillageRelocationStatus(captured, { ...context, actorId: 'enemy' })).toMatchObject({
      relocationUsed: true,
      canRelocate: false,
      reason: 'used',
    });
  });

  it('moves linked castles coherently and retains all unrelated intelligence and game state', () => {
    const { state, villageId, context } = fixture();
    const city = state.geography!.cities[0]!.value;
    const castle = storeMapRecord({ ...city, id: 'castle', cityId: villageId });
    const candidate = { ...state, geography: { ...state.geography!, castles: [castle] } };
    const before = structuredClone(candidate);
    const geography = applyVillageRelocation(
      candidate,
      context,
      { longitude: 35, latitude: 32 },
      2000,
    );
    expect(geography.castles[0]?.value).toMatchObject({
      cityId: villageId,
      longitude: 35,
      latitude: 32,
    });
    expect(candidate).toEqual(before);
    expect(geography.armies).toBe(candidate.geography.armies);
    expect(geography.sieges).toBe(candidate.geography.sieges);
    expect(geography.visibility).toBe(candidate.geography.visibility);
  });

  it('refuses to transfer a linked castle owned by someone else', () => {
    const { state, villageId, context } = fixture();
    const city = state.geography!.cities[0]!.value;
    const foreignCastle = storeMapRecord({
      ...city,
      id: 'castle',
      cityId: villageId,
      ownerPlayerId: 'enemy',
    });
    const candidate = { ...state, geography: { ...state.geography!, castles: [foreignCastle] } };
    expect(getVillageRelocationStatus(candidate, context)).toMatchObject({
      canRelocate: false,
      reason: 'unavailable',
    });
    expect(() =>
      applyVillageRelocation(candidate, context, { longitude: 35, latitude: 32 }, 2000),
    ).toThrow();
    expect(foreignCastle.value.ownerPlayerId).toBe('enemy');
  });

  it('blocks unresolved sieges but permits unrelated historical markers', () => {
    const { state, villageId, context } = fixture();
    const city = state.geography!.cities[0]!.value;
    const marker = storeMapRecord({
      id: 'private-siege',
      worldId: 'world',
      targetId: villageId,
      targetKind: 'city' as const,
      status: 'active' as const,
      attackerPlayerId: 'enemy',
      defenderPlayerId: 'ruler',
      longitude: city.longitude,
      latitude: city.latitude,
    });
    const candidate = { ...state, geography: { ...state.geography!, sieges: [marker] } };
    expect(getVillageRelocationStatus(candidate, context)).toMatchObject({
      canRelocate: false,
      reason: 'unavailable',
    });
    expect(() =>
      applyVillageRelocation(candidate, context, { longitude: 35, latitude: 32 }, 2000),
    ).toThrow();
    const historical = {
      ...candidate,
      geography: {
        ...candidate.geography,
        sieges: [storeMapRecord({ ...marker.value, status: 'resolved' as const })],
      },
    };
    expect(getVillageRelocationStatus(historical, context).canRelocate).toBe(true);
  });

  it('keeps an army at the village and its route immutable by refusing relocation', () => {
    const { state, context } = fixture();
    const city = state.geography!.cities[0]!.value;
    const army = storeMapRecord({
      id: 'private-army',
      worldId: 'world',
      ownerPlayerId: 'enemy',
      ownerSultanateId: null,
      route: null,
      position: {
        armyId: 'private-army',
        longitude: city.longitude,
        latitude: city.latitude,
        origin: null,
        destination: null,
        departureTime: null,
        arrivalTime: null,
        status: 'stationed' as const,
      },
    });
    const candidate = { ...state, geography: { ...state.geography!, armies: [army] } };
    expect(getVillageRelocationStatus(candidate, context)).toMatchObject({
      canRelocate: false,
      reason: 'unavailable',
    });
    expect(() =>
      applyVillageRelocation(candidate, context, { longitude: 35, latitude: 32 }, 2000),
    ).toThrow();
    expect(army.value.position.longitude).toBe(31.24967);
    const nearby = {
      ...candidate,
      geography: {
        ...candidate.geography,
        armies: [
          storeMapRecord({
            ...army.value,
            position: { ...army.value.position, longitude: city.longitude + 0.003 },
          }),
        ],
      },
    };
    expect(getVillageRelocationStatus(nearby, context).canRelocate).toBe(false);
  });

  it('does not rewrite explicit geographic campaigns or accept forged village/world identities', () => {
    const { state, context } = fixture();
    for (const candidate of [
      { ...state, geography: { ...state.geography!, source: undefined } },
      { ...state, geography: undefined },
      { ...state, geography: { ...state.geography!, cities: [] } },
    ])
      expect(() => getVillageRelocationStatus(candidate, context)).toThrow();
    expect(() =>
      getVillageRelocationStatus(state, { ...context, worldId: 'different-world' }),
    ).toThrow();
    expect(() =>
      getVillageRelocationStatus(state, { ...context, villageId: 'missing-village' }),
    ).toThrow();
  });

  it('strictly validates the relocation HTTP body and drops no forged authoritative fields', () => {
    const valid = {
      worldId: 'world',
      villageId: 'v1',
      idempotencyKey: 'relocate-key-000001',
      longitude: 35,
      latitude: 32,
    };
    expect(villageRelocationRequestSchema.parse(valid)).toEqual(valid);
    for (const extra of [
      { actorId: 'enemy' },
      { relocationUsed: false },
      { troops: 999 },
      { bounds: {} },
    ])
      expect(villageRelocationRequestSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    expect(villageRelocationRequestSchema.safeParse({ ...valid, longitude: '35' }).success).toBe(
      false,
    );
    expect(villageRelocationRequestSchema.safeParse({ ...valid, latitude: Infinity }).success).toBe(
      false,
    );
  });
});

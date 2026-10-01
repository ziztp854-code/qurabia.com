import 'server-only';
import {
  createCity,
  createCastle,
  prepareArea,
  validateCoordinates,
  validateId,
  validateTime,
} from '@mamluk/world-map-core/server';
import type { Coordinates, City } from '@mamluk/world-map-core';
import type { KingdomsWorld } from '../kingdoms/types';
import { KingdomsHttpError } from '../kingdoms/http';
import { VILLAGE_GEOGRAPHY_SOURCE } from './village-geography';
import { buildVillageTerritories } from './village-territories';
import { storeMapRecord, type MamlukMapState } from './storage';

export const VILLAGE_RELOCATION_BOUNDS = Object.freeze({
  west: -179.9,
  south: -85,
  east: 179.9,
  north: 85,
});
export type VillageRelocationWorld = KingdomsWorld & { readonly geography?: MamlukMapState };
export interface VillageRelocationContext {
  readonly worldId: string;
  readonly actorId: string;
  readonly villageId: string;
  readonly revision: number;
  readonly paused: boolean;
}
export interface VillageRelocationStatus extends Coordinates {
  readonly worldId: string;
  readonly villageId: string;
  readonly revision: number;
  readonly relocationUsed: boolean;
  readonly canRelocate: boolean;
  readonly reason: 'used' | 'unavailable' | null;
  readonly bounds: typeof VILLAGE_RELOCATION_BOUNDS;
}

export function getVillageRelocationStatus(
  state: VillageRelocationWorld,
  context: VillageRelocationContext,
): VillageRelocationStatus {
  validateId(context.worldId);
  validateId(context.actorId);
  validateId(context.villageId);
  const village = Object.hasOwn(state.villages, context.villageId)
    ? state.villages[context.villageId]
    : undefined;
  const geography = state.geography;
  const city = geography?.cities.find(({ value }) => value.id === context.villageId)?.value;
  if (
    !Object.hasOwn(state.players, context.actorId) ||
    !village ||
    village.ownerId !== context.actorId ||
    village.id !== context.villageId ||
    !geography ||
    geography.version !== 1 ||
    geography.source !== VILLAGE_GEOGRAPHY_SOURCE ||
    !city ||
    city.worldId !== context.worldId
  )
    throw new KingdomsHttpError(404, 'القرية غير متاحة.');
  validateCoordinates(city);
  const relocationUsed = Object.hasOwn(geography.villageRelocations ?? {}, context.villageId);
  const unavailable =
    context.paused ||
    state.season.status !== 'active' ||
    militaryActivity(state, context.villageId, city);
  return {
    worldId: context.worldId,
    villageId: context.villageId,
    revision: context.revision,
    longitude: city.longitude,
    latitude: city.latitude,
    relocationUsed,
    canRelocate: !relocationUsed && !unavailable,
    reason: relocationUsed ? 'used' : unavailable ? 'unavailable' : null,
    bounds: VILLAGE_RELOCATION_BOUNDS,
  };
}

function militaryActivity(state: VillageRelocationWorld, villageId: string, city: City): boolean {
  const village = state.villages[villageId]!;
  if (
    state.movements.some(
      (move) =>
        move.sourceId === villageId || (move.targetX === village.x && move.targetY === village.y),
    )
  )
    return true;
  const geography = state.geography!;
  const castles = geography.castles.filter(({ value }) => value.cityId === villageId);
  if (
    castles.some(
      ({ value }) => value.ownerPlayerId !== village.ownerId || value.worldId !== city.worldId,
    )
  )
    return true;
  const linkedCastles = castles.map(({ value }) => value.id);
  if (
    geography.sieges.some(
      ({ value }) =>
        value.status !== 'resolved' &&
        (value.targetId === villageId || linkedCastles.includes(value.targetId)),
    )
  )
    return true;
  const plot = geography.territories.find(({ value }) => value.id === villageId)?.value;
  const insidePlot = plot ? prepareArea(plot.geometry) : undefined;
  const atVillage = (point: Coordinates | null) =>
    !!point &&
    (insidePlot?.(point) ||
      (point.longitude === city.longitude && point.latitude === city.latitude) ||
      castles.some(
        ({ value }) => value.longitude === point.longitude && value.latitude === point.latitude,
      ));
  return geography.armies.some(
    ({ value }) =>
      atVillage(value.position) ||
      atVillage(value.route?.origin ?? null) ||
      atVillage(value.route?.destination ?? null),
  );
}

/** Changes geographic settlement metadata only; legacy grid, armies and game timers are immutable. */
export function applyVillageRelocation(
  state: VillageRelocationWorld,
  context: VillageRelocationContext,
  coordinates: Coordinates,
  serverTime: number,
): MamlukMapState {
  const status = getVillageRelocationStatus(state, context);
  if (!status.canRelocate) throw new KingdomsHttpError(409, 'لا يمكن نقل هذه القرية الآن.');
  validateCoordinates(coordinates);
  validateTime(serverTime);
  const previous = state.geography!;
  const point = { longitude: coordinates.longitude, latitude: coordinates.latitude };
  if (
    point.longitude < VILLAGE_RELOCATION_BOUNDS.west ||
    point.longitude > VILLAGE_RELOCATION_BOUNDS.east ||
    point.latitude < VILLAGE_RELOCATION_BOUNDS.south ||
    point.latitude > VILLAGE_RELOCATION_BOUNDS.north
  )
    throw new KingdomsHttpError(400, 'الموقع خارج حدود العالم.');
  if (
    (point.longitude === status.longitude && point.latitude === status.latitude) ||
    previous.cities.some(
      ({ value }) =>
        value.id !== context.villageId &&
        value.longitude === point.longitude &&
        value.latitude === point.latitude,
    )
  )
    throw new KingdomsHttpError(409, 'اختر موقعًا مختلفًا غير مستخدم.');
  const cities = previous.cities.map((record) =>
    record.value.id === context.villageId
      ? storeMapRecord(createCity({ ...record.value, ...point, ownerPlayerId: context.actorId }))
      : record,
  );
  const castles = previous.castles.map((record) =>
    record.value.cityId === context.villageId
      ? storeMapRecord(createCastle({ ...record.value, ...point, ownerPlayerId: context.actorId }))
      : record,
  );
  const territories = buildVillageTerritories(context.worldId, cities, state.villages);
  const plotIds = new Set(territories.map(({ value }) => value.id));
  return {
    ...previous,
    cities,
    castles,
    territories,
    villagePlotsVersion: 1,
    omittedVillagePlotIds: Object.keys(state.villages).filter((id) => !plotIds.has(id)),
    villageRelocations: {
      ...previous.villageRelocations,
      [context.villageId]: { actorId: context.actorId, at: serverTime, ...point },
    },
  };
}

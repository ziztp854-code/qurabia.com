import 'server-only';
import { createHash } from 'node:crypto';
import { createCity, validateId } from '@mamluk/world-map-core/server';
import { geographicCitySeeds } from './data';
import { storeMapRecord, type MamlukMapState } from './storage';
import { buildVillageTerritories } from './village-territories';

export const VILLAGE_GEOGRAPHY_SOURCE = 'kingdom-villages-v1' as const;
const MAX_VILLAGES = 100_000;

export interface GeographicVillage {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly buildings: { readonly wall: number };
}
interface VillageWorld {
  readonly villages: Readonly<Record<string, GeographicVillage>>;
  readonly geography?: unknown;
}

/** Assign WGS84 gameplay locations near GeoNames city centres on the server.
 * Existing villages had only grid coordinates, which carry no geographic meaning.
 * Allocation never reads that grid. Once persisted, a village's location never moves.
 */
export function provisionVillageGeography<T extends VillageWorld>(
  worldId: string,
  state: T,
): T & { readonly geography?: MamlukMapState } {
  validateId(worldId);
  const previous = state.geography as MamlukMapState | undefined;
  if (previous !== undefined && previous?.source !== VILLAGE_GEOGRAPHY_SOURCE)
    return state as T & { readonly geography?: MamlukMapState };
  const entries = Object.entries(state.villages);
  entries.forEach(([id, village]) => {
    validateId(id);
    if (!village || village.id !== id) throw new RangeError('Invalid village identity');
  });
  const villages = entries
    .map(([, village]) => village)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (villages.length > MAX_VILLAGES || (previous?.cities.length ?? 0) > MAX_VILLAGES)
    throw new RangeError('Village geography allocation budget exceeded');
  const cities = previous?.cities ?? [];
  const located = new Set(cities.map((record) => record.value.id));
  const missing = villages.filter((village) => !located.has(village.id));
  if (cities.length + missing.length > MAX_VILLAGES)
    throw new RangeError('Village geography allocation budget exceeded');
  const plotted = new Set(previous?.territories.map(({ value }) => value.id) ?? []);
  const omitted = new Set(previous?.omittedVillagePlotIds ?? []);
  const needsPlots =
    previous?.villagePlotsVersion !== 1 ||
    villages.some((village) => !plotted.has(village.id) && !omitted.has(village.id));
  if (previous && missing.length === 0 && !needsPlots)
    return state as T & { readonly geography?: MamlukMapState };
  const occupied = new Set(cities.map(({ value }) => `${value.longitude},${value.latitude}`));
  const added = missing.map((village, index) => {
    validateId(village.id);
    const slot = cities.length + index;
    const centre = geographicCitySeeds[slot % geographicCitySeeds.length]!;
    const point = allocatePoint(worldId, village.id, slot, centre, occupied);
    occupied.add(`${point.longitude},${point.latitude}`);
    return storeMapRecord(
      createCity({
        id: village.id,
        worldId,
        name: village.name,
        ...point,
        regionId: centre.regionId,
        ownerPlayerId: village.ownerId,
        ownerSultanateId: null,
        fortificationLevel: village.buildings.wall,
        strategicValue: 0,
      }),
    );
  });
  const allCities = [...cities, ...added];
  const territories = buildVillageTerritories(worldId, allCities, state.villages);
  const plotIds = new Set(territories.map(({ value }) => value.id));
  const plotMetadata = {
    villagePlotsVersion: 1 as const,
    omittedVillagePlotIds: villages
      .filter((village) => !plotIds.has(village.id))
      .map((village) => village.id),
    territories,
  };
  const geography: MamlukMapState = previous
    ? { ...previous, cities: allCities, ...plotMetadata }
    : {
        version: 1,
        source: VILLAGE_GEOGRAPHY_SOURCE,
        cities: allCities,
        ...plotMetadata,
        castles: [],
        sultanateTerritories: [],
        armies: [],
        sieges: [],
        visibility: [],
      };
  return { ...state, geography };
}

function allocatePoint(
  worldId: string,
  villageId: string,
  slot: number,
  centre: { longitude: number; latitude: number },
  occupied: ReadonlySet<string>,
): { longitude: number; latitude: number } {
  if (slot < geographicCitySeeds.length && !occupied.has(`${centre.longitude},${centre.latitude}`))
    return { longitude: centre.longitude, latitude: centre.latitude };
  for (let attempt = 0; attempt < 32; attempt++) {
    const digest = createHash('sha256').update(`${worldId}:${villageId}:${attempt}`).digest();
    const offset = (value: number) => (value / 0xffffffff - 0.5) * 0.06;
    const longitude = Number((centre.longitude + offset(digest.readUInt32BE(0))).toFixed(6));
    const latitude = Number((centre.latitude + offset(digest.readUInt32BE(4))).toFixed(6));
    if (!occupied.has(`${longitude},${latitude}`)) return { longitude, latitude };
  }
  throw new RangeError('Village geographic collision budget exceeded');
}

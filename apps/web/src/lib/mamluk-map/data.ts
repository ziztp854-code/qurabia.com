import 'server-only';
import type { AreaGeometry, Army, City, VisibilityKind } from '@mamluk/world-map-core';
import { boundsGeometry, createCity, validateArmy } from '@mamluk/world-map-core/server';
import { storeMapRecord, type MamlukMapState } from './storage';

/** City centres from GeoNames (CC BY 4.0). Coordinates are longitude, latitude.
 * https://www.geonames.org/search.html?country=EG (and SY, PS, LB, SA).
 * Strategic values, campaign areas and armies below are fictional gameplay fixtures,
 * not historical claims, political boundaries or an authoritative movement simulation.
 */
export const geographicCitySeeds = Object.freeze([
  { id: 'cairo', name: 'القاهرة', longitude: 31.24967, latitude: 30.06263, regionId: 'egypt' },
  {
    id: 'alexandria',
    name: 'الإسكندرية',
    longitude: 29.91582,
    latitude: 31.20176,
    regionId: 'egypt',
  },
  { id: 'damietta', name: 'دمياط', longitude: 31.81332, latitude: 31.41648, regionId: 'egypt' },
  { id: 'gaza', name: 'غزة', longitude: 34.46672, latitude: 31.50161, regionId: 'levant' },
  { id: 'jerusalem', name: 'القدس', longitude: 35.23388, latitude: 31.78336, regionId: 'levant' },
  { id: 'damascus', name: 'دمشق', longitude: 36.29128, latitude: 33.5102, regionId: 'levant' },
  { id: 'aleppo', name: 'حلب', longitude: 37.16117, latitude: 36.20124, regionId: 'levant' },
  { id: 'homs', name: 'حمص', longitude: 36.72559, latitude: 34.72405, regionId: 'levant' },
  { id: 'hama', name: 'حماة', longitude: 36.75783, latitude: 35.13179, regionId: 'levant' },
  { id: 'tripoli', name: 'طرابلس', longitude: 35.84972, latitude: 34.43667, regionId: 'levant' },
  { id: 'mecca', name: 'مكة المكرمة', longitude: 39.82563, latitude: 21.42664, regionId: 'hejaz' },
  {
    id: 'medina',
    name: 'المدينة المنورة',
    longitude: 39.61417,
    latitude: 24.46861,
    regionId: 'hejaz',
  },
]);

const area = (west: number, south: number, east: number, north: number): AreaGeometry =>
  boundsGeometry({ west, south, east, north });

/** Explicit server-issued campaign observations. Call only in a server seed/admin transaction. */
export function createGeographicCampaign(
  worldId: string,
  viewerId: string,
  enemyId: string,
  now: number,
): MamlukMapState {
  const cities: City[] = geographicCitySeeds.map((city) =>
    createCity({
      ...city,
      worldId,
      ownerPlayerId: city.regionId === 'egypt' ? viewerId : null,
      ownerSultanateId: 'mamluk',
      fortificationLevel: city.id === 'cairo' ? 5 : 2,
      strategicValue: city.id === 'cairo' ? 100 : 40,
    }),
  );
  const egypt = area(29, 27.5, 33.9, 32.1);
  const levant = area(34.1, 31.1, 38, 37.1);
  const hejaz = area(38.8, 20.8, 40.5, 25.1);
  const origin = { longitude: 31.24967, latitude: 30.06263 };
  const destination = { longitude: 34.46672, latitude: 31.50161 };
  const route = {
    origin,
    destination,
    waypoints: [{ longitude: 32.3, latitude: 30.5 }],
    distance: 370000,
    departureTime: now,
    arrivalTime: now + 86_400_000,
  };
  const army: Army = {
    id: 'cairo-guard',
    worldId,
    ownerPlayerId: viewerId,
    ownerSultanateId: 'mamluk',
    route,
    position: {
      armyId: 'cairo-guard',
      longitude: 31.65,
      latitude: 30.3,
      origin,
      destination,
      departureTime: route.departureTime,
      arrivalTime: route.arrivalTime,
      status: 'moving',
    },
  };
  const stationed = (id: string, longitude: number, latitude: number): Army => ({
    id,
    worldId,
    ownerPlayerId: enemyId,
    ownerSultanateId: 'rival',
    route: null,
    position: {
      armyId: id,
      longitude,
      latitude,
      origin: null,
      destination: null,
      departureTime: null,
      arrivalTime: null,
      status: 'stationed',
    },
  });
  const armies = [
    army,
    stationed('enemy-visible', 34.6, 31.6),
    stationed('enemy-hidden', 44.4, 33.3),
  ];
  armies.forEach(validateArmy);
  const grant = (
    id: string,
    kind: VisibilityKind,
    geometry: AreaGeometry,
    visibleTerritoryIds: readonly string[] = [],
    visibleSultanateTerritoryIds: readonly string[] = [],
  ) =>
    storeMapRecord({
      region: {
        id,
        worldId,
        recipientPlayerId: viewerId,
        kind,
        geometry,
        startsAt: now,
        expiresAt: now + 30 * 86_400_000,
      },
      visibleTerritoryIds,
      visibleSultanateTerritoryIds,
    });
  return {
    version: 1,
    cities: cities.map((city) => storeMapRecord(city)),
    castles: [
      {
        ...cities[0]!,
        id: 'cairo-citadel',
        name: 'قلعة القاهرة',
        cityId: 'cairo',
        longitude: 31.2614,
        latitude: 30.0299,
      },
      {
        ...cities[1]!,
        id: 'qaitbay',
        name: 'قلعة قايتباي',
        cityId: 'alexandria',
        longitude: 29.8855,
        latitude: 31.2139,
      },
      {
        ...cities[6]!,
        id: 'aleppo-citadel',
        name: 'قلعة حلب',
        cityId: 'aleppo',
        longitude: 37.1621,
        latitude: 36.1992,
      },
    ].map((castle) => storeMapRecord(castle)),
    territories: [
      storeMapRecord({
        id: 'egypt-campaign',
        worldId,
        regionId: 'egypt',
        geometry: egypt,
        ownerPlayerId: viewerId,
        ownerSultanateId: 'mamluk',
      }),
      storeMapRecord({
        id: 'levant-campaign',
        worldId,
        regionId: 'levant',
        geometry: levant,
        ownerPlayerId: null,
        ownerSultanateId: 'mamluk',
      }),
      storeMapRecord({
        id: 'hejaz-campaign',
        worldId,
        regionId: 'hejaz',
        geometry: hejaz,
        ownerPlayerId: null,
        ownerSultanateId: 'mamluk',
      }),
    ],
    sultanateTerritories: [
      storeMapRecord({
        id: 'mamluk-campaign-border',
        worldId,
        sultanateId: 'mamluk',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [egypt, levant, hejaz].flatMap((value) =>
            value.type === 'Polygon' ? [value.coordinates] : value.coordinates,
          ),
        },
      }),
    ],
    armies: armies.map((value) => storeMapRecord(value)),
    sieges: [
      storeMapRecord({
        id: 'gaza-siege',
        worldId,
        targetId: 'gaza',
        targetKind: 'city',
        longitude: 34.42,
        latitude: 31.46,
        status: 'active',
        attackerPlayerId: viewerId,
        defenderPlayerId: enemyId,
      }),
    ],
    visibility: [
      grant('egypt-vision', 'territory', egypt, ['egypt-campaign'], ['mamluk-campaign-border']),
      grant('sinai-watch', 'watchtower', area(32.9, 29.5, 35.3, 32.3)),
      grant('levant-scouts', 'scouting', levant, ['levant-campaign']),
      grant('hejaz-alliance', 'alliance', hejaz, ['hejaz-campaign']),
    ],
  };
}

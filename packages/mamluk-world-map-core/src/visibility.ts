import type { AreaGeometry } from './geojson';
import type {
  ArmyStatus,
  ArmyRoute,
  BoundingBox,
  Castle,
  City,
  Coordinates,
  Ownership,
  SiegeStatus,
  SultanateTerritory,
  Territory,
  VisibilityKind,
} from './models';
import type { MapReadSnapshot, VisibilitySnapshot, WorldMapBatch } from './queries';
import { clipArea, containsPoint, prepareArea, validateBounds } from './spatial';
import {
  createArmyRoute,
  createCastle,
  createCity,
  validateArmy,
  validateId,
  validateOwnership,
  validateTime,
} from './validation';
import { freezeDto } from './immutable';

export interface VisibleArmy extends Coordinates, Ownership {
  readonly id: string;
  readonly status: ArmyStatus;
  readonly own: boolean;
}
export interface VisibleRoute {
  readonly armyId: string;
  readonly route: ArmyRoute;
}
export interface VisibleSiege extends Coordinates {
  readonly id: string;
  readonly targetId: string;
  readonly targetKind: 'city' | 'castle';
  readonly status: SiegeStatus;
}
export interface VisibleArea {
  readonly kind: VisibilityKind;
  readonly geometry: AreaGeometry;
}
declare const visibilityFiltered: unique symbol;
/** Builders require a result produced by VisibilityFilter; raw world records are not accepted. */
export interface VisibleWorld {
  readonly [visibilityFiltered]: true;
  readonly cities: readonly City[];
  readonly castles: readonly Castle[];
  readonly territories: readonly Territory[];
  readonly sultanateTerritories: readonly SultanateTerritory[];
  readonly armies: readonly VisibleArmy[];
  readonly routes: readonly VisibleRoute[];
  readonly sieges: readonly VisibleSiege[];
  readonly visibility: readonly VisibleArea[];
  readonly bounds: BoundingBox;
  readonly expiresAt: number;
}
const filteredResults = new WeakSet<object>();

export function assertVisibleWorld(value: VisibleWorld): void {
  if (!filteredResults.has(value))
    throw new TypeError('GeoJSON requires a visibility-filtered snapshot');
}

function activeAreas(grants: VisibilitySnapshot, snapshot: MapReadSnapshot, bounds: BoundingBox) {
  return grants.regions.flatMap((region) => {
    if (region.worldId !== snapshot.worldId || region.recipientPlayerId !== snapshot.viewerPlayerId)
      return [];
    validateTime(region.startsAt);
    validateTime(region.expiresAt);
    if (region.startsAt > snapshot.serverTime || region.expiresAt <= snapshot.serverTime) return [];
    if (!['territory', 'watchtower', 'scouting', 'alliance'].includes(region.kind))
      throw new RangeError('Invalid visibility kind');
    const geometry = clipArea(region.geometry, bounds);
    return geometry === null ? [] : [{ kind: region.kind, geometry, expiresAt: region.expiresAt }];
  });
}

function visibleCities(
  cities: readonly City[],
  snapshot: MapReadSnapshot,
  bounds: BoundingBox,
  isVisible: (point: Coordinates) => boolean,
): readonly City[] {
  return cities
    .filter(
      (city) =>
        city.worldId === snapshot.worldId &&
        containsPoint(bounds, city) &&
        (city.ownerPlayerId === snapshot.viewerPlayerId || isVisible(city)),
    )
    .map(createCity);
}

function visibleCastles(
  castles: readonly Castle[],
  snapshot: MapReadSnapshot,
  bounds: BoundingBox,
  isVisible: (point: Coordinates) => boolean,
): readonly Castle[] {
  return castles
    .filter(
      (castle) =>
        castle.worldId === snapshot.worldId &&
        containsPoint(bounds, castle) &&
        (castle.ownerPlayerId === snapshot.viewerPlayerId || isVisible(castle)),
    )
    .map(createCastle);
}

function visibleTerritories(
  batch: WorldMapBatch,
  grants: VisibilitySnapshot,
  snapshot: MapReadSnapshot,
  bounds: BoundingBox,
) {
  const ids = new Set(grants.visibleTerritoryIds);
  return batch.territories.flatMap((territory) => {
    if (territory.worldId !== snapshot.worldId || !ids.has(territory.id)) return [];
    validateId(territory.id);
    validateId(territory.regionId);
    validateOwnership(territory);
    const geometry = clipArea(territory.geometry, bounds);
    return geometry === null
      ? []
      : [
          {
            id: territory.id,
            worldId: territory.worldId,
            regionId: territory.regionId,
            ownerPlayerId: territory.ownerPlayerId,
            ownerSultanateId: territory.ownerSultanateId,
            geometry,
          },
        ];
  });
}

function visibleBorders(
  batch: WorldMapBatch,
  grants: VisibilitySnapshot,
  snapshot: MapReadSnapshot,
  bounds: BoundingBox,
) {
  const ids = new Set(grants.visibleSultanateTerritoryIds);
  return batch.sultanateTerritories.flatMap((territory) => {
    if (territory.worldId !== snapshot.worldId || !ids.has(territory.id)) return [];
    validateId(territory.id);
    validateId(territory.sultanateId);
    const geometry = clipArea(territory.geometry, bounds);
    return geometry === null
      ? []
      : [
          {
            id: territory.id,
            worldId: territory.worldId,
            sultanateId: territory.sultanateId,
            geometry,
          },
        ];
  });
}

function visibleArmies(
  batch: WorldMapBatch,
  snapshot: MapReadSnapshot,
  bounds: BoundingBox,
  isVisible: (point: Coordinates) => boolean,
) {
  const armies = batch.armies.filter(
    (army) =>
      army.worldId === snapshot.worldId &&
      containsPoint(bounds, army.position) &&
      (army.ownerPlayerId === snapshot.viewerPlayerId || isVisible(army.position)),
  );
  armies.forEach(validateArmy);
  return {
    armies: armies.map((army): VisibleArmy =>
      Object.freeze({
        id: army.id,
        longitude: army.position.longitude,
        latitude: army.position.latitude,
        ownerPlayerId: army.ownerPlayerId,
        ownerSultanateId: army.ownerSultanateId,
        status: army.position.status,
        own: army.ownerPlayerId === snapshot.viewerPlayerId,
      }),
    ),
    routes: armies.flatMap((army) =>
      army.ownerPlayerId === snapshot.viewerPlayerId && army.route !== null
        ? [{ armyId: army.id, route: createArmyRoute(army.route) }]
        : [],
    ),
  };
}

function visibleSieges(
  batch: WorldMapBatch,
  snapshot: MapReadSnapshot,
  bounds: BoundingBox,
  isVisible: (point: Coordinates) => boolean,
): readonly VisibleSiege[] {
  return batch.sieges
    .filter(
      (siege) =>
        siege.worldId === snapshot.worldId && containsPoint(bounds, siege) && isVisible(siege),
    )
    .map((siege) => {
      validateId(siege.id);
      validateId(siege.targetId);
      if (
        !['preparing', 'active', 'resolved'].includes(siege.status) ||
        !['city', 'castle'].includes(siege.targetKind)
      )
        throw new RangeError('Invalid siege marker');
      return Object.freeze({
        id: siege.id,
        targetId: siege.targetId,
        targetKind: siege.targetKind,
        longitude: siege.longitude,
        latitude: siege.latitude,
        status: siege.status,
      });
    });
}

export class VisibilityFilter {
  filter(
    batch: WorldMapBatch,
    grants: VisibilitySnapshot,
    snapshot: MapReadSnapshot,
    bounds: BoundingBox,
  ): VisibleWorld {
    validateBounds(bounds);
    validateId(snapshot.worldId);
    validateId(snapshot.viewerPlayerId);
    validateTime(snapshot.serverTime);
    validateTime(snapshot.validUntil);
    if (snapshot.validUntil <= snapshot.serverTime) throw new RangeError('Expired map snapshot');
    const areas = activeAreas(grants, snapshot, bounds);
    const prepared = areas.map((area) => prepareArea(area.geometry));
    const isVisible = (point: Coordinates) => prepared.some((contains) => contains(point));
    const safe = {
      cities: visibleCities(batch.cities, snapshot, bounds, isVisible),
      castles: visibleCastles(batch.castles, snapshot, bounds, isVisible),
      territories: visibleTerritories(batch, grants, snapshot, bounds),
      sultanateTerritories: visibleBorders(batch, grants, snapshot, bounds),
      ...visibleArmies(batch, snapshot, bounds, isVisible),
      sieges: visibleSieges(batch, snapshot, bounds, isVisible),
      visibility: areas.map((area) => ({ kind: area.kind, geometry: area.geometry })),
      bounds: Object.freeze({ ...bounds }),
      expiresAt: Math.min(snapshot.validUntil, ...areas.map((area) => area.expiresAt)),
    };
    // The private token cannot be supplied by a raw repository record or by a browser.
    const result = freezeDto(safe) as unknown as VisibleWorld;
    filteredResults.add(result);
    return result;
  }
}

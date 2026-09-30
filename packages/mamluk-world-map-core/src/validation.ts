import type { Army, ArmyPosition, ArmyRoute, Castle, City, Ownership, Territory } from './models';
import { freezeDto } from './immutable';
import { coordinates, validateArea, validateCoordinates } from './spatial';

export function validateId(value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
    throw new RangeError('Invalid map identifier');
  }
}

export function validateTime(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid server timestamp');
}

export function validateOwnership(value: Ownership): void {
  if (value.ownerPlayerId !== null) validateId(value.ownerPlayerId);
  if (value.ownerSultanateId !== null) validateId(value.ownerSultanateId);
}

export function createCity(value: City): City {
  validateId(value.id);
  validateId(value.worldId);
  validateId(value.regionId);
  validateOwnership(value);
  validateCoordinates(value);
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 256) {
    throw new RangeError('Invalid city name');
  }
  if (
    !Number.isSafeInteger(value.fortificationLevel) ||
    value.fortificationLevel < 0 ||
    !Number.isFinite(value.strategicValue) ||
    value.strategicValue < 0
  ) {
    throw new RangeError('Invalid city attributes');
  }
  return Object.freeze({
    id: value.id,
    worldId: value.worldId,
    name: value.name,
    regionId: value.regionId,
    longitude: value.longitude,
    latitude: value.latitude,
    ownerPlayerId: value.ownerPlayerId,
    ownerSultanateId: value.ownerSultanateId,
    fortificationLevel: value.fortificationLevel,
    strategicValue: value.strategicValue,
  });
}

function validateSchedule(departure: number, arrival: number): void {
  validateTime(departure);
  validateTime(arrival);
  if (arrival <= departure) throw new RangeError('Arrival must follow departure');
}

export function createArmyRoute(value: ArmyRoute): ArmyRoute {
  if (!Array.isArray(value.waypoints) || value.waypoints.length > 10000)
    throw new RangeError('Route exceeds waypoint limit');
  validateCoordinates(value.origin);
  validateCoordinates(value.destination);
  validateSchedule(value.departureTime, value.arrivalTime);
  if (!Number.isFinite(value.distance) || value.distance < 0)
    throw new RangeError('Invalid route distance');
  const waypoints = value.waypoints.map((point) => coordinates(point.longitude, point.latitude));
  return Object.freeze({
    origin: coordinates(value.origin.longitude, value.origin.latitude),
    destination: coordinates(value.destination.longitude, value.destination.latitude),
    waypoints: Object.freeze(waypoints),
    distance: value.distance,
    departureTime: value.departureTime,
    arrivalTime: value.arrivalTime,
  });
}

export function createArmyPosition(value: ArmyPosition): ArmyPosition {
  validateId(value.armyId);
  validateCoordinates(value);
  if (!['stationed', 'moving', 'besieging', 'retreating'].includes(value.status)) {
    throw new RangeError('Invalid army status');
  }
  const traveling = value.status === 'moving' || value.status === 'retreating';
  if (traveling) {
    if (
      value.origin === null ||
      value.destination === null ||
      value.departureTime === null ||
      value.arrivalTime === null
    ) {
      throw new RangeError('Traveling armies require an authoritative plan');
    }
    validateCoordinates(value.origin);
    validateCoordinates(value.destination);
    validateSchedule(value.departureTime, value.arrivalTime);
  } else if (
    value.origin !== null ||
    value.destination !== null ||
    value.departureTime !== null ||
    value.arrivalTime !== null
  ) {
    throw new RangeError('Non-traveling armies cannot have a travel plan');
  }
  return Object.freeze({
    armyId: value.armyId,
    longitude: value.longitude,
    latitude: value.latitude,
    status: value.status,
    origin:
      value.origin === null ? null : coordinates(value.origin.longitude, value.origin.latitude),
    destination:
      value.destination === null
        ? null
        : coordinates(value.destination.longitude, value.destination.latitude),
    departureTime: value.departureTime,
    arrivalTime: value.arrivalTime,
  });
}

export function validateArmy(army: Army): void {
  validateId(army.id);
  validateId(army.worldId);
  validateOwnership(army);
  const position = createArmyPosition(army.position);
  if (army.id !== position.armyId) throw new RangeError('Army identity mismatch');
  const traveling = position.status === 'moving' || position.status === 'retreating';
  if (traveling !== (army.route !== null)) throw new RangeError('Army route state mismatch');
  if (army.route === null) return;
  const route = createArmyRoute(army.route);
  if (
    route.departureTime !== position.departureTime ||
    route.arrivalTime !== position.arrivalTime ||
    route.origin.longitude !== position.origin?.longitude ||
    route.origin.latitude !== position.origin?.latitude ||
    route.destination.longitude !== position.destination?.longitude ||
    route.destination.latitude !== position.destination?.latitude
  ) {
    throw new RangeError('Army route plan mismatch');
  }
}

/** Server-only ownership transition; authorization and game rules belong to the calling engine. */
export function withTerritoryOwnership(territory: Territory, ownership: Ownership): Territory {
  validateId(territory.id);
  validateId(territory.worldId);
  validateId(territory.regionId);
  validateArea(territory.geometry);
  validateOwnership(ownership);
  return freezeDto({
    id: territory.id,
    worldId: territory.worldId,
    regionId: territory.regionId,
    geometry: structuredClone(territory.geometry),
    ownerPlayerId: ownership.ownerPlayerId,
    ownerSultanateId: ownership.ownerSultanateId,
  });
}

export function createCastle(value: Castle): Castle {
  const city = createCity(value);
  if (value.cityId !== null) validateId(value.cityId);
  return Object.freeze({ ...city, cityId: value.cityId });
}

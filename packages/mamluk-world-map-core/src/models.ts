import type { AreaGeometry } from './geojson';

export interface Coordinates {
  readonly longitude: number;
  readonly latitude: number;
}
/** west > east crosses the antimeridian. Zero-area bounds are invalid. */
export interface BoundingBox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}
export interface WorldMap {
  readonly id: string;
  readonly name: string;
  readonly coordinateSystem: 'EPSG:4326';
}
export interface Region {
  readonly id: string;
  readonly worldId: string;
  readonly name: string;
  readonly geometry: AreaGeometry;
}
export interface Ownership {
  readonly ownerPlayerId: string | null;
  readonly ownerSultanateId: string | null;
}
export interface Territory extends Ownership {
  readonly id: string;
  readonly worldId: string;
  readonly regionId: string;
  readonly geometry: AreaGeometry;
}
export interface VillageMapDetails {
  /** Owner-only, current building levels. Visual placement is illustrative, never a saved layout. */
  readonly villageBuildings?: string | null;
  readonly villageLevel?: number | null;
  readonly villageRank?: string | null;
  readonly villagePower?: number | null;
  readonly villageVisualTier?: number | null;
  /** POPULATION_DATA_NOT_AVAILABLE: no population exists in the game state. */
  readonly population?: null;
  readonly constructionStatus?: 'BUILDING' | 'IDLE' | null;
  readonly kingdomName?: string;
  readonly allianceName?: string | null;
}
export interface City extends Coordinates, Ownership, VillageMapDetails {
  readonly id: string;
  readonly worldId: string;
  readonly name: string;
  readonly regionId: string;
  readonly fortificationLevel: number;
  readonly strategicValue: number;
}
export interface Castle extends City {
  readonly cityId: string | null;
}
export type ArmyStatus = 'stationed' | 'moving' | 'besieging' | 'retreating';
/** All values, including current position, are supplied by the authoritative engine. Epoch milliseconds. */
export interface ArmyPosition extends Coordinates {
  readonly armyId: string;
  readonly origin: Coordinates | null;
  readonly destination: Coordinates | null;
  readonly departureTime: number | null;
  readonly arrivalTime: number | null;
  readonly status: ArmyStatus;
}
export type ArmyMission =
  | 'attack'
  | 'raid'
  | 'scout'
  | 'reinforce'
  | 'settle'
  | 'occupy'
  | 'gather'
  | 'intercept'
  | 'return'
  | 'transport';
export const armyMissions: readonly ArmyMission[] = [
  'attack',
  'raid',
  'scout',
  'reinforce',
  'settle',
  'occupy',
  'gather',
  'intercept',
  'return',
  'transport',
];
export interface ArmyRoute {
  /** Owner-authorized mission; omitted by legacy records. */
  readonly mission?: ArmyMission;
  readonly origin: Coordinates;
  readonly destination: Coordinates;
  readonly waypoints: readonly Coordinates[];
  /** Authoritative distance; legacy records use metres. Never inferred from a basemap. */
  readonly distance: number;
  readonly distanceUnit?: 'metres' | 'tiles';
  readonly departureTime: number;
  readonly arrivalTime: number;
}
export interface Army extends Ownership {
  readonly id: string;
  readonly worldId: string;
  readonly position: ArmyPosition;
  readonly route: ArmyRoute | null;
}
export interface SultanateTerritory {
  readonly id: string;
  readonly worldId: string;
  readonly sultanateId: string;
  readonly geometry: AreaGeometry;
}
export type SiegeStatus = 'preparing' | 'active' | 'resolved';
export interface SiegeMarker extends Coordinates {
  readonly id: string;
  readonly worldId: string;
  readonly targetId: string;
  readonly targetKind: 'city' | 'castle';
  readonly status: SiegeStatus;
  readonly attackerPlayerId: string;
  readonly defenderPlayerId: string | null;
}
export type VisibilityKind = 'territory' | 'watchtower' | 'scouting' | 'alliance';
/** Server-issued directional grant. Alliance membership alone is insufficient. */
export interface VisibilityRegion {
  readonly id: string;
  readonly worldId: string;
  readonly recipientPlayerId: string;
  readonly kind: VisibilityKind;
  readonly geometry: AreaGeometry;
  readonly startsAt: number;
  readonly expiresAt: number;
}

import type {
  Army,
  BoundingBox,
  Castle,
  City,
  SiegeMarker,
  SultanateTerritory,
  Territory,
  VisibilityRegion,
} from './models';

export interface AuthenticatedMapViewer {
  readonly playerId: string;
}
export interface ViewportRequest {
  readonly worldId: string;
  readonly bounds: BoundingBox;
}
export interface SpatialQuery {
  readonly bounds: BoundingBox;
  readonly limit: number;
}
export interface MapReadSnapshot {
  readonly worldId: string;
  readonly viewerPlayerId: string;
  /** Monotonic decimal world revision, safe beyond JS number precision. */
  readonly revision: string;
  readonly serverTime: number;
  readonly validUntil: number;
}
export interface VisibilitySnapshot {
  readonly regions: readonly VisibilityRegion[];
  /** Explicit server authorization for complete ownership-bearing polygon features. */
  readonly visibleTerritoryIds: readonly string[];
  readonly visibleSultanateTerritoryIds: readonly string[];
}
export interface SpatialWorldQueries {
  getTerritoriesInBounds(query: SpatialQuery): Promise<readonly Territory[]>;
  getCitiesInBounds(query: SpatialQuery): Promise<readonly City[]>;
  /** DB should prefilter by viewer visibility AND bounds; the service checks again before serialization. */
  getVisibleArmiesInBounds(query: SpatialQuery): Promise<readonly Army[]>;
  getCastlesInBounds(query: SpatialQuery): Promise<readonly Castle[]>;
  getSultanateTerritoriesInBounds(query: SpatialQuery): Promise<readonly SultanateTerritory[]>;
  getSiegesInBounds(query: SpatialQuery): Promise<readonly SiegeMarker[]>;
  getVisibilityInBounds(query: SpatialQuery): Promise<VisibilitySnapshot>;
}
export interface WorldMapReadSession extends SpatialWorldQueries {
  readonly snapshot: MapReadSnapshot;
}
export interface WorldMapRepository {
  /** Authorize world access and bind ALL reads to one consistent engine/DB snapshot, including grants. */
  withSnapshot<T>(
    worldId: string,
    viewer: AuthenticatedMapViewer,
    read: (session: WorldMapReadSession) => Promise<T>,
  ): Promise<T>;
}
export interface WorldMapBatch {
  readonly territories: readonly Territory[];
  readonly cities: readonly City[];
  readonly armies: readonly Army[];
  readonly castles: readonly Castle[];
  readonly sultanateTerritories: readonly SultanateTerritory[];
  readonly sieges: readonly SiegeMarker[];
}

import { GeoJsonProjection } from './builders';
import type { BoundingBox } from './models';
import type { MapPayload } from './presentation';
import type {
  AuthenticatedMapViewer,
  MapReadSnapshot,
  SpatialQuery,
  ViewportRequest,
  VisibilitySnapshot,
  WorldMapBatch,
  WorldMapRepository,
  WorldMapReadSession,
} from './queries';
import { validateBounds } from './spatial';
import { validateId, validateTime } from './validation';
import { VisibilityFilter } from './visibility';
import { parseMapPayload } from './payload';

export interface MapQueryLimits {
  readonly maxLongitudeSpan: number;
  readonly maxLatitudeSpan: number;
  readonly maxEntities: number;
  readonly maxVertices: number;
  readonly maxVisibilityRegions: number;
  readonly maxPayloadBytes: number;
  readonly ttlMs: number;
}
export const DEFAULT_MAP_QUERY_LIMITS: MapQueryLimits = Object.freeze({
  maxLongitudeSpan: 90,
  maxLatitudeSpan: 90,
  maxEntities: 2000,
  maxVertices: 20000,
  maxVisibilityRegions: 128,
  maxPayloadBytes: 1000000,
  ttlMs: 15000,
});

/** Safe for HTTP mapping: never includes IDs, counts, query cursors or repository errors. */
export class MapQueryError extends Error {
  constructor(cause?: unknown) {
    super('Map viewport unavailable', { cause });
    this.name = 'MapQueryError';
  }
}

function assertViewport(bounds: BoundingBox, limits: MapQueryLimits): void {
  validateBounds(bounds);
  const width =
    bounds.west < bounds.east ? bounds.east - bounds.west : 360 - bounds.west + bounds.east;
  if (width > limits.maxLongitudeSpan || bounds.north - bounds.south > limits.maxLatitudeSpan)
    throw new MapQueryError();
}

function assertSnapshot(
  snapshot: MapReadSnapshot,
  request: ViewportRequest,
  viewer: AuthenticatedMapViewer,
): void {
  if (
    snapshot.worldId !== request.worldId ||
    snapshot.viewerPlayerId !== viewer.playerId ||
    typeof snapshot.revision !== 'string' ||
    !/^(0|[1-9]\d{0,79})$/.test(snapshot.revision)
  )
    throw new MapQueryError();
  validateTime(snapshot.serverTime);
  validateTime(snapshot.validUntil);
  if (snapshot.validUntil <= snapshot.serverTime) throw new MapQueryError();
}

function countVertices(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number') return 1;
  return value.reduce((total: number, nested: unknown) => total + countVertices(nested), 0);
}

function assertBudgets(
  batch: WorldMapBatch,
  visibility: VisibilitySnapshot,
  limits: MapQueryLimits,
): void {
  const lists = [
    batch.cities,
    batch.castles,
    batch.armies,
    batch.territories,
    batch.sultanateTerritories,
    batch.sieges,
  ];
  if (
    lists.reduce((total, values) => total + values.length, 0) > limits.maxEntities ||
    visibility.regions.length > limits.maxVisibilityRegions ||
    visibility.visibleTerritoryIds.length + visibility.visibleSultanateTerritoryIds.length >
      limits.maxEntities
  )
    throw new MapQueryError();
  const shapes = [...batch.territories, ...batch.sultanateTerritories, ...visibility.regions];
  const vertices =
    shapes.reduce((total, shape) => total + countVertices(shape.geometry.coordinates), 0) +
    batch.armies.reduce((total, army) => total + (army.route?.waypoints.length ?? 0) + 3, 0);
  if (vertices > limits.maxVertices) throw new MapQueryError();
}

async function readBatch(
  session: WorldMapReadSession,
  query: SpatialQuery,
): Promise<WorldMapBatch> {
  // Sequential reads also work with DB drivers that prohibit concurrent queries in one transaction.
  return {
    cities: await session.getCitiesInBounds(query),
    castles: await session.getCastlesInBounds(query),
    territories: await session.getTerritoriesInBounds(query),
    armies: await session.getVisibleArmiesInBounds(query),
    sultanateTerritories: await session.getSultanateTerritoriesInBounds(query),
    sieges: await session.getSiegesInBounds(query),
  };
}

export class WorldMapService {
  private readonly limits: MapQueryLimits;
  constructor(
    private readonly repository: WorldMapRepository,
    limits: Partial<MapQueryLimits> = {},
    private readonly reportError?: (error: unknown) => void,
  ) {
    this.limits = Object.freeze({ ...DEFAULT_MAP_QUERY_LIMITS, ...limits });
    if (
      Object.values(this.limits).some((value) => !Number.isSafeInteger(value) || value <= 0) ||
      this.limits.maxLongitudeSpan > 360 ||
      this.limits.maxLatitudeSpan > 180
    )
      throw new RangeError('Invalid map query limits');
  }

  async getViewport(request: ViewportRequest, viewer: AuthenticatedMapViewer): Promise<MapPayload> {
    try {
      validateId(request.worldId);
      validateId(viewer.playerId);
      assertViewport(request.bounds, this.limits);
      // Copy input before any asynchronous boundary: caller changes cannot alter authorization or bounds.
      const safeRequest = Object.freeze({
        worldId: request.worldId,
        bounds: Object.freeze({ ...request.bounds }),
      });
      const safeViewer = Object.freeze({ playerId: viewer.playerId });
      return await this.repository.withSnapshot(safeRequest.worldId, safeViewer, async (session) =>
        this.project(session, safeRequest, safeViewer),
      );
    } catch (error) {
      try {
        this.reportError?.(error);
      } finally {
        throw new MapQueryError(error);
      }
    }
  }

  private async project(
    session: WorldMapReadSession,
    request: ViewportRequest,
    viewer: AuthenticatedMapViewer,
  ): Promise<MapPayload> {
    assertSnapshot(session.snapshot, request, viewer);
    const snapshot = Object.freeze({
      ...session.snapshot,
      validUntil: Math.min(
        session.snapshot.validUntil,
        session.snapshot.serverTime + this.limits.ttlMs,
      ),
    });
    const query = Object.freeze({ bounds: request.bounds, limit: this.limits.maxEntities + 1 });
    const visibilityQuery = Object.freeze({
      bounds: request.bounds,
      limit: this.limits.maxVisibilityRegions + 1,
    });
    const grants = await session.getVisibilityInBounds(visibilityQuery);
    const batch = await readBatch(session, query);
    assertBudgets(batch, grants, this.limits);
    const visible = new VisibilityFilter().filter(batch, grants, snapshot, request.bounds);
    const payload: MapPayload = {
      schemaVersion: 1,
      worldId: snapshot.worldId,
      revision: snapshot.revision,
      serverTime: snapshot.serverTime,
      expiresAt: visible.expiresAt,
      bounds: request.bounds,
      layers: new GeoJsonProjection().build(visible),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    if (bytes > this.limits.maxPayloadBytes) throw new MapQueryError();
    return parseMapPayload(payload);
  }
}

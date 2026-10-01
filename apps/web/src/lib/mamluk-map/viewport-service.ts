import 'server-only';
import type { MapPayload, FeatureCollection } from '@mamluk/world-map-core';
import { parseMapPayload } from '@mamluk/world-map-core';
import {
  boundsGeometry,
  DEFAULT_MAP_QUERY_LIMITS,
  GeoJsonProjection,
  MapQueryError,
  validateBounds,
  validateId,
  VisibilityFilter,
  WorldMapService,
  type AuthenticatedMapViewer,
  type MapQueryLimits,
  type ViewportRequest,
  type WorldMapReadSession,
  type WorldMapRepository,
} from '@mamluk/world-map-core/server';
import type { PublicVillageReadSession } from './repository';

function publicSettlements(session: WorldMapReadSession): session is PublicVillageReadSession {
  const candidate = session as Partial<PublicVillageReadSession>;
  return (
    candidate.settlementsPublic === true &&
    typeof candidate.getPublicVillageCitiesInBounds === 'function' &&
    typeof candidate.getPublicVillageTerritoriesInBounds === 'function'
  );
}
function vertices(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number') return 1;
  return value.reduce((sum: number, nested: unknown) => sum + vertices(nested), 0);
}
function assertCombinedBudget(payload: MapPayload, limits: MapQueryLimits): void {
  const { cities, territories, castles, armies, sultanateBorders, sieges } = payload.layers;
  const count = [cities, territories, castles, armies, sultanateBorders, sieges].reduce(
    (sum, layer) => sum + layer.features.length,
    0,
  );
  const vertexCount = (Object.values(payload.layers) as FeatureCollection[]).reduce(
    (sum, layer) =>
      sum +
      layer.features.reduce((total, feature) => total + vertices(feature.geometry.coordinates), 0),
    0,
  );
  if (
    count > limits.maxEntities ||
    vertexCount > limits.maxVertices ||
    new TextEncoder().encode(JSON.stringify(payload)).byteLength > limits.maxPayloadBytes
  )
    throw new MapQueryError();
}

/** Public village locations are a distinct server policy, never a grant for private intelligence.
 * Both batches read the same authorized repository session and revision. Only the
 * public cities/plots replace private presentation layers; fog and military layers
 * remain exactly those produced by the accepted WorldMapService.
 */
export class MamlukViewportService {
  private readonly limits: MapQueryLimits;
  constructor(
    private readonly repository: WorldMapRepository,
    limits: Partial<MapQueryLimits> = {},
  ) {
    new WorldMapService(repository, limits); // Reuse the accepted limits validation.
    this.limits = Object.freeze({ ...DEFAULT_MAP_QUERY_LIMITS, ...limits });
  }
  async getViewport(request: ViewportRequest, viewer: AuthenticatedMapViewer): Promise<MapPayload> {
    try {
      validateId(request.worldId);
      validateId(viewer.playerId);
      validateBounds(request.bounds);
      const safeRequest = Object.freeze({
        worldId: request.worldId,
        bounds: Object.freeze({ ...request.bounds }),
      });
      const safeViewer = Object.freeze({ playerId: viewer.playerId });
      return await this.repository.withSnapshot(
        safeRequest.worldId,
        safeViewer,
        async (session) => {
          const boundRepository: WorldMapRepository = {
            withSnapshot: async (worldId, recipient, read) => {
              if (worldId !== safeRequest.worldId || recipient.playerId !== safeViewer.playerId)
                throw new MapQueryError();
              return read(session);
            },
          };
          const privatePayload = await new WorldMapService(
            boundRepository,
            this.limits,
          ).getViewport(safeRequest, safeViewer);
          if (!publicSettlements(session)) return privatePayload;
          return this.projectSettlements(session, safeRequest, privatePayload);
        },
      );
    } catch (error) {
      if (error instanceof MapQueryError) throw error;
      throw new MapQueryError(error);
    }
  }
  private async projectSettlements(
    session: PublicVillageReadSession,
    request: ViewportRequest,
    privatePayload: MapPayload,
  ): Promise<MapPayload> {
    const query = Object.freeze({ bounds: request.bounds, limit: this.limits.maxEntities + 1 });
    const cities = await session.getPublicVillageCitiesInBounds(query);
    const territories = await session.getPublicVillageTerritoriesInBounds(query);
    if (
      cities.length + territories.length > this.limits.maxEntities ||
      territories.reduce((sum, plot) => sum + vertices(plot.geometry.coordinates), 0) >
        this.limits.maxVertices
    )
      throw new MapQueryError();
    const snapshot = Object.freeze({ ...session.snapshot, validUntil: privatePayload.expiresAt });
    const publicGrant = {
      regions: [
        {
          id: 'public-village-viewport',
          worldId: snapshot.worldId,
          recipientPlayerId: snapshot.viewerPlayerId,
          kind: 'territory' as const,
          geometry: boundsGeometry(request.bounds),
          startsAt: snapshot.serverTime,
          expiresAt: snapshot.validUntil,
        },
      ],
      visibleTerritoryIds: territories.map((plot) => plot.id),
      visibleSultanateTerritoryIds: [],
    };
    // Literal empty military collections are critical: this grant cannot authorize any intelligence.
    const visible = new VisibilityFilter().filter(
      { cities, territories, armies: [], castles: [], sultanateTerritories: [], sieges: [] },
      publicGrant,
      snapshot,
      request.bounds,
    );
    const projection = new GeoJsonProjection().build(visible);
    const payload: MapPayload = {
      ...privatePayload,
      layers: {
        ...privatePayload.layers,
        cities: projection.cities,
        territories: projection.territories,
      },
    };
    assertCombinedBudget(payload, this.limits);
    return parseMapPayload(payload);
  }
}

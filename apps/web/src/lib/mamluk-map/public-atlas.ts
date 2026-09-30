import 'server-only';
import type {
  AuthenticatedMapViewer,
  City,
  MapReadSnapshot,
  SpatialQuery,
  VisibilitySnapshot,
  WorldMapReadSession,
  WorldMapRepository,
} from '@mamluk/world-map-core/server';
import {
  boundsGeometry,
  containsPoint,
  createCity,
  validateBounds,
  validateId,
  validateTime,
} from '@mamluk/world-map-core/server';
import { KingdomsHttpError } from '../kingdoms/http';
import { geographicCitySeeds } from './data';

/** Reserved endpoint namespace: never resolves to a persisted game campaign. */
export const PUBLIC_ATLAS_WORLD = Object.freeze({
  id: 'mamluk-public-geographic-atlas-v1',
  name: 'أطلس المدن — مرجع جغرافي',
});
/** Presentation audience for public landmarks; not a persisted user/account. */
export const PUBLIC_ATLAS_VIEWER_ID = 'public-geographic-reference-audience';

// Only public GeoNames landmarks are projected. Neutral fields satisfy the existing
// City wire contract; the reference UI never presents them as gameplay knowledge.
const publicLandmarks: readonly City[] = Object.freeze(
  geographicCitySeeds.map((city) =>
    createCity({
      ...city,
      worldId: PUBLIC_ATLAS_WORLD.id,
      ownerPlayerId: null,
      ownerSultanateId: null,
      fortificationLevel: 0,
      strategicValue: 0,
    }),
  ),
);
const empty = Object.freeze([]);

class PublicAtlasReadSession implements WorldMapReadSession {
  private active = true;
  constructor(readonly snapshot: MapReadSnapshot) {}
  close(): void {
    this.active = false;
  }
  private check(query: SpatialQuery): void {
    if (!this.active) throw new Error('Geographic read session has ended');
    validateBounds(query.bounds);
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 10001)
      throw new RangeError('Invalid geographic query limit');
  }
  async getCitiesInBounds(query: SpatialQuery): Promise<readonly City[]> {
    this.check(query);
    return Object.freeze(
      publicLandmarks.filter((city) => containsPoint(query.bounds, city)).slice(0, query.limit),
    );
  }
  async getTerritoriesInBounds(query: SpatialQuery) {
    this.check(query);
    return empty;
  }
  async getVisibleArmiesInBounds(query: SpatialQuery) {
    this.check(query);
    return empty;
  }
  async getCastlesInBounds(query: SpatialQuery) {
    this.check(query);
    return empty;
  }
  async getSultanateTerritoriesInBounds(query: SpatialQuery) {
    this.check(query);
    return empty;
  }
  async getSiegesInBounds(query: SpatialQuery) {
    this.check(query);
    return empty;
  }
  async getVisibilityInBounds(query: SpatialQuery): Promise<VisibilitySnapshot> {
    this.check(query);
    // This grant exposes only the public reference viewport. It grants no vision
    // in any game world, and authorizes no ownership-bearing polygon IDs.
    return Object.freeze({
      regions: Object.freeze([
        Object.freeze({
          id: 'public-reference-viewport',
          worldId: PUBLIC_ATLAS_WORLD.id,
          recipientPlayerId: this.snapshot.viewerPlayerId,
          kind: 'territory' as const,
          geometry: boundsGeometry(query.bounds),
          startsAt: this.snapshot.serverTime,
          expiresAt: this.snapshot.validUntil,
        }),
      ]),
      visibleTerritoryIds: empty,
      visibleSultanateTerritoryIds: empty,
    });
  }
}

/** Read-only public data source, not a persistence implementation or game writer.
 * The host rate-limits public requests and binds the reserved reference audience.
 */
export class PublicAtlasRepository implements WorldMapRepository {
  constructor(
    private readonly recipientPlayerId: string,
    private readonly clock: () => number = Date.now,
  ) {
    validateId(recipientPlayerId);
  }
  async withSnapshot<T>(
    worldId: string,
    viewer: AuthenticatedMapViewer,
    read: (session: WorldMapReadSession) => Promise<T>,
  ): Promise<T> {
    if (worldId !== PUBLIC_ATLAS_WORLD.id) throw new KingdomsHttpError(404, 'الخريطة غير متاحة.');
    if (viewer.playerId !== this.recipientPlayerId)
      throw new KingdomsHttpError(403, 'الخريطة غير متاحة.');
    const serverTime = this.clock();
    validateTime(serverTime);
    const session = new PublicAtlasReadSession(
      Object.freeze({
        worldId,
        viewerPlayerId: this.recipientPlayerId,
        revision: '0',
        serverTime,
        validUntil: serverTime + 15000,
      }),
    );
    try {
      return await read(session);
    } finally {
      session.close();
    }
  }
}

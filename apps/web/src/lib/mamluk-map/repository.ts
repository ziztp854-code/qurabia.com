import 'server-only';
import { Prisma, type DatabaseClient } from '@tahaddi/database';
import type {
  Army,
  AuthenticatedMapViewer,
  BoundingBox,
  Castle,
  City,
  MapReadSnapshot,
  SiegeMarker,
  SpatialQuery,
  SultanateTerritory,
  Territory,
  VisibilitySnapshot,
  WorldMapReadSession,
  WorldMapRepository,
} from '@mamluk/world-map-core/server';
import {
  containsPoint,
  boundsGeometry,
  createArmyPosition,
  createArmyRoute,
  createCastle,
  createCity,
  prepareArea,
  validateArmy,
  validateArea,
  validateBounds,
  validateCoordinates,
  validateId,
  validateTime,
  withTerritoryOwnership,
} from '@mamluk/world-map-core/server';
import { getPrismaClient } from '@/lib/auth/prisma';
import { KingdomsHttpError } from '../kingdoms/http';
import type { KingdomIdentity } from '../kingdoms/repository';
import type { StoredVisibilityGrant } from './storage';
import { ensureVillageGeography } from './village-persistence';
import { VILLAGE_GEOGRAPHY_SOURCE } from './village-geography';

type Transaction = Prisma.TransactionClient;
type Collection =
  | 'cities'
  | 'castles'
  | 'territories'
  | 'sultanateTerritories'
  | 'armies'
  | 'sieges'
  | 'visibility';
type JsonRow = { value: unknown };
const item = Prisma.sql`item`;
const villageSource = Prisma.sql`w.state->'geography'->>'source' = ${VILLAGE_GEOGRAPHY_SOURCE}`;
const currentVillage = Prisma.sql`w.state->'villages'->(item->'value'->>'id')`;
const currentCityOwner = Prisma.sql`CASE WHEN ${villageSource} THEN ${currentVillage}->>'ownerId'
  ELSE item->'value'->>'ownerPlayerId' END`;
class VillageProvisioningRequired extends Error {}
const transactionOptions = {
  isolationLevel: 'RepeatableRead' as const,
  maxWait: 5000,
  timeout: 15000,
};

function immutableCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (node: unknown): void => {
    if (node && typeof node === 'object') {
      Object.values(node).forEach(freeze);
      Object.freeze(node);
    }
  };
  freeze(copy);
  return copy;
}

function captureIdentity(identity: KingdomIdentity): KingdomIdentity {
  validateId(identity.id);
  validateTime(identity.tokenVersion);
  return Object.freeze({ id: identity.id, tokenVersion: identity.tokenVersion });
}

async function authorize(tx: Transaction, identity: KingdomIdentity): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: identity.id },
    select: { status: true, tokenVersion: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
    throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
}

function records(collection: Collection): Prisma.Sql {
  return Prisma.sql`jsonb_array_elements(CASE
    WHEN jsonb_typeof(w.state->'geography'->${collection}::text) = 'array'
    THEN w.state->'geography'->${collection}::text ELSE '[]'::jsonb END)`;
}

/** Split longitude interval overlap supports bounding boxes crossing +/-180. */
function overlaps(record: Prisma.Sql, bounds: BoundingBox): Prisma.Sql {
  return Prisma.sql`
    (${record}->>'north')::double precision >= ${bounds.south}::double precision
    AND (${record}->>'south')::double precision <= ${bounds.north}::double precision
    AND (
      ((${record}->>'west')::double precision <= (${record}->>'east')::double precision
        AND (CASE WHEN ${bounds.west}::double precision <= ${bounds.east}::double precision
          THEN (${record}->>'west')::double precision <= ${bounds.east}::double precision AND (${record}->>'east')::double precision >= ${bounds.west}::double precision
          ELSE (${record}->>'west')::double precision <= ${bounds.east}::double precision OR (${record}->>'east')::double precision >= ${bounds.west}::double precision END))
      OR ((${record}->>'west')::double precision > (${record}->>'east')::double precision
        AND (${bounds.west}::double precision > ${bounds.east}::double precision OR (${record}->>'west')::double precision <= ${bounds.east}::double precision OR (${record}->>'east')::double precision >= ${bounds.west}::double precision))
      OR (${bounds.east}::double precision = 180 AND (${record}->>'west')::double precision = -180)
      OR (${bounds.west}::double precision = -180 AND (${record}->>'east')::double precision = 180)
    )`;
}

function pointWithin(record: Prisma.Sql, point: Prisma.Sql): Prisma.Sql {
  const longitude = Prisma.sql`(${point}->>'longitude')::double precision`;
  const latitude = Prisma.sql`(${point}->>'latitude')::double precision`;
  return Prisma.sql`${latitude} BETWEEN (${record}->>'south')::double precision AND (${record}->>'north')::double precision
    AND (((${record}->>'west')::double precision <= (${record}->>'east')::double precision
      AND ${longitude} BETWEEN (${record}->>'west')::double precision AND (${record}->>'east')::double precision)
      OR ((${record}->>'west')::double precision > (${record}->>'east')::double precision
        AND (${longitude} >= (${record}->>'west')::double precision OR ${longitude} <= (${record}->>'east')::double precision))
      OR (abs(${longitude}) = 180 AND ((${record}->>'west')::double precision = -180 OR (${record}->>'east')::double precision = 180)))`;
}

function activeGrant(region: Prisma.Sql, snapshot: MapReadSnapshot): Prisma.Sql {
  return Prisma.sql`${region}->>'worldId' = ${snapshot.worldId}
    AND ${region}->>'recipientPlayerId' = ${snapshot.viewerPlayerId}
    AND (${region}->>'startsAt')::bigint <= ${snapshot.serverTime}
    AND (${region}->>'expiresAt')::bigint > ${snapshot.serverTime}`;
}

function validateQuery(query: SpatialQuery): SpatialQuery {
  validateBounds(query.bounds);
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 10001)
    throw new RangeError('Invalid geographic query limit');
  return { bounds: Object.freeze({ ...query.bounds }), limit: query.limit };
}

function ids(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 2000)
    throw new RangeError('Invalid polygon visibility grant');
  value.forEach(validateId);
  return Object.freeze([...new Set(value as string[])]);
}

function visibilityGrant(value: unknown, snapshot: MapReadSnapshot): StoredVisibilityGrant {
  const grant = value as StoredVisibilityGrant;
  const region = grant.region;
  validateId(region.id);
  validateArea(region.geometry);
  validateTime(region.startsAt);
  validateTime(region.expiresAt);
  if (
    region.worldId !== snapshot.worldId ||
    region.recipientPlayerId !== snapshot.viewerPlayerId ||
    region.startsAt > snapshot.serverTime ||
    region.expiresAt <= snapshot.serverTime ||
    !['territory', 'watchtower', 'scouting', 'alliance'].includes(region.kind)
  )
    throw new RangeError('Invalid visibility grant scope');
  return Object.freeze({
    region: Object.freeze({
      id: region.id,
      worldId: region.worldId,
      recipientPlayerId: region.recipientPlayerId,
      kind: region.kind,
      geometry: immutableCopy(region.geometry),
      startsAt: region.startsAt,
      expiresAt: region.expiresAt,
    }),
    visibleTerritoryIds: ids(grant.visibleTerritoryIds),
    visibleSultanateTerritoryIds: ids(grant.visibleSultanateTerritoryIds),
  });
}

function siege(value: unknown, worldId: string): SiegeMarker {
  const marker = value as SiegeMarker;
  validateId(marker.id);
  validateId(marker.targetId);
  validateId(marker.attackerPlayerId);
  if (marker.defenderPlayerId !== null) validateId(marker.defenderPlayerId);
  validateCoordinates(marker);
  if (
    marker.worldId !== worldId ||
    !['city', 'castle'].includes(marker.targetKind) ||
    !['preparing', 'active', 'resolved'].includes(marker.status)
  )
    throw new RangeError('Invalid siege marker');
  return Object.freeze({
    id: marker.id,
    worldId,
    targetId: marker.targetId,
    targetKind: marker.targetKind,
    status: marker.status,
    attackerPlayerId: marker.attackerPlayerId,
    defenderPlayerId: marker.defenderPlayerId,
    longitude: marker.longitude,
    latitude: marker.latitude,
  });
}

/** Only server-managed game settlements expose this bounded public read policy. */
export interface PublicVillageReadSession extends WorldMapReadSession {
  readonly settlementsPublic: boolean;
  getPublicVillageCitiesInBounds(query: SpatialQuery): Promise<readonly City[]>;
  getPublicVillageTerritoriesInBounds(query: SpatialQuery): Promise<readonly Territory[]>;
}

class PrismaMapReadSession implements PublicVillageReadSession {
  get settlementsPublic(): boolean {
    return this.villageGeography;
  }

  private readonly visibilityCache = new Map<string, VisibilitySnapshot>();
  private readonly visionCache = new Map<
    string,
    (point: { longitude: number; latitude: number }) => boolean
  >();
  private active = true;
  constructor(
    private readonly tx: Transaction,
    readonly snapshot: MapReadSnapshot,
    private readonly villageGeography = false,
  ) {}
  close(): void {
    this.active = false;
  }
  private check(query: SpatialQuery): SpatialQuery {
    if (!this.active) throw new Error('Geographic read session has ended');
    return validateQuery(query);
  }
  private async read(
    collection: Collection,
    query: SpatialQuery,
    condition = Prisma.sql`TRUE`,
  ): Promise<JsonRow[]> {
    const safe = this.check(query);
    const value =
      collection === 'cities'
        ? Prisma.sql`CASE WHEN ${villageSource} THEN
      jsonb_build_object('id', item->'value'->>'id', 'worldId', item->'value'->>'worldId',
        'regionId', item->'value'->>'regionId', 'longitude', item->'value'->'longitude',
        'latitude', item->'value'->'latitude', 'name', ${currentVillage}->>'name',
        'ownerPlayerId', ${currentVillage}->>'ownerId', 'ownerSultanateId', NULL,
        'fortificationLevel', CASE WHEN ${currentVillage}->>'ownerId' = ${this.snapshot.viewerPlayerId}
          THEN ${currentVillage}->'buildings'->'wall' ELSE '0'::jsonb END,
        'strategicValue', 0)
      ELSE item->'value' END`
        : collection === 'territories'
          ? Prisma.sql`CASE WHEN ${villageSource} THEN jsonb_build_object(
              'id', item->'value'->>'id', 'worldId', item->'value'->>'worldId',
              'regionId', item->'value'->>'regionId', 'geometry', item->'value'->'geometry',
              'ownerPlayerId', ${currentVillage}->>'ownerId', 'ownerSultanateId', NULL)
            ELSE item->'value' END`
          : Prisma.sql`item->'value'`;
    const exists =
      collection === 'cities' || collection === 'territories'
        ? Prisma.sql`(${villageSource}) IS NOT TRUE
      OR ${currentVillage}->>'id' = item->'value'->>'id'`
        : Prisma.sql`TRUE`;
    return this.tx.$queryRaw<JsonRow[]>(Prisma.sql`
      SELECT ${value} AS value FROM "KingdomWorld" w
      CROSS JOIN LATERAL ${records(collection)} AS item
      WHERE w.id = ${this.snapshot.worldId} AND ${overlaps(item, safe.bounds)} AND (${condition}) AND (${exists})
      ORDER BY item->'value'->>'id', item->'value'->'region'->>'id' LIMIT ${safe.limit}`);
  }
  private knownWorld(value: { worldId: string }): void {
    if (value.worldId !== this.snapshot.worldId)
      throw new RangeError('Invalid geographic world scope');
  }
  private filterCandidates<T>(
    candidates: readonly T[],
    query: SpatialQuery,
    visible: (value: T) => boolean,
  ): readonly T[] {
    const result = candidates.filter(visible);
    if (candidates.length >= query.limit && result.length < candidates.length) {
      throw new RangeError('Geographic candidate budget exceeded');
    }
    return result;
  }
  private async vision(
    query: SpatialQuery,
  ): Promise<(point: { longitude: number; latitude: number }) => boolean> {
    const key = JSON.stringify(query.bounds);
    const cached = this.visionCache.get(key);
    if (cached) return cached;
    const grants = await this.getVisibilityInBounds({ ...query, limit: 129 });
    if (grants.regions.length > 128) throw new RangeError('Visibility grant budget exceeded');
    const prepared = grants.regions.map((region) => prepareArea(region.geometry));
    const contains = (point: { longitude: number; latitude: number }) =>
      prepared.some((contains) => contains(point));
    this.visionCache.set(key, contains);
    return contains;
  }
  private visiblePoint(point: Prisma.Sql, owner: Prisma.Sql): Prisma.Sql {
    const grant = Prisma.sql`grant_record`;
    const ownVillageVision = this.villageGeography
      ? Prisma.sql`OR EXISTS (
      SELECT 1 FROM ${records('cities')} AS own_record
      WHERE w.state->'villages'->(own_record->'value'->>'id')->>'ownerId' = ${this.snapshot.viewerPlayerId}
        AND abs((${point}->>'latitude')::double precision - (own_record->'value'->>'latitude')::double precision) <= 0.045
        AND abs((${point}->>'longitude')::double precision - (own_record->'value'->>'longitude')::double precision) <= 0.06
    )`
      : Prisma.sql``;
    return Prisma.sql`${owner} = ${this.snapshot.viewerPlayerId} OR EXISTS (
      SELECT 1 FROM ${records('visibility')} AS grant_record
      WHERE ${activeGrant(Prisma.sql`grant_record->'value'->'region'`, this.snapshot)} AND ${pointWithin(grant, point)}) ${ownVillageVision}`;
  }
  private async ownVillageGrants(query: SpatialQuery): Promise<readonly StoredVisibilityGrant[]> {
    if (!this.villageGeography) return [];
    const expanded = Prisma.sql`jsonb_build_object(
      'west', (item->'value'->>'longitude')::double precision - 0.06,
      'east', (item->'value'->>'longitude')::double precision + 0.06,
      'south', (item->'value'->>'latitude')::double precision - 0.045,
      'north', (item->'value'->>'latitude')::double precision + 0.045)`;
    const rows = await this.tx.$queryRaw<
      { id: string; longitude: number; latitude: number }[]
    >(Prisma.sql`
      SELECT item->'value'->>'id' AS id,
        (item->'value'->>'longitude')::double precision AS longitude,
        (item->'value'->>'latitude')::double precision AS latitude
      FROM "KingdomWorld" w CROSS JOIN LATERAL ${records('cities')} AS item
      WHERE w.id = ${this.snapshot.worldId}
        AND ${currentVillage}->>'ownerId' = ${this.snapshot.viewerPlayerId}
        AND ${currentVillage}->>'id' = item->'value'->>'id'
        AND ${overlaps(expanded, query.bounds)} ORDER BY item->'value'->>'id' LIMIT ${query.limit}`);
    return rows.map((point) => {
      validateId(point.id);
      validateCoordinates(point);
      const halfLongitude = 0.045 / Math.cos((point.latitude * Math.PI) / 180);
      if (halfLongitude > 0.06) throw new RangeError('Invalid allocated village latitude');
      return Object.freeze({
        region: Object.freeze({
          id: `village-vision:${point.id}`,
          worldId: this.snapshot.worldId,
          recipientPlayerId: this.snapshot.viewerPlayerId,
          kind: 'territory' as const,
          geometry: boundsGeometry({
            west: point.longitude - halfLongitude,
            east: point.longitude + halfLongitude,
            south: point.latitude - 0.045,
            north: point.latitude + 0.045,
          }),
          startsAt: this.snapshot.serverTime,
          expiresAt: this.snapshot.validUntil,
        }),
        visibleTerritoryIds: [],
        visibleSultanateTerritoryIds: [],
      });
    });
  }
  async getOwnVillageLocations(): Promise<readonly OwnVillageMapLocation[]> {
    if (!this.active) throw new Error('Geographic read session has ended');
    if (!this.villageGeography) return [];
    const rows = await this.tx.$queryRaw<OwnVillageMapLocation[]>(Prisma.sql`
      SELECT item->'value'->>'id' AS "villageId", ${currentVillage}->>'name' AS name,
        (item->'value'->>'longitude')::double precision AS longitude,
        (item->'value'->>'latitude')::double precision AS latitude
      FROM "KingdomWorld" w CROSS JOIN LATERAL ${records('cities')} AS item
      WHERE w.id = ${this.snapshot.worldId} AND ${villageSource}
        AND ${currentVillage}->>'id' = item->'value'->>'id'
        AND ${currentVillage}->>'ownerId' = ${this.snapshot.viewerPlayerId}
      ORDER BY item->'value'->>'id' LIMIT 100`);
    return rows.map((row) => {
      validateId(row.villageId);
      validateCoordinates(row);
      if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 100)
        throw new RangeError('Invalid village name');
      return Object.freeze({
        villageId: row.villageId,
        name: row.name,
        longitude: row.longitude,
        latitude: row.latitude,
      });
    });
  }
  async getVisibilityInBounds(query: SpatialQuery): Promise<VisibilitySnapshot> {
    const safe = this.check(query);
    const key = JSON.stringify(safe);
    const cached = this.visibilityCache.get(key);
    if (cached) return cached;
    const rows = await this.read(
      'visibility',
      safe,
      activeGrant(Prisma.sql`item->'value'->'region'`, this.snapshot),
    );
    const grants = [
      ...rows.map((row) => visibilityGrant(row.value, this.snapshot)),
      ...(await this.ownVillageGrants(safe)),
    ];
    const result = Object.freeze({
      regions: Object.freeze(grants.map((grant) => grant.region)),
      visibleTerritoryIds: Object.freeze([
        ...new Set(grants.flatMap((grant) => grant.visibleTerritoryIds)),
      ]),
      visibleSultanateTerritoryIds: Object.freeze([
        ...new Set(grants.flatMap((grant) => grant.visibleSultanateTerritoryIds)),
      ]),
    });
    this.visibilityCache.set(key, result);
    return result;
  }
  async getCitiesInBounds(query: SpatialQuery): Promise<readonly City[]> {
    const safe = this.check(query);
    const visible = await this.vision(safe);
    const rows = await this.read(
      'cities',
      safe,
      this.visiblePoint(Prisma.sql`item->'value'`, currentCityOwner),
    );
    return this.filterCandidates(
      rows.map((row) => createCity(row.value as City)),
      safe,
      (city) => {
        this.knownWorld(city);
        return (
          containsPoint(safe.bounds, city) &&
          (city.ownerPlayerId === this.snapshot.viewerPlayerId || visible(city))
        );
      },
    );
  }
  async getPublicVillageCitiesInBounds(query: SpatialQuery): Promise<readonly City[]> {
    const safe = this.check(query);
    if (!this.villageGeography) return [];
    const rows = await this.read('cities', safe);
    return this.filterCandidates(
      rows.map((row) => createCity(row.value as City)),
      safe,
      (city) => {
        this.knownWorld(city);
        return containsPoint(safe.bounds, city);
      },
    );
  }
  async getPublicVillageTerritoriesInBounds(query: SpatialQuery): Promise<readonly Territory[]> {
    const safe = this.check(query);
    if (!this.villageGeography) return [];
    const rows = await this.read('territories', safe);
    return rows.map((row) => {
      const value = row.value as Territory;
      this.knownWorld(value);
      return withTerritoryOwnership(value, value);
    });
  }
  async getCastlesInBounds(query: SpatialQuery): Promise<readonly Castle[]> {
    const safe = this.check(query);
    const visible = await this.vision(safe);
    const rows = await this.read(
      'castles',
      safe,
      this.visiblePoint(Prisma.sql`item->'value'`, Prisma.sql`item->'value'->>'ownerPlayerId'`),
    );
    return this.filterCandidates(
      rows.map((row) => createCastle(row.value as Castle)),
      safe,
      (castle) => {
        this.knownWorld(castle);
        return (
          containsPoint(safe.bounds, castle) &&
          (castle.ownerPlayerId === this.snapshot.viewerPlayerId || visible(castle))
        );
      },
    );
  }
  async getTerritoriesInBounds(query: SpatialQuery): Promise<readonly Territory[]> {
    const safe = this.check(query);
    // Managed plots belong exclusively to the isolated public-settlement batch.
    if (this.villageGeography) return [];
    const grants = await this.getVisibilityInBounds({ ...safe, limit: 129 });
    const authorized =
      grants.visibleTerritoryIds.length > 0
        ? Prisma.sql`item->'value'->>'id' IN (${Prisma.join(grants.visibleTerritoryIds)})`
        : Prisma.sql`FALSE`;
    const rows = await this.read(
      'territories',
      safe,
      Prisma.sql`item->'value'->>'ownerPlayerId' = ${this.snapshot.viewerPlayerId} OR ${authorized}`,
    );
    return rows.map((row) => {
      const value = row.value as Territory;
      this.knownWorld(value);
      return withTerritoryOwnership(value, value);
    });
  }
  async getSultanateTerritoriesInBounds(
    query: SpatialQuery,
  ): Promise<readonly SultanateTerritory[]> {
    const safe = this.check(query);
    const grants = await this.getVisibilityInBounds({ ...safe, limit: 129 });
    const authorized =
      grants.visibleSultanateTerritoryIds.length > 0
        ? Prisma.sql`item->'value'->>'id' IN (${Prisma.join(grants.visibleSultanateTerritoryIds)})`
        : Prisma.sql`FALSE`;
    const rows = await this.read('sultanateTerritories', safe, authorized);
    return rows.map((row) => {
      const value = row.value as SultanateTerritory;
      this.knownWorld(value);
      validateId(value.id);
      validateId(value.sultanateId);
      validateArea(value.geometry);
      return Object.freeze({
        id: value.id,
        worldId: value.worldId,
        sultanateId: value.sultanateId,
        geometry: immutableCopy(value.geometry),
      });
    });
  }
  async getVisibleArmiesInBounds(query: SpatialQuery): Promise<readonly Army[]> {
    const safe = this.check(query);
    const visible = await this.vision(safe);
    const rows = await this.read(
      'armies',
      safe,
      this.visiblePoint(
        Prisma.sql`item->'value'->'position'`,
        Prisma.sql`item->'value'->>'ownerPlayerId'`,
      ),
    );
    const candidates = rows.map((row) => {
      const value = row.value as Army;
      this.knownWorld(value);
      validateArmy(value);
      return Object.freeze({
        id: value.id,
        worldId: value.worldId,
        ownerPlayerId: value.ownerPlayerId,
        ownerSultanateId: value.ownerSultanateId,
        position: createArmyPosition(value.position),
        route: value.route === null ? null : createArmyRoute(value.route),
      });
    });
    return this.filterCandidates(
      candidates,
      safe,
      (army) =>
        containsPoint(safe.bounds, army.position) &&
        (army.ownerPlayerId === this.snapshot.viewerPlayerId || visible(army.position)),
    );
  }
  async getSiegesInBounds(query: SpatialQuery): Promise<readonly SiegeMarker[]> {
    const safe = this.check(query);
    const visible = await this.vision(safe);
    const rows = await this.read(
      'sieges',
      safe,
      this.visiblePoint(Prisma.sql`item->'value'`, Prisma.sql`item->'value'->>'attackerPlayerId'`),
    );
    return this.filterCandidates(
      rows.map((row) => siege(row.value, this.snapshot.worldId)),
      safe,
      (marker) =>
        containsPoint(safe.bounds, marker) &&
        (marker.attackerPlayerId === this.snapshot.viewerPlayerId || visible(marker)),
    );
  }
}

export class PrismaWorldMapRepository implements WorldMapRepository {
  private readonly identity: KingdomIdentity;
  constructor(
    identity: KingdomIdentity,
    private readonly db: DatabaseClient = getPrismaClient(),
  ) {
    this.identity = captureIdentity(identity);
  }
  async withSnapshot<T>(
    worldId: string,
    viewer: AuthenticatedMapViewer,
    read: (session: WorldMapReadSession) => Promise<T>,
  ): Promise<T> {
    validateId(worldId);
    if (viewer.playerId !== this.identity.id)
      throw new KingdomsHttpError(403, 'الخريطة غير متاحة.');
    try {
      return await this.readSnapshot(worldId, read);
    } catch (error) {
      if (!(error instanceof VillageProvisioningRequired)) throw error;
      await ensureVillageGeography(worldId, this.identity, this.db);
      return this.readSnapshot(worldId, read);
    }
  }
  private async readSnapshot<T>(
    worldId: string,
    read: (session: WorldMapReadSession) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await authorize(tx, this.identity);
      const [row] = await tx.$queryRaw<
        {
          id: string;
          revision: number;
          geographyVersion: string;
          geographySource: string;
          needsProvision: boolean;
          serverTime: Date;
        }[]
      >(Prisma.sql`
        SELECT w.id, w.revision, w.state->'geography'->>'version' AS "geographyVersion",
          w.state->'geography'->>'source' AS "geographySource", clock_timestamp() AS "serverTime",
          CASE WHEN NOT (w.state ? 'geography') THEN TRUE
            WHEN ${villageSource} AND w.state->'geography'->>'version' = '1' THEN
              w.state->'geography'->>'villagePlotsVersion' IS DISTINCT FROM '1' OR EXISTS (
              SELECT 1 FROM jsonb_each(w.state->'villages') v
              WHERE NOT EXISTS (SELECT 1 FROM ${records('cities')} city
                WHERE city->'value'->>'id' = v.value->>'id')
              OR (NOT EXISTS (SELECT 1 FROM ${records('territories')} plot
                WHERE plot->'value'->>'id' = v.value->>'id')
                AND NOT COALESCE(w.state->'geography'->'omittedVillagePlotIds' ? (v.value->>'id'), FALSE)))
              ELSE FALSE END AS "needsProvision"
        FROM "KingdomWorld" w WHERE w.id = ${worldId}
          AND w.state->'players' ? ${this.identity.id}::text`);
      if (row?.needsProvision) throw new VillageProvisioningRequired();
      if (!row || row.id !== worldId || row.geographyVersion !== '1')
        throw new KingdomsHttpError(404, 'الخريطة غير متاحة.');
      if (!Number.isSafeInteger(row.revision) || row.revision < 0)
        throw new RangeError('Invalid map revision');
      const serverTime = row.serverTime.getTime();
      validateTime(serverTime);
      const snapshot = Object.freeze({
        worldId,
        viewerPlayerId: this.identity.id,
        revision: String(row.revision),
        serverTime,
        validUntil: serverTime + 15000,
      });
      const session = new PrismaMapReadSession(
        tx,
        snapshot,
        row.geographySource === VILLAGE_GEOGRAPHY_SOURCE,
      );
      try {
        return await read(session);
      } finally {
        session.close();
      }
    }, transactionOptions);
  }
}

export async function listMamlukMapWorlds(
  identity: KingdomIdentity,
  db: DatabaseClient = getPrismaClient(),
): Promise<readonly { id: string; name: string }[]> {
  const safe = captureIdentity(identity);
  return db.$transaction(async (tx) => {
    await authorize(tx, safe);
    const rows = await tx.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
      SELECT w.id, w.name FROM "KingdomWorld" w
      WHERE w.state->'players' ? ${safe.id}::text
      ORDER BY w."createdAt" DESC, w.id LIMIT 50`);
    return rows.map((row) => {
      validateId(row.id);
      if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 80)
        throw new RangeError('Invalid campaign name');
      return Object.freeze({ id: row.id, name: row.name });
    });
  }, transactionOptions);
}

export interface OwnVillageMapLocation {
  readonly villageId: string;
  readonly name: string;
  readonly longitude: number;
  readonly latitude: number;
}

/** Server-rendered focus metadata: the requester can only focus their own villages. */
export async function getOwnVillageMapLocations(
  worldId: string,
  identity: KingdomIdentity,
  db: DatabaseClient = getPrismaClient(),
): Promise<readonly OwnVillageMapLocation[]> {
  return new PrismaWorldMapRepository(identity, db).withSnapshot(
    worldId,
    { playerId: identity.id },
    async (session) => (session as PrismaMapReadSession).getOwnVillageLocations(),
  );
}

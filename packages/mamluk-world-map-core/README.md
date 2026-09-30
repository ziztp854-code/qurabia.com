# PACKAGE — MAMLUK WORLD MAP CORE

Framework-independent TypeScript map domain and server projection for Mamluk Wars.
Geography uses WGS84 (`EPSG:4326`), always **longitude / latitude**. Cairo is
`[31.2357, 30.0444]`; these are geographic locations, never board or pixel positions.
The domain has no MapLibre, ORM, database, React, or server-framework dependency.
The server geometry projection uses the pinned `polygon-clipping` library.

```text
Game Domain → WorldMapService → VisibilityFilter → GeoJsonProjection
            → MapProjectionAdapter → Browser
```

The separate [MapLibre adapter](../mamluk-maplibre-adapter/README.md) implements the
presentation contract and includes an executable OpenFreeMap browser bootstrap.
Basemap choice and globe/flat projection do not change the game domain.

## Files and complete source

```text
packages/mamluk-world-map-core/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.test.json
├── vitest.config.ts
├── CONTEXT.md
├── README.md
├── INTEGRATION.md
├── src/
│   ├── index.ts              Browser-safe contracts and transport decoder
│   ├── server.ts             Server-only public entry point
│   ├── models.ts             All ten requested domain models plus Army
│   ├── geojson.ts            Immutable RFC 7946 contracts
│   ├── presentation.ts       MapPayload, layers, MapProjectionAdapter
│   ├── queries.ts            Snapshot and spatial repository interfaces
│   ├── spatial.ts            Coordinates, topology, bounds, clipping and fog
│   ├── validation.ts         Model factories and ownership transition
│   ├── immutable.ts          Deeply frozen DTOs
│   ├── visibility.ts         Authorization filter and opaque VisibleWorld
│   ├── builders.ts           Six independent GeoJSON producers
│   ├── payload.ts            Strict wire schema decoder
│   ├── service.ts            Bounded, snapshot-consistent server pipeline
│   └── viewport-endpoint.ts  Executable authenticated HTTP integration seam
└── test/
    ├── fixtures.ts
    ├── models.test.ts
    ├── spatial.test.ts
    ├── visibility.test.ts
    ├── geojson.test.ts
    ├── service.test.ts
    ├── payload.test.ts
    └── endpoint.test.ts

packages/mamluk-maplibre-adapter/
├── README.md
├── package.json, pnpm-lock.yaml, tsconfig*.json, vitest.config.ts
├── src/
│   ├── index.ts
│   ├── adapter.ts
│   ├── styles.ts
│   ├── viewport-loader.ts
│   └── browser-example.ts
└── test/
    ├── fixtures.ts
    ├── adapter.test.ts
    ├── viewport-loader.test.ts
    └── pipeline.test.ts
```

Source and tests are executable TypeScript, with generated declarations on build.
Install and validate independently from this directory:

```shell
pnpm install --ignore-workspace --ignore-scripts --frozen-lockfile
npm run test:coverage
npm run typecheck
npm run build
npm run lint
```

Build this package before installing/building the sibling adapter. Standalone
lockfiles keep verification independent of unrelated workspace dependency changes;
the existing root manifest and lockfile are preserved. Both packages are also
discovered by the existing `packages/*` workspace layout.

## Domain and authority

The domain [models](src/models.ts) are readonly. IDs are stable, nonempty strings.
Player and sultanate ownership are independently nullable; an unowned territory
does not acquire an owner through geography. The engine validates membership and
ownership transitions before calling the server-only `withTerritoryOwnership`.
The helper returns a deeply frozen copy and does not mutate the old territory.

| Model                | Meaning and principal fields                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `WorldMap`           | World ID, name and fixed geographic reference system                                                     |
| `Region`             | ID, world ID, name, Polygon/MultiPolygon                                                                 |
| `Territory`          | ID, world ID, region ID, geometry, player/sultanate ownership                                            |
| `City`               | ID, name, longitude, latitude, region ID, owner IDs, fortification level, strategic value; also world ID |
| `Castle`             | City fields plus nullable associated city ID                                                             |
| `ArmyPosition`       | Army ID, longitude, latitude, origin, destination, departure/arrival times and status                    |
| `ArmyRoute`          | Origin, destination, ordered waypoints, distance, departure/arrival times                                |
| `SultanateTerritory` | ID, world ID, sultanate ID and geometry                                                                  |
| `SiegeMarker`        | ID, world ID, coordinates, target, engine status and private participant IDs                             |
| `VisibilityRegion`   | Geometry, recipient, world, source kind, start and expiry                                                |

Times are integer Unix epoch **milliseconds**. Route distance is authoritative
**metres**. `moving` and `retreating` positions require a complete schedule with
arrival after departure, and a matching route. `stationed` and `besieging`
positions have null origin/destination/times and no route. Factories validate and
copy supplied data; they do not simulate movement, choose paths or derive duration.
The existing game engine must supply the current army coordinate from its own
authoritative snapshot. This package never interpolates army positions.

Geometry supports Polygon/MultiPolygon, closed simple rings and interior holes.
Exterior boundaries count as visible; hole boundaries do not. Invalid, nonfinite,
out-of-range, degenerate, self-intersecting or overlapping multipart geometry is
rejected. Input winding may be either direction; boolean projection normalizes
winding. Split polygons crossing the antimeridian at ±180; unsplit ambiguous edges
over 180 degrees are rejected. Bounding boxes can cross it with `west > east`.
Routes are split into seam-safe presentation lines on the server without changing
their authoritative travel schedule or current position.

## Interfaces and GeoJSON contracts

[queries.ts](src/queries.ts) defines `WorldMapRepository`, `WorldMapReadSession`,
`SpatialWorldQueries`, `ViewportRequest`, `MapReadSnapshot` and `VisibilitySnapshot`.
The required `getTerritoriesInBounds`, `getCitiesInBounds` and
`getVisibleArmiesInBounds` methods are ready for a later spatial database adapter.
Castles, sultanate areas, sieges and vision use separate bounded query methods.

The [integration contract](INTEGRATION.md) specifies authentication, world access,
snapshot consistency and persistence obligations. The package does not read an
entire world, implement a second game engine or embed a database implementation.

[geojson.ts](src/geojson.ts) defines immutable `Feature`, `FeatureCollection`,
`Point`, `LineString`, `MultiLineString`, `Polygon` and `MultiPolygon` contracts.
[presentation.ts](src/presentation.ts) defines the versioned client payload:

```typescript
interface MapPayload {
  readonly schemaVersion: 1;
  readonly worldId: string;
  readonly revision: string; // Monotonic decimal, not an unsafe JS integer
  readonly serverTime: number;
  readonly expiresAt: number;
  readonly bounds: BoundingBox;
  readonly layers: MapLayers;
}
```

Every layer is a GeoJSON FeatureCollection; geometry tuples are `[longitude,
latitude]`. Feature IDs are unique within each collection. Producers construct
properties individually and never spread raw domain records into client data.
The strict decoder rejects unexpected fields, invalid geometry shapes and invalid
property types. It validates transport only and grants no game authority.

| Producer                   | Output layers                 | Safe properties                                                                          |
| -------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `CityGeoJsonBuilder`       | cities, castles               | Kind, name, region, authorized ownership, fortification, strategic value; castle city ID |
| `TerritoryGeoJsonBuilder`  | territories, sultanateBorders | Authorized region/ownership or sultanate ID                                              |
| `ArmyGeoJsonBuilder`       | armies                        | Army ID, observed ownership/status, own flag; **no plan**                                |
| `ArmyRouteGeoJsonBuilder`  | armyRoutes                    | Own army ID, distance, engine departure and arrival; geometry contains own planned path  |
| `SiegeGeoJsonBuilder`      | sieges                        | Target ID/kind and observed engine status; **no participant IDs**                        |
| `VisibilityGeoJsonBuilder` | visibility, fog               | Anonymous viewport-local ID and kind; **no tower/scout/owner/grant IDs**                 |

`GeoJsonProjection` assembles the separate producers. Producers accept only an
opaque, deeply frozen `VisibleWorld` registered by `VisibilityFilter`; passing a
raw batch or a forged object fails at runtime. Fog polygons are the viewport
minus the union of authorized vision polygons; overlap and holes are handled on
the server. The client simply renders those polygons.

`MapProjectionAdapter` exposes presentation operations: globe/mercator selection,
screen/geographic conversion, current bounding box, rendering, clearing and
disposal. It has no operation for moving armies, changing ownership, granting
vision or advancing sieges. The MapLibre implementation supports all 12 requested
capabilities through the basemap/projection and nine independent game sources.

## Security rules

1. Authenticate and authorize world access before spatial reads. The viewer comes
   from the server's validated session, never client parameters or local storage.
2. Enforce Fog of War **before creating any client DTO or GeoJSON**. Hidden records
   are removed, rather than transmitted with a `hidden` flag or hidden map layer.
3. Vision grants must match recipient/world and be active at the snapshot's
   authoritative time. Watchtower/scouting/alliance coverage is computed by the
   engine. Shared vision requires an explicit directional grant; membership alone
   grants nothing. Expiry/revocation is read in the same snapshot as map entities.
4. Entire ownership-bearing territory and sultanate features require explicit
   snapshot authorization IDs. An intersecting/nearby polygon alone cannot reveal
   its owner. These IDs are private and are never transmitted.
5. Own cities/castles/armies may be observed within bounds. Other point entities
   require active vision. Seeing an enemy army never authorizes its route,
   destination, waypoints, departure, arrival or troop composition. Routes are
   deliberately own-only, including when an ally shares vision.
6. Use a consistent world revision, viewer and server time for all reads. Mismatched
   identities/worlds, invalid revisions and expired snapshots fail closed.
7. Enforce viewport/entity/geometry/byte limits before returning data. Return generic
   errors, never hidden counts, cursor offsets, raw records or exception details.
8. Keep payloads private and uncached. Never put personalized overlays in public
   vector tiles, basemap URLs, service-worker caches, analytics or browser logs.
9. Expiry, logout, viewport change and revoked vision must clear old overlays.
   The adapter recreates sources when replacing snapshots and rejects stale reads.
10. Browser code may render approved snapshots and validate transport. It must
    **never calculate authoritative position, duration, ownership, visibility or
    siege status**. All state changes go through authenticated engine commands.

## Performance notes

Default requests cover at most 90 degrees of longitude and 90 degrees of latitude,
2,000 candidate entities in total, 128 vision regions, 20,000 candidate vertices
and 1,000,000 UTF-8 payload bytes. Snapshot TTL is at most 15 seconds and is
shortened to the earliest relevant vision expiry. Queries ask for limit + 1 to
detect overflow. Overflow produces no partial payload or hidden count.
The wire decoder independently bounds total projected features to 8,192 and
positions to 100,000, including marker/route duplication and derived fog geometry.

Vision polygons are validated/prepared once per filtered read, with bounding-box
rejection before point-in-ring checks. Geometry complexity is bounded before
projection. Polygon clipping and fog union remain sensitive to intersection
count; serve simplified, server-authorized geometries for dense worlds. The
geometry validator rejects areas exceeding 20,000 positions and individual rings
exceeding 10,000. Use endpoint deadlines and engine/DB statement timeouts.

Implement spatial indexes with `(worldId, geometry)` and ownership/visibility
predicates. Query the viewport in the database; do not fetch all records and then
filter in memory. Split antimeridian boxes into indexed half-box queries inside
the same snapshot and deduplicate IDs. Geographic indexes should avoid planar
degree distances for authoritative movement; the engine supplies distance/time.
Reads are sequential for compatibility with transaction drivers.

At globe-wide zoom only public basemap geography loads; game overlays wait for a
bounded viewport. The adapter debounces movement, cancels old requests and
refreshes bounded snapshots. It makes defensive copies and recreates nine sources
on replacement to prevent stale worker data from reappearing. For much denser
worlds, introduce authorized server tiles or paged snapshots with explicit
snapshot/authorization consistency; do not weaken filtering or simply raise limits.

## Verification

Tests cover real coordinates, invalid values, territory ownership, army positions,
route consistency, directional/time-limited vision, holes, antimeridian bounds,
overlapping fog, GeoJSON allowlists, hidden enemies, bounded spatial reads,
identity/snapshot mismatch, resource limits and the authenticated endpoint. The
maximum default marker/route/vision payload also passes the strict wire decoder.
Coverage thresholds are 80% for statements, branches, functions and lines.
The adapter's pipeline test exercises service → JSON → decoder → browser source
and verifies revocation removes an enemy from the next source snapshot.

This deliverable is a package and adapter example. Database-backed world wiring,
engine-produced geographic datasets and live WebGL/basemap acceptance remain
integration work; these unit/integration tests do not claim a deployed map.

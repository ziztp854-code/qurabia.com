# Server integration contract

Use the existing Mamluk/kingdoms engine as the only game authority. Map reads
observe its state; they must not run a separate movement clock or convert the old
decorative village grid into fabricated geographic coordinates.

## Read port

Implement `WorldMapRepository.withSnapshot(worldId, viewer, read)`:

1. Validate current authenticated player/session and access to the requested world.
2. Bind the callback to one consistent engine/DB snapshot containing ownership,
   current army coordinates, schedules, sieges, alliance grants and visibility.
3. Supply `worldId`, `viewerPlayerId`, a monotonic decimal `revision`, authoritative
   epoch-ms `serverTime`, and `validUntil`. The validity lease must cover **all**
   supplied observation rights, including polygon authorization IDs. Shorten it
   for upcoming revocations and deadlines; refresh after authorization changes.
4. Execute every `WorldMapReadSession` query under that same authorization and
   snapshot. Session methods must not reread mutable global state or another world.
5. Apply world, viewer, spatial and limit predicates in storage. Return at most the
   requested sentinel limit. Pre-filter enemy armies and other sensitive entities;
   `WorldMapService` independently filters again before serialization.
6. Return only viewport-relevant vision grants and authorized polygon IDs. An ID
   authorizes the feature's full ownership-bearing geometry, not an intersecting
   sliver. Do not grant IDs for partially observed secret ownership; either omit
   those polygons or authorize a separate server-created observed polygon.
7. End the snapshot and enforce a bounded read deadline. Never expose a raw
   `WorldMapBatch`, visibility snapshot, DB exception or cursor to the browser.

The package supplies query interfaces, not persistence. A later PostGIS/ORM
adapter implements these interfaces without changing domain models or MapLibre.
Use consistent read transactions or immutable engine snapshots. Geography clipping
is planar RFC 7946 polygon processing with antimeridian cuts; it is not a geodesic
pathfinder or travel-duration calculation.

## Executable endpoint seam

`createMapViewportHandler` returns an actual asynchronous handler whose request
needs a `url` field. Supply real authentication, rate-limiting and diagnostic
adapters through `MapEndpointPorts`; the repository still verifies world access.
It returns `{ status, headers, body }`, ready for the host framework response API.
It supports:

```text
GET /api/mamluk/map?worldId=mamluk-world&west=30&south=29&east=34&north=33
```

Only these five parameters are accepted; duplicates, missing values, unknown
parameters and client `playerId` are rejected. Parse errors return 400, anonymous
requests 401, rate limits 429 and failed/oversized reads 503 with generic messages.
Successful responses contain `MapPayload` directly, matching the included browser
loader. All responses are `Cache-Control: private, no-store` with `Vary: Cookie,
Authorization`. Set an authenticated, same-origin GET route with the host's normal
middleware. Supply read deadlines and the appropriate request limiter.

The following typed function is sufficient to bind the independent ports; every
operation is supplied through a concrete interface, with no framework dependency:

```typescript
import {
  WorldMapService,
  createMapViewportHandler,
  type WorldMapRepository,
  type MapEndpointPorts,
} from '@mamluk/world-map-core/server';

export function bindMapEndpoint<Request extends { readonly url: string }>(
  repository: WorldMapRepository,
  ports: MapEndpointPorts<Request>,
) {
  const service = new WorldMapService(repository, {}, ports.reportError);
  return createMapViewportHandler(service, ports);
}
```

The endpoint itself is implemented in [viewport-endpoint.ts](src/viewport-endpoint.ts)
and exercised by [endpoint.test.ts](test/endpoint.test.ts). Diagnostic callbacks
run only on the server. Their exceptions do not escape as client errors. Internal
failure causes are retained on server exceptions; serialize only the endpoint's
explicit response body, never Error objects or stack traces.

## Browser integration

Import only `@mamluk/world-map-core` for types and `parseMapPayload` in the browser;
never bundle the `/server` entry. The separate adapter's `./example` entry imports
the MapLibre runtime asynchronously and returns a disposable map controller.
Its authenticated fetch submits bounds/world only, validates the response, and
passes it to `MapLibreAdapter`. The server computes visibility, fog, position and
siege state. The client converts coordinates to screen space and renders sources.

On session/world changes abort/dispose the old loader before resetting the
adapter or creating a new controller. Payload revisions may be equal for different
viewports; the loader's generation rejects earlier responses. Lower revisions
are ignored. Each payload's TTL is reduced by the complete delivery round trip;
expired data clears sources and cannot be renewed by replaying the same snapshot.
Projection/basemap changes affect presentation only. OpenFreeMap carries public
geographic tiles and receives no private game entities.

Retain the existing engine's transaction/revision/worker behavior. New game commands
for ownership, travel, scouting or siege operations remain separate authenticated
engine endpoints. This map package exposes observations and does not execute them.

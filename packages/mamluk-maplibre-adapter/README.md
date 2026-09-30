# Mamluk MapLibre adapter

Framework-independent presentation adapter for `@mamluk/world-map-core`.
The core knows neither MapLibre nor a basemap provider. This package implements
its `MapProjectionAdapter` contract with actual `maplibre-gl` types. It supports
MapLibre 5 and 6; development and compilation use 6.11.2.

```text
src/
  adapter.ts           MapLibreAdapter: projection, snapshots, session lifecycle
  styles.ts            Nine source/layer definitions and configurable palette
  viewport-loader.ts   Bounded requests, cancellation, debouncing, refresh
  browser-example.ts  Executable browser bootstrap with authenticated fetch
  index.ts             Framework-independent public entry point
test/
  adapter.test.ts       SDK boundary lifecycle, expiry, projection, data removal
  viewport-loader.test.ts  Network boundary and viewport loading
  pipeline.test.ts      Service -> wire -> parser -> adapter security integration
  fixtures.ts          Fake SDK boundary and known snapshot fixtures
```

## Browser integration

Build the core before building this package. This package includes a standalone
lockfile and uses a local file dependency on the core. From this package directory,
install with `pnpm install --ignore-workspace --ignore-scripts` when the workspace
dependency installation is managed separately. Then run the npm scripts below.
Install `maplibre-gl` in the host application and import its CSS; use a bundler for
the browser example.

```typescript
import 'maplibre-gl/dist/maplibre-gl.css';
import { createMamlukWorldMap } from '@mamluk/maplibre-adapter/example';

const worldMap = await createMamlukWorldMap({
  container: 'world-map',
  worldId: 'mamluk-world',
  endpoint: '/api/mamluk/map',
  onError: (error) => console.error('World map could not refresh', error),
});

worldMap.adapter.setProjection('mercator'); // World map
worldMap.adapter.setProjection('globe'); // Real-world globe
worldMap.adapter.setBasemap('https://tiles.openfreemap.org/styles/liberty');

// On logout, page teardown, or before constructing another session:
worldMap.dispose();
```

The host must give `#world-map` a nonzero height. The returned MapLibre map keeps
its standard keyboard navigation. The example does not move or interpolate army
markers: only incoming authoritative snapshots can change game locations.

For your own transport, instantiate `MapLibreAdapter` with a MapLibre `Map`, call
`resetSession(worldId)`, and deliver a decoded payload with
`render(payload, deliveryAgeMs)`. The second argument is a conservative upper
bound on delivery age; the included loader uses the complete request round trip.
Use a trusted authenticated endpoint with `Cache-Control: private, no-store` and
an application JSON parser such as the core's `parseMapPayload`. Never feed raw
game-domain entities to the adapter.

## Presentation contracts

Each incoming payload completely replaces these GeoJSON sources:

| Source             | MapLibre layer | Server-projected content                                         |
| ------------------ | -------------- | ---------------------------------------------------------------- |
| `cities`           | circle         | Authorized cities                                                |
| `castles`          | circle         | Authorized castles                                               |
| `territories`      | fill           | Authorized territory polygons                                    |
| `sultanateBorders` | line           | Authorized sultanate polygon outlines                            |
| `armies`           | circle         | Current authoritative positions                                  |
| `armyRoutes`       | line           | Authorized route segments                                        |
| `sieges`           | circle         | Authorized siege markers                                         |
| `visibility`       | fill           | Server-computed watchtower, scouting, territory, alliance grants |
| `fog`              | fill           | Server-computed fog polygons                                     |

Coordinates are WGS84 longitude/latitude. The adapter converts coordinates only
between geographic and screen space using MapLibre `project`/`unproject`.
Unwrapped MapLibre viewport longitudes are normalized; a west value greater than
east indicates an antimeridian-crossing box.

## Loading and lifecycle

`ViewportLoader` sends the current bounding box after a 150ms movement debounce.
It aborts earlier requests and rejects late responses even when a transport
ignores its cancellation signal. Matching bounds are required before rendering.
The default refresh interval is five seconds. Requests do not contain a player
ID: the server derives identity from the authenticated session.

The default maximum query span is 90 degrees in each dimension, matching the
core's default bounded query policy. At broader zoom levels only the basemap is
shown. The browser never requests all game-world entities. Smaller limits can be
configured for dense worlds; server bounds and count limits remain mandatory.

Source data uses whole snapshot replacement rather than merges. Replacement first
removes game layers and sources synchronously, then creates sources for the new
snapshot, so worker updates cannot briefly render stale markers. Expiration uses
a monotonic local timer against the
server-issued TTL, minus delivery age. Inject clocks and schedulers at test seams.
Overdue snapshots also expire before style restoration. Style reloads restore all
nine layers and the selected projection. Basemap replacement does not alter domain
state. `dispose` cancels timers, removes listeners, and removes owned layers and
sources. The caller owns the map; the browser bootstrap also removes its map.

`resetSession` clears all presentation data and revision history. Abort and
dispose the preceding viewport loader before changing authenticated identity.
Incoming snapshots must match the active world. Lower revisions and older server
times at equal revisions are ignored; equal revisions may carry another viewport.
The loader generation protects equal-revision requests from arrival-order races.

## Security and performance

Fog is cosmetic presentation of already-filtered server results. Hidden enemy
data must never arrive at this package, GeoJSON sources, browser caches, logs, or
developer tools. Watchtower, scouting, and directional alliance vision are
authorized by the server. No client method computes army positions, duration,
ownership, visibility, or siege state. Errors, movement, expiry, and teardown
clear game overlays; persistent request failures require an application retry or
another movement. This package does not cache payloads.

Bounded source recreation, fixed layer counts, debounce, abort, and generation checks
keep client work proportional to one authorized viewport. The adapter makes
defensive GeoJSON copies for MapLibre's mutable SDK types. Each accepted snapshot
recreates nine sources and layers: this costs more than `setData`, but ensures
an old worker result cannot populate a replacement snapshot. Large worlds should
use server-enforced feature/vertex/byte budgets and spatial indexes. OpenFreeMap
tiles contain geography, never confidential game information. Preserve provider
attribution and select an alternate style URL or style object to change providers.

## Validation

Run `npm run typecheck`, `npm run build`, `npm run lint`, and
`npm run test:coverage` after installing dependencies and building the core.
Tests use public adapter and loader contracts, with fakes only at the SDK, clock,
timer, and network boundaries. They do not require WebGL. Browser GPU rendering
and remote basemap availability need host application acceptance testing.

## Official references

- [MapLibre Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/)
- [MapLibre GeoJSONSource API](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/)
- [MapLibre globe example](https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe/)
- [OpenFreeMap quick start](https://openfreemap.org/quick_start/)
- [GeoJSON RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)

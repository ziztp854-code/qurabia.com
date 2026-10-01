# Mamluk world map: host integration

The geographic atlas is available at `/games/kingdoms/world-map/`. The village's
World Map navigation, overview links and toolbar open this route with the current
`worldId` and `villageId`. It uses the site's existing authentication,
Prisma/PostgreSQL connection and `KingdomWorld` aggregate. This integration adds no
schema migration or second persistence system.

The atlas reads persisted geographic observations. The local campaign includes
fictional ownership, army positions, routes, sieges and visibility grants to
exercise the presentation pipeline. It does not implement a geographic movement
or combat simulation. The legacy Kingdoms engine retains its grid `x/y` positions,
commands, ownership rules and scheduled events; those coordinates are not
converted into longitude/latitude. Its campaign commands remain accessible under
the distinct "إرسال حملة" navigation entry.

Existing Kingdoms villages also have a persisted geographic presentation model.
The server allocates WGS84 locations near the twelve real city centres, beginning
with Cairo, in stable village-ID order. Later cycles use bounded identity-derived
offsets and collision checks. These are allocated gameplay locations, not claims
that player-created villages are historical settlements. Allocation never reads
legacy grid coordinates, and a stored village location never moves after rename,
ownership transfer or the addition of other villages.

An own village clicked on the geographic map exposes an "إدارة القرية" link back
to `/games/kingdoms/?worldId=…&villageId=…&tab=village`. The server accepts a camera
focus only for an owned village. The browser receives no directory of hidden
enemy villages for centering or selection.

The published page also offers a clearly labeled public geographic reference
atlas when a visitor has no authorized geographic campaign. Its twelve GeoNames
landmarks contain only public names and coordinates, and its panels omit all
gameplay facts. This fallback requires no test account or database seed. Signing
in reveals the player's actual member worlds after current-session and membership
checks, including worlds created before geographic integration.

## Host files

```text
apps/web/src/
  app/games/kingdoms/world-map/page.tsx       Authenticated campaign selection
  app/api/kingdoms/world-map/viewport/
    route.ts                               Authenticated bounded GeoJSON endpoint
    route.test.ts                          HTTP/auth/payload boundaries
  lib/mamluk-map/
    storage.ts                             Geographic extents and stored contracts
    data.ts                                Real city centres and fictional campaign
    repository.ts                          Prisma snapshot and spatial queries
    village-geography.ts                   Stable server-side village allocation
    village-geography.test.ts              Allocation/stability/immutability tests
    village-map-security.test.ts           Legacy response non-disclosure checks
    public-atlas.ts                        Read-only public geographic landmarks
    public-atlas.test.ts                    Bounds, closed sessions and nonleakage
    storage.test.ts
    data.test.ts
    repository.test.ts
    repository.integration.test.ts         Isolated PostgreSQL integration
  components/mamluk-map/
    mamluk-world-map.tsx                    Arabic RTL atlas and map controls
    mamluk-world-map.module.css             Existing brand/token styling
    use-world-map.ts                       Lazy SDK initialization and teardown
    map-session.ts                         Authenticated requests and accepted data
    source-identity.ts                     SDK-only string feature ID promotion
    selection.ts                           Authorized selection details
    selection-panel.tsx                    Keyboard-accessible feature directory
    map-fixture.ts                         SDK seam used by unit tests
    *.test.ts / *.test.tsx                  Component/session/selection tests
scripts/prepare-maplibre-workers.mjs        Matching SDK worker deployment files
tools/mamluk/
  compose.yaml                             Existing isolated local PostgreSQL
  host-environment.ps1                     Process-scoped local host settings
  prisma-local.config.ts                   Isolated database migration guard
  seed-world-map.ts                        Explicit local campaign seed
```

The packages remain separate:
[`world-map-core`](../../packages/mamluk-world-map-core/README.md) defines the domain,
server filter and GeoJSON contracts;
[`maplibre-adapter`](../../packages/mamluk-maplibre-adapter/README.md) implements the
presentation boundary. The host imports server functions through the core's
`/server` entry point; browser code imports its contracts and wire decoder.

The Next host keeps the core and `polygon-clipping` external on the server so
Node loads their existing CommonJS implementation. This prevents the bundler from
replacing polygon operations with an incompatible ESM default export. The host's
SDK port also avoids resetting an unchanged projection: MapLibre 6 emits movement
events for redundant resets. Both adaptations preserve the accepted packages.
Matching MapLibre worker and shared-module files are prepared before development
and production builds, using the installed SDK and its retained license.
The SDK source port promotes each approved string feature ID on a copied GeoJSON
property so actual canvas hit tests retain entity identity. This presentation-only
property is never added to the HTTP payload or persisted domain data.
The port tracks the SDK's `style.load` event independently from tile completion.
Movement and expiry can therefore remove old overlays immediately, even while
basemap tiles are loading, and replacement snapshots can populate their sources.

## Persistence and snapshot contract

`KingdomWorld.state.geography` is an optional versioned geographic read model.
`MamlukMapState` holds cities, castles, territories, sultanate territories, armies,
sieges and directional visibility grants. Each `StoredMapRecord<T>` stores its
WGS84 bounding extent alongside `value`. `storeMapRecord` validates geometry and
ensures any supplied extent contains the feature, including antimeridian cases.
Zero-area storage extents are valid for points; requested viewports require
positive area.

`PrismaWorldMapRepository.withSnapshot` opens a `RepeatableRead` transaction,
rechecks the authenticated user's active status and token version, and verifies
membership in the selected world's `players` object. It accepts only a world
whose geography version is `1`. Database time, world revision, entity ownership
and active grants therefore come from one consistent snapshot. Read-session
methods reject use after the transaction closes.

The `kingdom-villages-v1` source tag distinguishes allocated village geography
from an existing explicit Mamluk campaign, which remains unchanged. Existing
worlds receive missing geographic records in an idempotent `ReadCommitted`
transaction under the existing world row lock. Authorization and membership are
rechecked after the lock; only the geography JSONB extension is updated and the
revision advances when allocation changes. Existing command/admin/worker saves
allocate any new villages within their normal locked transaction.

Village queries join stored coordinates to the current authoritative village
records for names, ownership and wall levels. Deleted villages disappear. Finite
visibility areas around owned villages are issued by the server; hidden enemy
villages stay out of the payload. Resources, garrisons, reports and movements are
not copied from legacy state into the geographic payload. This integration does
not synthesize geographic army positions or reveal legacy enemy movements.

Queries use parameterized SQL against the selected world's JSONB arrays, bounding
extent predicates, deterministic ordering and bounded result limits. Point
queries first narrow candidates by authorized grant extents; prepared polygon
tests then enforce the actual geometry and holes on the server. Candidate
saturation that could conceal later visible records fails closed. Polygon
ownership requires explicit authorized territory/border IDs; the core clips those
authorized features to the viewport.

```text
KingdomWorld.state.geography + authenticated identity
  -> Prisma repeatable snapshot and bounded spatial queries
  -> WorldMapService
  -> VisibilityFilter
  -> allowlisted GeoJSON projection
  -> authenticated viewport response
  -> wire decoder / MapLibreAdapter
  -> browser and selection panel
```

## HTTP and browser contract

`GET /api/kingdoms/world-map/viewport` accepts exactly `worldId`, `west`, `south`,
`east` and `north`. Longitude precedes latitude; `west > east` describes a viewport
crossing the antimeridian. Authentication derives the viewer ID from the session.
Duplicate fields, forged viewer parameters and invalid coordinates are rejected.
The existing Kingdoms read limiter permits 120 requests per minute per actor.

The exact reserved ID `mamluk-public-geographic-atlas-v1` is the sole anonymous
exception. It uses the same bounded domain service and GeoJSON projection with
a server-bound public audience and a 15-second reference viewport grant. The
reader contains only public geographic landmarks and never queries game state.
It authorizes no ownership-bearing polygons and returns no armies, routes,
castles or sieges. Requests use the existing rate limiter, scoped to a digest of
the request IP. Every other world ID still requires authenticated membership;
changing the request ID cannot expose a private campaign.

Successful responses contain a raw `MapPayload`, rather than the legacy Kingdoms
`{ success, data }` envelope. The fields are `schemaVersion`, `worldId`, `revision`,
`serverTime`, `expiresAt`, `bounds` and `layers`. The revision is a decimal string.
Responses, including errors, use `Cache-Control: private, no-store` and
`Vary: Cookie, Authorization`. Unauthorized sessions return 401; inaccessible
campaigns return a generic 404; malformed requests return 400. Internal failures
return a generic 503 without repository details or hidden entity identifiers.

The nine GeoJSON layers are:

| Layer | Presentation |
| --- | --- |
| `cities` | Authorized city points |
| `castles` | Authorized castle points |
| `territories` | Authorized, viewport-clipped polygons |
| `sultanateBorders` | Authorized polygon outlines |
| `armies` | Current server-supplied army points |
| `armyRoutes` | Own-army movement lines and supplied schedules |
| `sieges` | Authorized siege markers |
| `visibility` | Territory, watchtower, scouting and alliance visibility areas |
| `fog` | Server-projected unseen viewport geometry |

Fog of War removes hidden information before producing the HTTP payload. Visible
enemy markers omit future routes, destinations and schedules. Siege participants
and grant provenance are excluded. Alliance grants are directional, recipient-
scoped and time-bounded; membership alone does not grant vision. Selection panels
read only accepted payload features, and show route details only for the viewer's
own army. Client code performs screen projection and display formatting, without
calculating authoritative position, duration, ownership, visibility or siege state.

The loader requests one viewport, debounces movement, cancels superseded requests
and rejects late responses. It refreshes accepted data every five seconds. Server
snapshot lifetime is at most 15 seconds, shortened by any earlier grant expiry.
The adapter subtracts request delivery age and clears expired overlays; the
observer also clears the feature directory and displayed details. A selection key
may survive a refresh, but details return only if the new approved payload still
contains that feature. World/user changes
remount the scene, abort requests and dispose SDK resources. Broad views display
the basemap and a zoom prompt instead of requesting the full game world.

## Local fixture

Use the existing isolated Docker fixture described in
[`tools/mamluk/README.md`](../../tools/mamluk/README.md). It provisions PostgreSQL
on loopback port `55437` with a `kingdoms_test_mamluk` database. Preserve the private
runtime credential file and database volume when restarting that fixture.

From the repository root, in a dedicated PowerShell process with dependencies
installed:

```powershell
. ./tools/mamluk/host-environment.ps1
pnpm exec prisma migrate deploy --config tools/mamluk/prisma-local.config.ts
pnpm --filter @mamluk/world-map-core build
pnpm --filter @mamluk/maplibre-adapter build
node --conditions=react-server node_modules/tsx/dist/cli.mjs tools/mamluk/seed-world-map.ts
pnpm --filter @tahaddi/web dev --hostname 127.0.0.1 --port 3000
```

Sign in at `http://127.0.0.1:3000/auth/sign-in/` with the deliberately local fixture
account `mamluk-map@example.test` / `MamlukMapTestOnly42!`, then open
`http://127.0.0.1:3000/games/kingdoms/world-map/`. The seed creates 12 cities, three
castles, three armies including one hidden enemy, campaign areas, a siege and four
visibility kinds. Rerunning it replaces only the named local fixture campaign.
The seed and local Prisma config reject non-loopback databases, database names
outside `kingdoms_test*`, URL options and production-URL fallback.

For an isolated production-mode local build, use the same process settings:

```powershell
node scripts/prepare-maplibre-workers.mjs
pnpm --filter @tahaddi/web exec next build
node scripts/check-public-supabase-exposure.mjs --build-dir apps/web/.next-mamluk/static
node scripts/check-css-hex-budget.mjs
$env:RUN_AUTH_E2E = 'true'
pnpm --filter @tahaddi/web exec next start --hostname 127.0.0.1 --port 3000
```

`MAMLUK_LOCAL_BUILD=1` selects `.next-mamluk`. This local HTTP build and fixture
session settings are for local verification; rebuild with deployment settings for
a release. Close the dedicated shell to discard its process environment.

The host's `predev` and `prebuild` scripts copy the installed MapLibre worker,
shared module and license into `public/maplibre`. Direct `next build` bypasses
those hooks, hence the explicit preparation command above. The hook configures
`setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')`; worker and shared module must
match the installed SDK version. Current CSP permits same-origin workers and
connections to `https://tiles.openfreemap.org`. Keep the provider attribution
control when changing basemap styles.

## Data and attribution

City centres in [`data.ts`](../../apps/web/src/lib/mamluk-map/data.ts) are attributed
to [GeoNames](https://www.geonames.org/about.html), whose geographic coordinates
use WGS84 and whose data is available under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Retain GeoNames credit
when redistributing the city dataset; see its
[data attribution terms](https://www.geonames.org/export/).

| City | Longitude | Latitude |
| --- | ---: | ---: |
| القاهرة | 31.24967 | 30.06263 |
| الإسكندرية | 29.91582 | 31.20176 |
| دمياط | 31.81332 | 31.41648 |
| غزة | 34.46672 | 31.50161 |
| القدس | 35.23388 | 31.78336 |
| دمشق | 36.29128 | 33.51020 |
| حلب | 37.16117 | 36.20124 |
| حمص | 36.72559 | 34.72405 |
| حماة | 36.75783 | 35.13179 |
| طرابلس | 35.84972 | 34.43667 |
| مكة المكرمة | 39.82563 | 21.42664 |
| المدينة المنورة | 39.61417 | 24.46861 |

The OpenFreeMap basemap displays modern OpenStreetMap geography. Campaign polygons,
borders and fixture observations are fictional gameplay data, not historical
Mamluk boundaries or current political claims.

## Production provisioning and performance

A production game/admin writer must authorize geography changes, validate and
store feature extents, derive observations from its authoritative game rules, and
update geography and the world revision together in the existing transaction.
Grant issuance and revocation belong to that server writer. This host adds no
public mutation endpoint or automatic production seed. The local seed is not a
production migration and does not advance army or siege state.

Default core budgets are 90 degrees per viewport dimension, 2,000 entities, 128
visibility regions, 20,000 input geometry positions and 1,000,000 serialized bytes.
Overflow returns an unavailable viewport without publishing partial intelligence.
SQL returns bounded records rather than the full world state to application code;
the browser receives only the authorized projection. Private data belongs only
in the authenticated endpoint, never basemap tiles or public caches.

JSONB array queries still scan candidate arrays inside the selected database row;
the bounding extents are metadata, not indexed PostGIS geometry. Measure row size,
query latency, transaction duration, candidate saturation and payload size before
increasing campaign density. An indexed spatial read model in the same PostgreSQL
database is a later migration option; it must retain world/revision consistency
and the same authorization/filter contracts. Basemap replacement affects the
adapter and CSP, without changing the game domain.

## Verification scope

Targeted host unit/API tests cover auth, malformed requests, hidden enemy output,
storage extents, selection and teardown. PostgreSQL integration tests require
`KINGDOMS_TEST_DATABASE_URL` explicitly and exercise real parameterized queries,
membership, token revocation, dateline bounds and repeatable snapshots. They seed
unique fixture IDs and clean up only their own rows.

```powershell
pnpm --filter @tahaddi/web exec vitest run src/lib/mamluk-map src/components/mamluk-map src/app/api/kingdoms/world-map
```

The local host helper sets loopback authentication and metadata origins for the
browser. The general unit suite expects its normal canonical-origin defaults.
Run that suite in a separate shell; keep the isolated test database settings but
remove those three local origins before running it:

```powershell
. ./tools/mamluk/host-environment.ps1
Remove-Item Env:NEXTAUTH_URL,Env:AUTH_URL,Env:NEXT_PUBLIC_SITE_URL -ErrorAction SilentlyContinue
pnpm --filter @tahaddi/web exec vitest run --maxWorkers=2 --testTimeout=15000
```

The dedicated `apps/web/playwright.mamluk-map.config.ts` suite uses real sign-in,
database requests, MapLibre workers and OpenFreeMap tiles. It verifies desktop and
mobile layouts, projection controls, viewport updates, authorized panels and
absence of hidden enemy data. Run it against the already running local fixture:

```powershell
. ./tools/mamluk/host-environment.ps1
$env:RUN_MAMLUK_MAP_E2E = '1'
pnpm --filter @tahaddi/web exec playwright test --config playwright.mamluk-map.config.ts
```

For manual server-side revocation proof, run
`node --conditions=react-server --import tsx tools/mamluk/verify-visibility-revocation.ts revoke`,
observe the enemy disappear from both the next network payload and the map, then
run the same command with `restore`. The utility changes only the exact local
fixture's watchtower/scouting grants, preserves the legacy world state, and
increments its revision in the existing database transaction. Do not run this
mutation while the read-only browser suite is checking the fixture.

## Verified result — 1 October 2026

The actual Next production build was started at
`http://127.0.0.1:3000/games/kingdoms/world-map/` against the isolated local
PostgreSQL campaign. Both the in-app browser and the dedicated browser suite
displayed real OpenFreeMap tiles with Cairo at its geographic location, city and
castle markers, campaign borders, army markers and movement line, siege marker,
visible areas and fog. The initial camera focuses on the Middle East.

- Full web suite: **229 files / 1,227 tests passed**, including the real database
  integration tests. Five tests specifically exercise the geographic repository.
- Host presentation unit suite: **21 passed**, with **96.9% statements and 85.51%
  branches** covered. Backend repository/storage coverage also exceeds 80%.
- Existing core and adapter suites: **93 passed**; their source was unchanged in
  this host integration.
- Actual browser suite: **2 passed**, desktop and mobile, using authenticated
  requests, real workers and real basemap tiles. Actual canvas clicks opened city,
  castle, own army, visible enemy army and siege information. Pan, zoom, both
  projection controls, viewport updates and mobile sheet behavior passed.
- Every completed viewport response inspected by the browser suite returned 200,
  stayed bounded, omitted the hidden enemy and omitted visible-enemy plans.
  There were **zero browser console errors or uncaught page errors**.
- Manual database grant revocation removed the previously visible enemy from the
  next HTTP payload and UI; restoring the local grants restored authorized data.
  The fixture was left restored. Movement and expiry removal also pass the
  pending-tile regression test.
- Full web TypeScript check and the production build passed. Full web lint passed
  with zero errors and two existing unused-variable warnings in Quote Master.
  The public-build exposure guard, CSS budget guard and scoped diff check passed.

Screenshots of the real desktop and mobile renders were saved as
`mamluk-map-desktop-overview.png` and `mamluk-map-mobile-overview.png` in the task's
visualization artifacts, along with actual marker-click screenshots.

These results describe the original local integration before the release was
ported onto the current production branch. The campaign's persisted observations
remain fixture data; a geographic gameplay simulation is a separate implementation.

## Release validation — 1 October 2026

The release preserves the current production Kingdoms progression, realtime
service, Prisma schema and Sentry integration. It adds the public reference atlas,
the private geographic reader, host UI, package build dependencies, MapLibre
workers and OpenFreeMap CSP sources. No production database seed or migration is
part of deployment. The public route works without provisioning a game account.

The updated production branch passed 222 test files / 1,287 web tests, including
the real isolated PostgreSQL integration tests, plus the 93 accepted package
tests. Public atlas and host UI tests cover bounded reads, no private game data,
revoked sessions, world selection and reference-only details. The dedicated real
browser suite passed all four cases: public atlas and private campaign on desktop
and mobile, with real tiles, Cairo marker clicks, projection controls, pan/zoom,
bounded responses and no console errors. The private campaign retains all nine
layers and excludes hidden enemy information before its network response.

Full web typechecking and lint passed; lint retains one existing Next navigation
warning in `site-shell.tsx`. A production Next build and public-bundle/CSS guards
passed. The deployment builds both accepted packages before the web host.

The dependency audit found the existing Next 16.3.5 critical
[ImageResponse advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).
The release applies the scoped 16.3.8 patch to Next and its ESLint configuration,
including the [September security fixes](https://nextjs.org/blog/september-2026-security-release).
Other pre-existing transitive dependency advisories are outside this map release;
the audit is not a clean audit of every application in the monorepo.

After the 16.3.8 patch, the production build, TypeScript check and lint passed
again. The web rerun passed 1,264 tests while all 23 database tests failed because
Docker Desktop had stopped. Restarting the existing local container and rerunning
those three integration files passed all 23 tests; no production database or test
expectation was changed. The repeated audit reports zero critical advisories.

## Existing village navigation — 1 October 2026

Village and overview navigation now opens the geographic route with the active
world and owned village identifiers. The server validates membership, provisions
stable longitude/latitude coordinates into the existing `KingdomWorld.state`
JSONB geography extension, and focuses the camera on the owned village. Legacy
grid coordinates are never treated as geographic coordinates. Existing command
and progression behavior remains in the separately labeled campaign controls.

The geographic reader projects current village names and ownership. It omits
deleted villages and filters enemy villages before constructing the response.
Own village visibility is finite, and private resources, troop inventories and
legacy movement plans are never projected. The accepted domain and MapLibre
adapter packages remain unchanged.

The full web suite passed 225 files / 1,318 tests, including real isolated
PostgreSQL tests. Six real-browser cases passed across desktop and mobile,
including opening an existing village world, clicking its geographic marker,
and returning to the correct village management screen. Typechecking, lint and
the production build passed; the existing navigation lint warning remains.

Production browser verification on the signed-in canonical site confirmed that
the actual village “عاصمة االحاكم” appears at Cairo, `[31.24967, 30.06263]`,
with its current ownership and wall level. Bounded viewport responses contained
the owned village and finite visibility/fog, without hidden enemy information
or private gameplay fields. Globe/flat controls, zoom and pan changed the real
basemap and requested geographic bounds without browser console errors.

One production HTTP 200 took 26.7 seconds, exceeding the 15-second snapshot
lifetime. The adapter correctly discarded it. Host recovery now requests a new
snapshot with at most three retries after 1, 2 and 5 seconds. Accepted snapshots
reset the retry budget; movement, newer loads and teardown cancel pending
retries. It preserves clearing and expiry and never extends a snapshot's lifetime
or reuses expired information. Eleven session tests passed, with 94.33% statement
and 81.25% branch coverage, including delayed delivery, repeated failure and
cancellation races.

## Village borders and public settlements

Village worlds treat settlement names, geographic coordinates, player ownership
and game plot boundaries as public map information for authenticated members of
the same world. This policy supersedes military-vision gating of village sites
in the first village-navigation release. Resources, troop inventories, enemy
army positions, movement plans and siege intelligence remain private. Explicit
geographic campaigns retain their existing visibility policy.

Public settlements are projected in a separate allowlisted batch in the same
authorized repeatable-read transaction as the private map snapshot. Its temporary
presentation grant is used only for cities and village territories. It never
feeds the private army, route, siege, watchtower, scouting or alliance reader.
Only the approved settlement layers replace the original city/territory layers;
private visibility and fog remain unchanged. Combined payload size, entity and
vertex limits are enforced, and every query remains limited to the viewport.

Each representable village gets a server-persisted geographic game plot around
its stable location. Balanced partitions separate neighbouring plots without
moving village coordinates. These are game boundaries, not municipal boundary
claims. A plot below the accepted geometry package's minimum area is omitted
without hiding its public village marker or failing other sites; omission
metadata remains server-only and does not cause repeated provisioning.

The host renders gold outlines from the approved territory GeoJSON source.
Approved settlement overlays appear above the fog shading, while hidden military
data remains absent from the network response. Normal clearing, expiry, movement,
style replacement and teardown remove these outlines with their territory source.
The regional village camera starts at zoom 6.5 to show neighbouring settlements
on desktop and mobile; users can zoom in to inspect individual plots.

The updated full web suite passed 227 files / 1,339 tests. All six real-browser
cases passed on desktop and mobile, including a different player's village and
plot outside military vision, redacted enemy fortification, own-village marker
clicks and authorized management links. Hidden armies, resources and troop
inventories remain absent from these responses. The focused backend modules
passed 80 tests with 92.69% branch coverage; host presentation passed 33 tests
with 87.59% branch coverage. Typechecking, lint and the production build passed.
Lint retains the existing site-shell navigation warning. The dependency audit
reports zero critical advisories and pre-existing transitive advisories.

Docker Desktop stopped during the first browser run. Restoring its temporary
IPC directory and restarting the existing isolated container preserved its
database; all six browser cases then passed without changing test expectations.

## Illustrated physical map presentation

The host applies `buildPhysicalMapStyle` through MapLibre's `setStyle` transform.
It retains OpenFreeMap Liberty's sources, sprites, glyphs and attribution. Its
existing Natural Earth `ne2_shaded` source supplies geographic shaded relief;
azure water, parchment land and green landcover use host design tokens. The
raster source's maximum zoom remains 6: closer views overzoom its tiles, so
terrain becomes softer while coordinates and vector features remain accurate.
Modern place labels and roads appear only at detailed zoom. Basemap country
lines are geographic context, distinct from server-approved game plot borders.

Provider credits remain visible in the map control. Customized basemap design
uses OpenFreeMap / OpenMapTiles / OpenStreetMap data and the OSM Liberty style.
Natural Earth relief is public-domain cartographic data. Refer to the upstream
license sources below before replacing or redistributing basemap resources.

The transparent village and castle illustrations are generated original game
assets, stored at `apps/web/public/game-art/mamluk-map/village.png` and
`castle.png`. Each is trimmed and exported as a 256px PNG, together about 83KB.
The SDK loads both static same-origin files once per map instance. Successful
registration replaces only the approved city/castle circle layers, preserving
layer IDs, sources, filters, feature identity and the adapter's clearing/expiry
lifecycle. The bottom anchor sits on the existing longitude/latitude coordinate.
Failed asset loading or registration leaves both original circle layers usable.
Cached artwork is restored before the adapter handles style replacement; abort
and teardown never wait for an outstanding image request.

Artwork prompt set (transparent background for both):

- Village: One isolated miniature medieval Mamluk village, six warm sandstone
  and adobe houses, a small central golden dome, two date palms and an arched
  courtyard gate on a compact pale-sand oval base with an aged-gold rim. Three
  quarter isometric view, warm daylight from the upper left, Egyptian/Levantine
  materials, bronze details and limited emerald, fully visible and centered,
  readable at 64px. No people, modern objects, text, logo, watermark or background.
- Castle: One isolated miniature medieval Mamluk citadel, warm sandstone walls,
  four crenellated round towers, a tall arched entrance, central turquoise dome
  and gold finial, a crimson pennant and one date palm on a compact oval stone
  base with an aged-gold rim. Match the village's view, lighting and materials;
  fully visible, readable at 64px. No text, people, modern objects or background.

The desktop panel floats over the full map; mobile uses a bottom sheet. Owned
village links retain server-provided world/village context, and search operates
only on the current approved viewport snapshot. Military fog shades the basemap
at 0.14 opacity; the server still excludes hidden armies, routes, siege details,
resources and troop information before serialization. Visual fog opacity is not
an authorization mechanism. This presentation release adds no settlements,
changes no geographic locations and does not modify either accepted package.

Upstream sources: [OpenFreeMap quick start](https://openfreemap.org/quick_start/),
[OpenFreeMap license](https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md),
[OSM Liberty license](https://github.com/maputnik/osm-liberty/blob/gh-pages/LICENSE.md),
[Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/) and
[Natural Earth II](https://www.naturalearthdata.com/downloads/10m-raster-data/10m-natural-earth-2/).
The host changes the Liberty palette, layer visibility and relief opacity;
its linked OpenMapTiles and OpenStreetMap corner attribution remains intact.

Validation for this presentation change: focused host tests cover failed image
loading/partial registration, deferred style readiness, replacement, viewport
clearing, TTL expiry and SDK click identity. The new isolated desktop/mobile
browser cases additionally require actual raster and both artwork HTTP 200
responses. They were updated and linted but could not run in this session:
the automatic tool policy rejected starting the local host server. Do not count
these cases as passing. Authenticated production browser verification follows
publication and is recorded separately in the release report.

### Supplied reference image as the primary basemap

The user's supplied second reference (the physical atlas without painted villages)
is the primary presentation image. The image-generation edit removes only its
baked-in zoom/target and globe/flat controls; live host controls replace them.
Its geography, borders, relief, framing and colors are retained. The cleaned
1859×846 image is exported as the 191KB same-origin
`apps/web/public/game-art/mamluk-map/reference-basemap.webp`.

`buildReferenceMapStyle` adds this fixed image source and one raster layer above
provider basemap layers and below all approved game layers. Existing OpenFreeMap
geography supplies coverage beyond the supplied image. The image contains no
village, castle, army, ownership or intelligence data. It never replaces or
alters the game GeoJSON, entity IDs or server-provided longitude/latitude.

The attachment has no geographic projection metadata. Host corner registration
is a measured, approximate Mercator fit, anchored by the Egypt/Libya/Sudan
tripoint (25°E,22°N) at image pixel (737,426) and checked against the nearby
Libya/Sudan/Chad tripoint (24°E,19.5°N) at (729,450). A broad 8px per longitude /
Mercator-degree scale places Cairo near image pixel (787,354) and Gaza (813,341).
The [official boundary study](https://library.law.fsu.edu/Digital-Collections/LimitsinSeas/pdf/ibs010.pdf)
confirms these geographic tripoints. This artistic registration has local
residual error, is not a surveyed map, and becomes soft when highly magnified.
Do not adjust game coordinates to match the picture or use its painted borders
to calculate ownership, travel, military positions or visibility. Those remain
server-authoritative. Precise global image alignment would require a geographic
source image with known projection or additional surveyed control points.

## Stable village markers and one-time relocation

The authenticated viewport response carries `X-Mamluk-Public-Settlements: 1`
only when the same authorized repository snapshot explicitly permits public
village locations. This header is outside the accepted domain payload. The reserved
read-only reference atlas also grants public settlement retention; private campaigns
return `0`, and denied requests carry no retention permission. The host retains only
the already approved city and village plot sources during polling, panning, zooming
and manual refresh. Public city source copies contain only the name, region and
ownership fields. Current private details and all military intelligence still clear
normally. Errors, policy downgrade, style replacement, world/viewer session reset
and teardown clear the retained public presentation. New authorized bounded
snapshots replace its data, including deleted or relocated villages; no whole-world
cache is introduced. Identical public snapshots reuse their source data instead of
rebuilding symbols every five seconds.

Camera initialization depends on scalar authoritative coordinates, rather than the
identity of a location prop object. Parent rerenders keep the existing SDK canvas,
camera and session. An accepted relocation recenters that same canvas. Payloads are
tagged with their world/viewer session so a changed viewer cannot reuse public UI
state from the previous session.

### Player boundaries and interactive presentation

Each approved village territory uses a deterministic owner color, an outline with a
dark halo, and a matching ground ring under its settlement artwork. The viewer's
territory is gold; independent plots use the neutral token. Selection highlights
the approved city and its existing territory feature together. Geometry always
comes from the server's village plots: the host does not infer connected empire
polygons, geographic borders, or ownership from the basemap.

The ownership legend groups visible plots and focuses their approved city at zoom
11, where the village boundary can be inspected. Directory selection preserves the
current zoom. Basic public names, coordinates, ownership and village management
links remain available while refreshing; private statistics require the current
payload. The existing relocation draft remains mounted, with confirmation disabled
until current authorization is available again.

Settlement artwork is bottom-anchored to its geographic coordinate and stays upright
through camera rotation and pitch. Overlapping SDK hit areas resolve to the nearest
approved marker body rather than layer order. Click properties cannot supply panel
content or an unapproved entity. Ground rings and boundaries follow the map plane.
The supplied atlas raster fades out between zoom 5.5 and 8, and the low-resolution
relief fades between zoom 7 and 10, exposing precise provider geography at village
detail scale without shifting any game coordinates.

Validation for this update passed 142 focused tests across 15 files, with 98.52%
line and 91.32% branch coverage for the map presentation modules. All six isolated
desktop/mobile browser cases passed for the anonymous atlas, authenticated campaign
and actual village world; both village cases were rerun after the final label and
panel-artwork polish. They verify real coordinate hit testing, owner boundary focus,
an unchanged SDK canvas during a deliberately held refresh, retained basic village
details, and removal of private statistics during that refresh. Production build,
TypeScript and lint completed successfully; lint retains one existing navigation
warning in `site-shell.tsx`. These results are local and do not claim a production
deployment.

### One-time relocation

The owner can request one geographic relocation per village through
`GET /api/kingdoms/world-map/relocate/?worldId=…&villageId=…` (eligibility) and
`POST /api/kingdoms/world-map/relocate/` (confirmed request). The POST body contains
only `worldId`, `villageId`, `idempotencyKey`, `longitude`, and `latitude`.
The existing authenticated Kingdoms envelope, same-origin protection, bounded
JSON reader and rate limits apply. The server rechecks current membership,
account/token validity and ownership inside the world transaction. The permanent
one-use record is keyed by village identity, rather than account or browser state.
Concurrent requests and exact retry handling share the existing PostgreSQL
serialization boundary. No schema migration or second persistence system is added.

Geographic relocation updates the persisted settlement location and game plot
geometry together with the world revision. It does not translate or move the
legacy Kingdoms grid, armies, routes, scheduled travel or combat state. The supplied
artwork is still presentation only; its approximate calibration never authorizes
or calculates a relocation.

Targeted validation passed 24 files / 214 tests, including real PostgreSQL
transactions, concurrent competing moves, exact retries, ownership/token denial,
old/new bounded viewport queries, high-latitude vision and preservation through
ordinary game commands. Presentation tests cover uninterrupted public source
identity, private attribute scrubbing, expiry/error cleanup, editable relocation
drafts during polling and camera/home updates from accepted server coordinates.
The polling module has 90% branch coverage; relocation backend exceeds 83%,
relocation UI exceeds 93%, and viewport transport exceeds 90%. Production browser
verification exercises the form without consuming a real player's one-time move;
actual mutations are tested only against unique isolated database fixtures.

### Selecting a relocation destination on the map

Selecting an owned village and pressing **نقل القرية** starts destination picking
directly. On a phone, the details panel is hidden while its form remains mounted,
so the canvas remains available for touch. A map tap previews the new destination
without changing the persisted village. **استخدم مركز الخريطة** provides a
keyboard-friendly alternative; **راجع الوجهة** returns to the approval form.
**إدخال الإحداثيات يدويًا** remains optional and accepts Arabic/Persian digits and
decimal separators without clearing incomplete drafts during mobile typing.

The destination marker is temporary and independent of the authoritative village
sources. Ordinary polling, camera movement and projection changes retain it;
cancellation, success, village changes, disposal or a different world/viewer clear
it. Choosing another destination resets consent. No relocation POST is sent until
the player explicitly accepts the one-use warning and confirms the reviewed
destination against a current approved map payload. Canonical trailing-slash
routes avoid redirecting the POST.

The existing administrator endpoint also accepts a strict **relocate** command for
explicitly requested operational moves. Its form previews the selected village,
owner and current location, requires consent, and sends the expected owner ID.
ADMIN/OWNER account and token validity are rechecked inside the world lock; pause,
season, military activity, occupied destination and the permanent one-use rule
remain enforced. The relocation history and existing audit receipt identify the
actual administrator. Ownership, legacy grid and military travel are preserved;
the existing transaction may advance ordinary due game events before saving.

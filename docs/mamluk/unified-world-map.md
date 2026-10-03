# Unified Mamluk world map

## Scope and work ledger

Pass: loop. Goal: a single geographic map across world and campaign selection,
stable authorized village markers, existing gameplay unchanged.
Core: authoritative KingdomWorld projection; one MapLibre renderer.
Verified: the old campaign entry point used a second SVG implementation; polling
cleared still-authorized data before its replacement arrived (red regression).
Verified: renderer/server integration, browser interaction, final lint/typecheck/build.
Open: pre-existing dependency audit advisories, outside this map-only change.

## Discovery before implementation

CodeGraph queried `MapPanel WorldMap MamlukWorldMap useWorldMap` and
`KingdomsClient MapPanel WorldMap VillageMap KingdomsGlobe MapCanvas` in the indexed
primary checkout before changes. The clean release checkout at baseline `45817f9`
is unindexed; CodeGraph reported that limitation. Targeted source/caller searches
in that checkout are the final authority (its overview already links to the atlas).

| Surface | Classification | Action |
| --- | --- | --- |
| `mamluk-world-map.tsx` / `use-world-map.ts` / MapLibre adapter | ACTIVE | Shared world and target selector |
| `kingdoms/map-panel.tsx` | ACTIVE | Existing mission form embeds shared map |
| `kingdoms/world-map.tsx`, artwork, overlays, layout, navigation, decorative terrain | DUPLICATE → DEAD | Remove after replacing last production caller |
| `VillageMap` / `VillageScene` | ACTIVE, separate purpose | Building-lot scene retained; not geographic world map |
| `architecture-map.tsx` | Outside scope | Architecture diagram retained |
| `map-fixture.ts`, globe browser harness | FIXTURE | Tests only |
| Public atlas landmarks | ACTIVE reference | Real geographic reference, no campaign armies or invented villages |

Dependency path:

```text
KingdomWorld.state → authorized projectWorld → persisted WGS84 village geography
  → bounded viewport/overview API → map session → MapLibre sources/layers
World route ───────────────────────┐
Campaign MapPanel + MapMode ────────┴→ MamlukWorldMap → useWorldMap
  confirmed village ID → existing caller's view.map → existing march command
```

Modes change presentation and target confirmation, not mission validation,
troop strength, speed, prices, arrival times or engine state. Target selection
does not dispatch a command. The existing campaign form still dispatches it.

## Data boundaries

- Village level, rank, power, visual tier and construction status come from the
  existing server projection; own private fields do not appear for enemy markers.
- `POPULATION_DATA_NOT_AVAILABLE`: no authoritative population field exists;
  details display `—` rather than an estimate.
- No client target ETA formula is added. Existing authoritative movement arrival
  times remain visible; unavailable previews remain unavailable.
- Empty settlement/resource grid cells have no authoritative WGS84 mapping.
  Their existing coordinate form remains available; the geographic map explicitly
  says that these cell previews are unavailable. No inverse mapping is invented.
- Existing WGS84 relocation and membership/revocation rules remain in force.
- Test fixtures are never promoted to production campaign geography.

## Stability regression

The five-second refresh invalidated the displayed payload before the eight-second
authorization expiry. A regression asserts the accepted snapshot stays visible
while a refresh is pending. Security expiry/revocation still clears private data;
keeping data during loading does not extend its authorization deadline.

## Bounded global view

Global zoom uses authenticated SQL aggregation into at most 288 fixed geographic
cells. Local zoom uses the existing viewport API and MapLibre worker clustering.
String IDs use the same explicit SDK identity promotion as village markers.
Accepted layers remain visible until replacement data arrives. Mode switches do
not recreate the map. Single-ID location requests support distant directory
selection without downloading a world geographic directory.

Both new read endpoints provision legacy village geography through the existing
authorized, locked, idempotent helper. A concurrent first-location/overview test
verifies one geography revision and unchanged gameplay fields. No new schema.

## Verification

- 346 web tests passed across 39 files, including real PostgreSQL integration,
  projection permissions, expiry, stale responses, modes and campaign commands.
- Core: 77 tests passed; lines 98.26%, branches 92.49%.
- Adapter: 20 tests passed; lines 94.57%, branches 87.5%.
- Six actual MapLibre browser scenarios passed across desktop and Pixel 5:
  global-cell click/zoom, mission switching with preserved instance/camera,
  refreshed village identity and globe/flat projection switching.
- Scoped ESLint, both map package formatting checks, TypeScript, production build
  and `git diff --check` passed. Build also runs public-secret/CSS-budget checks.
- An isolated PostgreSQL regression aggregates 10,001 villages to one cell under
  1 KiB; the adapter's 10,000-feature regression verifies unchanged refreshes do
  not recreate sources or upload unchanged data. Neither is a browser FPS or
  concurrent-player capacity benchmark; underlying world storage remains JSONB.
- `pnpm audit --prod --audit-level high` reports 28 existing dependency advisories
  (13 high, 11 moderate, 4 low). This change adds no dependencies and changes no
  manifests or lockfile; dependency remediation is outside this request.

The old SVG renderer and its sole-use helpers/tests were removed after caller
verification. Its CSS now contains only the still-used campaign form layout.
Gameplay engine, domain rules and Prisma schema have no diff.

Work is local on `codex/unified-mamluk-map`; no remote publication is part of this
map-only implementation.

# Production-base compatibility addendum — 2026-10-03

This release is integrated onto GitHub main `8e5d236`, which already contains a newer persisted WGS84 atlas, one-time village relocation, public-settlement isolation, commanders, resource expeditions and alliance events. The original checkpoint report below describes the older working-directory baseline; the differences in this section supersede its grid-projection and file-inventory descriptions for this release.

- Preserve every existing persisted village location, relocation endpoint, atlas presentation and public/private visibility boundary. Do not derive live geographic positions from the unrelated simulation grid.
- Managed village atlas reads now obtain `projectWorld` at the same RepeatableRead snapshot server time. Public village owner/name/alliance and own fortification levels use this authoritative projection; enemy fortifications remain zero. The existing SQL still bounds the returned settlements/plots and removes deleted villages.
- Project only the viewer's garrisons and outbound village-to-village movements using persisted endpoint coordinates. Distance is simulation tiles and arrival/departure timestamps come directly from the engine. Interpolation handles the short antimeridian arc. No troop counts or enemy movements are disclosed.
- Derive an alliance border only from the viewer's own persisted village plots. Its explicit visibility grant does not expose other alliance members' private territory or forces. Existing public plot ownership stays authoritative through the production SQL projection.
- Legacy campaigns retain their original bounded geographic repository and visibility policy. They are not automatically converted or overwritten. Managed-village gameplay uses the engine's current data instead of stored army fixtures.
- Keep reconnect/revision-triggered authenticated refetch, existing expiry behavior, route safety and UI selection/relocation machinery.

Release-specific limitations: legacy return movements lack a departure anchor. Empty-grid occupation/settlement/resource-expedition targets have no persisted geographic endpoint. These routes/markers are omitted, while their gameplay continues unchanged. Simulation-grid territory outside persisted village plots is not fabricated on the atlas. Full alliance intelligence is not newly granted. There is no new DB schema or migration, and read-time due-event projection does not persist changes or increment the revision.

Release files: new `kingdom-projection.ts` and test; surgically changed map repository and DB regression; new `map-revisions.ts` and test; revision wiring in the existing `use-world-map.ts`; tile-aware selection labels; optional route units in core models/builders/validation/payload with tests; exported polygon union in core spatial. No production geography/relocation/domain features were replaced by older checkpoint files.

Verification on this release tree: 65 scoped web map/security/selection/revision tests passed; 14 real PostgreSQL map/relocation integration tests passed (including new current-gameplay/due-wall/ETA/no-private-leak/no-write regression); 76 core tests passed; scoped ESLint and web TypeScript passed. Independent domain-agent map review found no actionable blocker. Far-away public settlement visibility and hidden foreign forces have explicit regression coverage. Browser results in the original report below are prior-checkpoint evidence, not a browser run of this production merge.

---
# Phase 2 — Unified world checkpoint

Status: PASS for the existing gameplay systems; unavailable future concepts are listed below.

## Source and architecture

CodeGraph traced `useWorldMap → createMapSession → viewport route → WorldMapService → PrismaWorldMapRepository → KingdomVillageReadSession → projectWorld/advanceWorld`.

Playable `KingdomWorld.state` always takes precedence over a stored `geography` campaign. The existing deterministic grid-to-WGS84 projection preserves simulation coordinates. Geography-only legacy snapshots retain their existing authorized reader; they cannot override a playable world.

The map now derives village positions, cell ownership, alliance membership/borders, own garrisons and outbound movement markers/routes from the authorized engine view. Shared alliance cell edges are dissolved through the existing polygon library. The engine's public villages/territories and private own-force policy remain unchanged. No enemy troop/resource payload is introduced.

Outbound positions interpolate authoritative departure/arrival times on the server. Routes carry explicit `distanceUnit: tiles`; existing routes without a unit remain metres. Arabic selection labels respect that distinction. Travel duration is never calculated from geographic distance. Map revision events trigger authenticated viewport refetches; reconnect refetches and the existing five-second viewport refresh remain active.

## Storage decision

- Concept: geographic presentation of existing world gameplay.
- Current storage: authoritative `KingdomWorld.state` JSON and persisted revision.
- Considered: derive from the existing world; new geographic tables; hybrid persisted projection.
- Selected: derive from the existing world inside the existing repeatable-read transaction.
- Reason: avoids duplicated ownership and gameplay engines; preserves old state and command locking.
- Migration risk: LOW. No migration or production-data rewrite.

## Validation

- Before: 87 web map tests passed; five database tests skipped without an isolated database.
- After: 97 web map tests passed, including six real PostgreSQL snapshot/integration tests.
- Core: 79 tests passed, including explicit legacy distance compatibility, tile-unit round-trip and invalid-unit rejection.
- Adapter: 19 tests passed.
- Web/core/adapter TypeScript passed; changed web files ESLint passed.
- Arabic kilometre/tile selection assertions passed.
- Browser: existing `kingdoms-globe.spec.ts` passed both desktop and mobile projects (2 tests, 27.5 seconds), using temporary isolated fixture/config copies on localhost:3311. It exercised the actual MapLibre SDK, live basemap tiles, village selection/navigation, consistent globe/flat coordinates, keyboard panning, full-globe overview, RTL layout and absence of page errors. Temporary source/config copies were removed after the run.
- Browser scope: this existing fixture uses the real village engine and a fixture viewport DTO. It does not prove production authentication/persistence or socket delivery; those are covered separately by PostgreSQL/service integration and revision-subscription tests. The older authenticated `mamluk-world-map` browser suite requires its preseeded localhost:3000 geographic campaign host and was not run against this isolated setup.
- No database schema change; snapshot authorization, token revocation and membership checks retained.

## Files

- `apps/web/src/lib/mamluk-map/kingdom-read-session.ts` and its new test: unified projected read model and behavior coverage.
- `apps/web/src/lib/mamluk-map/kingdom-territories.ts`: real cell ownership and dissolved alliance borders.
- `apps/web/src/lib/mamluk-map/kingdom-armies.ts`: owned garrisons and outbound authoritative movements.
- `apps/web/src/lib/mamluk-map/repository.ts`, `repository.test.ts`, `repository.integration.test.ts`: gameplay precedence, legacy compatibility, PostgreSQL snapshots.
- `apps/web/src/components/mamluk-map/map-revisions.ts`, its test and `use-world-map.ts`: revision/reconnect subscription and cleanup.
- `apps/web/src/components/mamluk-map/selection.ts` and its test: explicit Arabic route distance units.
- `packages/mamluk-world-map-core/src/{models,validation,builders,payload}.ts`: backwards-compatible optional route distance unit.
- `packages/mamluk-world-map-core/src/spatial.ts`: reuse polygon union for presentation borders.
- `packages/mamluk-world-map-core/test/{models,payload}.test.ts`: unit and transport compatibility coverage.

## Limitations

- Existing return movements discard their origin. Their marker/route is omitted instead of inventing a position; preserving return origins belongs to the live-army phase.
- Persistent stationed reinforcements in foreign villages are not newly exposed; existing own outbound reinforcement missions are projected.
- Castles, multi-stage sieges, capitals, provinces and strategic-site control have no authoritative gameplay entities in this baseline. They are not fabricated from demo campaign fixtures.
- Projection still uses the existing `projectWorld` advancement per read. Payloads retain viewport/entity/vertex/byte budgets; there is no new persistent cache or spatial index. Large-world projection performance needs separate measurement before expansion.
- This phase does not start fog-of-war redesign, siege gameplay or other phase-6+ work.

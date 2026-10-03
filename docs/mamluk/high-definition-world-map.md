# High-definition Mamluk world map

Release integration date: 2026-10-03. Based on production commit `9534f33`.
This release extends the existing unified MapLibre map. Gameplay, authorization,
Prisma schema, dependencies and the lockfile are unchanged.

## CODEGRAPH FINDINGS

The initial implementation used CodeGraph in the primary checkout for map,
selection, progression and viewport paths. Release comparison found that production
already contained newer unified map modes, public atlas, SQL overview aggregation,
relocation and source-upload deduplication. The isolated release preserves these
and ports only the HD presentation changes. Its unindexed checkout was inspected
using targeted source and Git comparisons.

## MAP ENGINE

One MapLibre 6.11.2 instance supports globe/flat projection, world overview,
kingdom navigation and local village selection. Existing campaign target-selection
and relocation flows remain active. Authenticated world changes retain existing
session isolation. The normal world route opens globally; explicit village links
keep their destination.

## MAP STYLE

A local historical-style basemap uses open vector geography with muted sand,
forest, deep water and restrained gold accents. Modern motorway shields, airports
and extruded buildings are omitted. Existing production kingdom interface tokens,
Sentry integration and realtime routing are preserved. Geographic labels describe
reference geography, not invented historical political boundaries.

## WORLD DETAIL LEVELS

The existing global overview aggregates public villages into bounded geographic
cells; local views use authorized viewport data and worker clustering. Geographic
labels gain detail with zoom. Local villages receive architectural sprites from
approved progression metadata. Unknown/private levels remain generic.

## TERRAIN

OpenFreeMap supplies coasts, islands, rivers, lakes and land cover. Existing Natural
Earth tiles provide low-zoom relief. Mapzen Terrarium DEM hillshade appears from
zoom 3 with source zoom capped at 12. No heavy global texture or terrain mesh is
introduced. No oasis, wadi or historic trade-route data is fabricated.

Sources: [OpenFreeMap](https://openfreemap.org/),
[OpenStreetMap attribution](https://www.openstreetmap.org/copyright),
[Mapzen terrain](https://registry.opendata.aws/terrain-tiles/).
The style retains attribution and centralizes assets in `MAP_ASSETS`.
CSP adds only the explicit terrain tile origin.

## TERRITORIES

Existing authoritative territory geometry, stable ownership colors and selected
village treatment remain in place. Low-opacity fills preserve geographic detail.
No client-inferred ownership, alliance or combat state is introduced.

## VILLAGE MARKERS

Original SVG architecture is registered into a shared HiDPI sprite atlas and used
through the existing settlement presentation pipeline. Existing same-origin
artwork remains a loading fallback. No per-village DOM markers are introduced.
Level 50 receives the capital silhouette; distant overview cells continue to
aggregate public village locations without exposing private progression.

## VISUAL TIERS

| Level | Existing tier | Presentation |
| --- | --- | --- |
| 1–5 | 1 | Settlement |
| 6–10 | 2 | Village |
| 11–20 | 3 | Prosperous village |
| 21–30 | 4 | Town |
| 31–40 | 5 | City |
| 41–49 | 6 | Great city |
| 50 | 6 | Capital variant |

The existing `villageVisualTier`, `villageLevel`, rank and power are consumed only
when authorized. Population remains explicitly unavailable. Existing details show
owner relationship, kingdom, alliance and construction state without inventing data.

## LABEL SYSTEM

Native MapLibre Arabic shaping/bidi uses self-hosted subsets of the existing Cairo
font. Geographic labels prefer Arabic. Halos, collision handling and zoom-dependent
sizes keep labels readable. No new font package or RTL plugin is installed.

## CLUSTERING

Production's public/local cluster pipeline remains active. Global SQL overview is
bounded to 288 cells; local cluster expansion retains stable IDs and camera state.
The adapter also exposes tested optional HD symbol layers for other callers; the
production host uses its existing settlement pipeline rather than duplicate layers.

## HIGH-DPI SUPPORT

The renderer retains native devicePixelRatio handling. Sprite registration uses a
DPR of 1–4 with matching logical dimensions. Vectors and labels remain sharp on
4K displays; hillshade detail remains bounded by its DEM source resolution.

## PERFORMANCE

Accepted snapshots remain visible while replacements load, subject to existing
privacy expiry. Unchanged source signatures avoid redundant `setData` uploads.
The new `latestRenderMetrics` accessor reports submission CPU time, total synchronous
render CPU time, feature count and payload bytes.

Existing production aggregation already covers dense worlds: its integration
regression aggregates 10,001 villages into one cell under 1 KiB. Local detailed
responses retain their existing 2,000-entity and 1 MB limits. The adapter includes
an unchanged-refresh 10,000-feature regression. These are not GPU FPS, physical-device
memory or concurrent-player capacity benchmarks; world storage remains JSONB.

One local Chromium/SwiftShader sample on the final production build measured
public readiness at 3,784 ms, authenticated readiness including sign-in at 2,489 ms,
one 296-byte overview response at 63.9 ms, one canvas and 31.2 MB used JS heap.
This is a single software-rendering fixture sample, not a hardware performance guarantee.

## RESPONSIVE

Existing desktop panels and mobile bottom sheet are preserved. Layer controls,
My Kingdom and north reset use the shared map. No second minimap renderer is added.

## ACCESSIBILITY

RTL, Arabic control labels, keyboard navigation, visible focus, searchable location
list and existing selection dismissal remain available. Native checkboxes control
layers. Camera easing respects reduced motion. Unsupported gameplay controls are
disabled, without introducing artificial actions.

## FILES

- `apps/web/src/components/mamluk-map/`: basemap, settlement presentation, controls,
  session integration, hook, component, styles and focused regressions.
- `apps/web/src/app/games/kingdoms/world-map/page.tsx`: default overview entry.
- `packages/mamluk-maplibre-adapter/`: sprite atlas, optional symbols, metrics and tests.
- `apps/web/tokens.css`, `apps/web/next.config.ts`, `vercel.json`: palette/terrain CSP.
- `scripts/prepare-maplibre-workers.mjs`: existing Cairo font/license preparation.
- HD Playwright config/spec and isolated fixture seeder.
- Core/backend, gameplay, Prisma and package manifests have no release diff.

## TESTS

Passed:

- Core build/typecheck and 77 tests; statement coverage 96.19%, branches 92.49%.
- Adapter build/typecheck/format checks and 34 tests; statement coverage 91.48%, branches 87.19%.
- Shared contracts, database and domain package builds.
- 299 web map/API/integration tests passed across the completed runs, including
  all 13 isolated PostgreSQL cases and the 10,001-village aggregation regression.
- Next.js 16.3.8 production build and its TypeScript check: 86 static pages.
- Web ESLint after the ref-effect fix: zero new errors; one pre-existing site-shell
  navigation warning. Public-bundle exposure guard passed.
- Fixed-scope CSP/config formatting and CSS color-budget checks.
- Security review preserved authentication, public/private expiry and source deduplication.
- Final production Playwright: 6 passed, 0 failed/skipped/flaky, 176.8 seconds.
  Desktop, 4K and mobile verify real pointer selection, projection changes,
  hidden layers, Arabic metadata, reduced motion and persistent canvas identity.

Failed:

- No outstanding failure in completed targeted runs.
- The initial concurrent build/test run timed out the 10k aggregation case at
  five seconds. All 13 database cases passed when rerun alone with a 30-second
  test deadline. The render-time ref ESLint error was fixed and retested.
- Browser verification caught and fixed a mobile projection-menu stacking issue.
  The final run uses normal pointer actions with no force-click workaround.
- Dependency audit reports 28 existing advisories (13 high, 11 moderate, 4 low),
  identical to the production baseline; no dependency changes in this release.

Skipped / pending:

- Physical-device memory/FPS and 8K hardware benchmarks are not performed.

## SCREENSHOT VERIFICATION

Final release captures are stored locally under
`C:/Projects/qurabia/artifacts/mamluk-hd-release`, outside the deployment source.
The suite captures full world, Middle East, kingdom territory, local villages and
selected village details at 1920×1080, 3840×2160 and mobile 390×844 CSS pixels.
The earlier primary-checkout screenshots are not evidence for this release.
All 15 final images and `results.json` / `performance.json` were saved and inspected.
The resource check excludes only the absent local fixture realtime socket at
`ws://localhost:3001/socket.io/`; map requests and other CSP errors remain asserted.

## KNOWN LIMITATIONS

- External open terrain/geography services control availability and source detail.
- Population, historical provincial borders and caravan gameplay are not invented.
- Private enemy progression remains hidden; distant aggregated cells are not capital lists.
- Existing dependency audit advisories remain outside the map-only change.
- Synthetic data and browser emulation do not establish hardware FPS or production capacity.

## FINAL STATUS

**PASS — HIGH-DEFINITION MAMLUK WORLD MAP READY**

The final source passed production build and local browser validation. Publication
targets GitHub `main` and its existing Vercel production integration. No database
migration is introduced. Production deployment status is reported separately after
the Git push completes.

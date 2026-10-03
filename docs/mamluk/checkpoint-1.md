# Mamluk Challenge — Checkpoint 1

> Implementation record for the original working copy. The production release is integrated separately on GitHub `main` at `8e5d236`, preserving the newer commanders, resource sites, alliance events, village relocation and public-map isolation already deployed there. See [release verification](checkpoint-1-release.md) for the release-specific scope and validation; the original counts below are not substituted for release validation.

Scope: the supplied master implementation prompt, phases 1–5 only. Phase 6 is not authorized in this round.

## Phase 1 — architecture and baseline

CodeGraph was queried before implementation for the engine, simulation, repository, HTTP boundary, realtime worker/gateway, geographic map and village renderer. The requested `docs/MAMLUK_CHALLENGE_AUDIT.md` and `docs/CODEX-NAVIGATION-GUIDE.md` are absent; this audit uses current source instead. Existing staged, unstaged and untracked user work is preserved.

Authoritative flow: strict API intent → `commandKingdomWorld` → PostgreSQL world row lock → `executeCommand`/`advanceWorld` → JSON state + revision + command receipt in one transaction. `KingdomsWorker` polls durable deadlines; the gateway broadcasts only world ID/revision. Authorized clients refetch projected state. Production and due events use server time.

Existing gameplay includes buildings, production, training, troops, movement, alliances, diplomacy, market escrow, seasons, throne and visibility projection. Geography has a deterministic grid projection but its separate stored geography can supersede the gameplay world. The village already uses `VillageScene`/`VillageCanvas`, Pixi layers, a building registry and an asset manifest. These systems are extended, not replaced.

Baseline:

| Check | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Engine/simulation | 35 | 0 | 0 |
| Map | 87 | 0 | 5 PostgreSQL |
| Village UI/renderer | 81 | 0 | 3 |
| Realtime worker/gateway | 10 | 0 | 0 |
| Desktop reduced-motion browser | 1 | 0 | 0 |
| Web TypeScript | pass | 0 | 0 |
| Scoped ESLint | pass | 0 | 0 |

The production web build also passed. HTTP/API checks passed 11 tests. A temporary PostgreSQL 17 container bound only to localhost was provisioned for this task; all 26 existing migrations applied successfully through an explicit isolated configuration. The existing repository and onboarding integration suites passed 13 tests. No production database is used for tests.

Realtime TypeScript also passed. The unchanged MapLibre adapter passed its 19 tests.

## Storage decisions

### Authoritative geography

- Current storage: `KingdomWorld.state` JSON plus legacy geographic snapshots.
- Options considered: extend world state; independent relational tables; hybrid.
- Selected: derive geography from the existing authoritative world, without new persistence.
- Reason: display coordinates and borders must follow existing ownership and visibility rather than establish another engine.
- Migration risk: LOW; no schema migration or production data rewrite.

### Village progression and construction

- Current storage: villages and one active `build` inside `KingdomWorld.state`.
- Options considered: extend JSON; relational village/queue tables; hybrid.
- Selected: optional backward-compatible progression and bounded construction queue in existing JSON; retain active `build` compatibility.
- Reason: the existing world lock already makes resource debit, simulation, XP, revision and receipt atomic. New tables would duplicate aggregate ownership.
- Migration risk: LOW; deterministic legacy derivation, no Prisma migration. Legacy active construction must never debit twice or mint a reconstructed refund.

## Phase results

Phase 1: PASS for source discovery, compilation, lint, production build and available baseline checks. PostgreSQL repository/onboarding verification passed. Phase 2 resolved the map fixture distinction with six passing PostgreSQL tests.

Phase 2: PASS. See [the phase 2 report](phase-2-unified-world.md). Authoritative villages, territory cells, alliance borders, own garrisons and outbound movements feed the map. Revisions/reconnect refresh the viewport. Map tests: 97 passed, including 6 PostgreSQL tests; core subsequently expanded to 79 passing tests; adapter 19 passed; TypeScript and scoped ESLint passed. Optional route units preserve legacy metres and correctly represent simulation tiles. No DB changes. Legacy return movements without a departure point are omitted rather than fabricated; later-phase entities not present in gameplay are not invented.

Phase 3: PASS. 48 engine/simulation/progression tests passed, with TypeScript and scoped lint. The persisted legacy-progression test observed RED then GREEN. Five forged-field repository tests reject client authority without changing state. A real PostgreSQL worker test completes an overdue farm, awards exactly 100 XP (level 3), commits revision 1 and does not repeat the award/revision on another tick. Independent review found insertion-order dependence in strategic allocation; stable ID ordering and a permutation test corrected it before phase 4. Research power remains zero until a research system exists.

Phase 4: PASS. 56 domain tests and 20 real PostgreSQL repository tests passed, with TypeScript, scoped ESLint and independent review. A duplicate queue command test observed RED against the former single-build rule and then GREEN. The queue reserves costs immediately, stores durations and processes consecutive deadlines without a browser. The requested level-12 example (hall 7→8, wall 5→6, warehouse 8→9) completes after five hours with XP 4485, level 15 and visual tier 3. Additional tests cover five consecutive builds with training, production rate changes, legacy saves, failed tasks and dependent cancellations.

Queued cancellation refunds 100% and active cancellation 50% by default, configurable. Legacy active builds have no reconstructed refund. Credits respect warehouse capacity; excess is lost under the existing resource-credit rule, and `refundedCost` records nominal entitlement. Same-key retries use the existing receipt; new-key attempts to cancel terminal items are rejected. No schema migration.

Phase 5: PASS. The existing village renderer now displays the authoritative progression HUD and bounded visual-tier fallback; the construction board shows schedules and cancellation. Queue-aware costs and production previews use the next reserved target level. Connectivity/visibility recovery triggers immediate server refetch. Independent review passed after correcting the production preview. All 16 village browser tests passed across desktop and Android, including five-hour offline recovery, training, resource production, reduced motion, navigation and resize. See [the phase 5 report](phase-5-village-ui.md).

## Existing systems reused

The existing engine, event simulation, strict command schemas, ownership checks, world transaction/lock, command receipts, PostgreSQL JSON state, deadline worker, revision-only socket gateway, geographic projection and map SDK remain the integration points. Village visuals reuse the Pixi renderer, building registry, asset manifest and existing Arabic/RTL styles.

## Files

The complete map file inventory and purpose of each group is in [phase 2](phase-2-unified-world.md#files). The domain inventory is in [phases 3–4](phase-3-4-village-rules.md#modified-files).

The exact UI/renderer/fixture inventory is in [phase 5](phase-5-village-ui.md#files). `apps/web/src/lib/kingdoms/repository.integration.test.ts` additionally verifies legacy persisted progression, forged fields, repeated worker completion, duplicate queue commands, competing spending, unauthorized cancellation and concurrent cancellation retries. This report and the three linked phase reports document storage decisions, each modified file and verification.

## Village acceptance

| Feature | Result |
|---|---|
| Level | Configurable 1–50, milestone building requirements, deterministic legacy derivation |
| XP | Server completion/achievement/territory rewards, once-only transitions and receipts |
| Power | Disjoint building/military/defense/economy/strategic components; research zero until implemented |
| Queue | Five pending slots by default, captured cost/duration, cancellation, bounded terminal history |
| Offline | Chronological construction, training and production proven in engine, PostgreSQL worker and browser harness |
| Visual tier | Six server-derived tiers; existing art and bounded original banners as explicit missing-art fallback |
| HUD | Level, Arabic rank, power, XP, milestone requirements, resources and construction schedules |

## World map

Playable worlds use their authoritative villages, ownership cells, alliance borders, own garrisons and outbound movements. Display coordinates are deterministic projections; simulation coordinates and authoritative ETA are unchanged. Revision notifications refresh the authenticated map. The map browser smoke tests passed on desktop and mobile (2 tests); real PostgreSQL snapshot tests separately verify storage precedence and authorization.

## Integration tests

Final local verification:

| Suite | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Related web libraries, components, API routes and pages (49 files, including real PostgreSQL) | 323 | 0 | 0 |
| Realtime worker/gateway | 10 | 0 | 0 |
| Geographic core | 79 | 0 | 0 |
| MapLibre adapter | 19 | 0 | 0 |
| Village browser tests: desktop and Android | 16 | 0 | 0 |
| Map browser smoke: desktop and mobile | 2 | 0 | 0 |

The authenticated seeded-geography browser suite was not run because its separate seeded Cairo campaign was unavailable; the two map browser smoke tests use the local SDK/engine fixture. The relevant real PostgreSQL snapshot and authorization tests did run. The full monorepo suite and load tests were outside this scoped checkpoint.

Final web TypeScript, scoped ESLint (including the modified browser test/harness), production web build and `git diff --check` passed. The build also completed the existing public-secret-exposure and CSS color-budget checks.

Coverage: progression/construction logic reached 100% statements/lines/functions and 97.97% branches in the final 77-test domain/persistence run. Geographic core coverage is 96.26% statements, 92.67% branches and 98.23% lines. These are scoped measurements, not whole-monorepo coverage claims.

## Regressions and review repairs

Independent reviews corrected deterministic strategic allocation across JSONB key ordering, canonical cache signatures across nested key ordering, and next-queued-level production previews. Each received a regression test. No unresolved source regression remains in the scoped test results.

A coverage-instrumented full UI run overlapped browser work and produced four timing/focus failures (319 passed). The two affected files passed all 17 tests when isolated, and the complete final suite passed all 323 with one worker and no coverage instrumentation. No timeout was increased and no assertion was removed. Targeted coverage was then rerun separately and passed all 77 tests. Existing jsdom canvas warnings are not browser rendering evidence; actual rendering was checked through Playwright and screenshots.

## Security

- Idempotency: the existing transactional receipt protects repeated commands. Completion transitions remove active work; terminal cancellation cannot refund again.
- Authorization: world account/session checks and village ownership remain server-side. Forged XP, level, power, resources and battle-result fields are rejected.
- Concurrency: real PostgreSQL tests exercise duplicate requests, competing debits and cancellation retries under the existing row lock.
- Visibility: map projection begins with the authorized engine view and preserves its current disclosure policy. Socket notifications contain only world ID/revision.

## Performance

Progression caches its input signature, so unchanged building/troop/territory inputs do not recompute power. Queue and terminal-history sizes are bounded. Geographic payloads retain viewport/entity/vertex/byte limits. The existing world-state traversal and read-time due-event projection remain; this work makes no MMO-scale load claim.

## Migrations and operations

No new migration or schema table was introduced. The 26 existing migrations were applied only to the temporary local test database. Product edits remain local; this checkpoint is not a deployment report.

The task-created PostgreSQL container was stopped and automatically removed after verification. No existing databases, user staging, commits or remote branches were changed by this task.

## Remaining and limitations

- `MISSING_ASSET`: dedicated settlement/city artwork for six tiers is unavailable. The verified original-art fallback is implemented; six new illustrations are not claimed.
- Existing return movements do not retain their departure point; their map route is omitted. Existing foreign stationed reinforcements are not newly disclosed. The map preserves the current visibility policy.
- Siege, provinces, commander/research, occupation and other phases 6–24 are outside this round; absent gameplay entities were not invented for map placeholders.
- Browser tests use local real-engine/API fixtures, composed with separate real PostgreSQL and realtime tests. A production-authenticated browser/socket delivery run and MMO-scale load testing were not performed.
- Countdown labels describe the latest server snapshot and refresh through refetch; gameplay never depends on the browser remaining open.

## Evidence

- [Desktop offline result](../../.codex-build/mamluk-checkpoint-1/screenshots/village-offline-return-desktop.png)
- [Android offline result](../../.codex-build/mamluk-checkpoint-1/screenshots/village-offline-return-android.png)
- [Final web test log](../../.codex-build/mamluk-checkpoint-1/final-web-serial.log)
- [Final build log](../../.codex-build/mamluk-checkpoint-1/final-build.log)

## Final checkpoint status

**PASS** — phases 1–5 completed and locally verified with the documented compatibility and asset fallbacks. No phase 6 work was started.

**READY FOR PHASE 6**

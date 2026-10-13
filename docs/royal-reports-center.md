# Royal Reports Center

An Arabic RTL report archive integrated with Kingdoms' existing command/worker transaction, not a second game-event engine. Navy, restrained brass, Cairo/Alexandria and Lucide retain the village's identity. Desktop uses a list/detail workspace; mobile opens a separate detail screen. Quests and rewards remain available below the center.

## Runtime and sources

| Source | Archived information |
| --- | --- |
| `simulation.ts` combat resolution | Actual participants, authorized before/after troops, losses derived from those snapshots, loot, own commanders, location, departure/resolution timestamps |
| `simulation.ts` scout resolution | Intel only for the successful scout's existing authorized recipient; detection notifications expose no origin or target intel |
| `construction.ts` completion | Building, previous/new levels, village, queue start/completion timestamps |
| `engine.ts` trade completion | Frozen merchant names and each recipient's own sent/received resources |
| `simulation.ts` production accrual | Actual net resources credited after capacity/upkeep; aggregate at existing commits after at least six hours, suppress empty totals and reset on ownership change |
| `engine.ts` farm harvest | Actual food credited, plot and village; no passive tick notifications |
| `simulation.ts` gathering return | Resources actually credited after capacity limits, destination; collecting at a site retains its original recorded text |
| `simulation.ts` caravan arrival | Resources actually credited after capacity limits and destination |
| Existing diplomacy/training/season report calls | Original authorized recipient/title/detail; classified without a parallel notification bus |
| `reports-siege.ts` | Owner-only persisted stage/start/close changes, accumulated damage; no reports for each damage tick |

The siege utilities in the current engine are not connected to an active siege lifecycle producer. The observer archives real persisted transitions when present; this feature does not activate or change siege rules. Production credits are aggregated in persisted village state and journaled after at least six hours when the existing engine advances; no new timer or per-tick report is added. Optional daily summaries are not enabled. Gathering receipts also include the resources actually delivered after storage limits. Historical reports cannot reconstruct data that the original event did not record.

## Persistence and authorization

`KingdomReportEntry` stores one immutable payload per world, recipient and stable event identity. Event time is included in the archived ID to prevent collisions if administrative world resets reuse the legacy sequence. The transaction-local WeakMap outbox retains all new reports even when the original world's bounded 2000-report ring rolls over. World save, archive insert and command receipt commit atomically; `createMany(skipDuplicates)` makes retries safe. Workshop world saves preserve the same outbox.

An additive migration creates the table, foreign keys, chronological/category/unread indexes and a pg_trgm GIN search index. Existing retained reports are backfilled once under the world lock, without advancing gameplay or incrementing its revision. Reports older than the retained ring before installation cannot be recovered.

Every API operation checks active session token version and world membership on the server. Every query includes both world and recipient; detail/read operations use the recipient composite key. Foreign reports return 404. Payloads remove recipient lists, enemy commanders and other recipients' transfer breakdowns. The existing world projection also applies the same metadata filter and retains only the caller in its legacy recipients field. Read status is a DB-clock timestamp set only once, including concurrent tabs. Mutation routes retain the existing same-origin, bounded JSON and rate-limit protections.

## API and UI

- `GET /api/kingdoms/reports`: category, read status, literal text search, newest/oldest ordering, bounded keyset pagination (default25/max50). Summary queries do not load payloads or the whole world state.
- `GET /api/kingdoms/reports/:reportId?worldId=…`: authorized historical detail.
- `PATCH /api/kingdoms/reports`: `{ worldId, reportId }` to mark read idempotently.

UI strings are organized in `reports-copy.ts` with Arabic/English dictionaries. Historical event text remains the language recorded by the existing engine. Existing realtime revisions coalesce into archive refreshes over a three-second window without cancelling initial reads; UI state is bound to world/player/language and date/number formatters are reused; visible-tab polling, online and visibility recovery also refetch it. Socket notifications are not the archive. Map links use the existing authorized map path and its fog-of-war projection.

## Local verification

Use only `KINGDOMS_TEST_DATABASE_URL` pointing to localhost/127.0.0.1 and a `kingdoms_test_*` database. The integration test explicitly rejects other databases and removes only its unique fixtures. The browser fixture requires the exact isolated `kingdoms_test_reports` database, uses production report repositories, and never ships a test identity into app routes.

Browser evidence in `.reports/royal-reports/` comes from production UI components with explicitly seeded local test events stored in PostgreSQL. It is not an authenticated production session, a physical-device test, or evidence of live player data. HTTP authentication/CSRF protections are tested separately from the fixture's local identity.

Run targeted repository/API/engine tests, database integration tests, desktop/mobile browser checks and project typecheck/build. Visual acceptance also requires the Art Director's actual image review and the documented internal100-point rubric; a passing build is insufficient.

## Deployment boundary

No migration has been applied to production. Before any release, obtain separate approval to apply the additive migration and publish/deploy this feature; confirm the target database permits `pg_trgm`. Generate the Prisma client and apply the migration before starting the new runtime. Publishing code without the table is unsupported. Do not reset, seed, or replace production game state.

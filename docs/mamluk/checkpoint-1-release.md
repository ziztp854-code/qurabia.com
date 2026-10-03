# Checkpoint 1 production release

Release base: GitHub `ziztp854-code/qurabia.com`, `main` commit `8e5d236b1f0ea4973e7eb633c63fac8059939eac`, matching the production deployment before this release.

The implementation working copy was based on an older branch. This release therefore integrates the checkpoint changes into the live code instead of replacing live files wholesale. Existing commanders, gathering/resource sites, alliance events, world stages, WGS84 village locations, relocation and public-map access isolation are preserved.

Scope: village progression, construction queues/cancellation, village progress UI and authoritative map projections compatible with persisted geography. No new dependencies, schema migrations or production database rewrites. Existing Vercel service routing and build commands are unchanged.

## Verification

PostgreSQL integration tests use a disposable local `kingdoms_test_release` database, never production. All 26 existing migrations applied to that local database.

| Check | Result |
| --- | --- |
| Integrated web suite (82 files) | 692 passed; 2 obsolete single-build UI expectations failed, then corrected and verified below |
| Final focused rerun (progression, construction, alliance events, village scene) | 44 passed, including all 8 village-scene tests |
| New domain coverage | 100% statements, lines and functions; 98.09% branches |
| PostgreSQL domain serialization | 29 passed |
| PostgreSQL geography/relocation | 14 passed |
| Map core / MapLibre adapter | 76 / 19 passed |
| Desktop + Android village browser | 18 scenarios verified: 16 passed in the full run, 2 navigation cases passed after correcting the fixture route's trailing-slash matcher |
| Web + realtime TypeScript | Passed |
| Changed web files ESLint / Git whitespace checks | Passed |
| Production web build, public-secret exposure and CSS budget checks | Passed |

The corrected UI assertions now expect reserved next-level construction and an enabled add-to-queue button; confirmed-building levels, busy-state disabling, server command outcomes and the original lifecycle checks remain tested. Browser fixtures preserve the live world-map route and history return. Final source was independently reviewed for command authorization/idempotency and map visibility. No further production-source changes followed the passing build.

Production verification covers public route availability and authentication boundaries. No live player commands are used as a deployment smoke test.

## Existing dependency audit

`pnpm audit --prod` on the unchanged production lockfile reported 28 advisory findings: 13 high, 11 moderate, 4 low and no critical. Findings include transitive build/mobile/runtime libraries (deepmerge-ts, undici, brace-expansion, devalue, node-forge, http-cache-semantics and braces). This release neither introduces nor resolves these existing advisories; a passing application test/build is not a clean dependency-security audit. No dependencies were upgraded as part of the gameplay release.

## Rollback

The previous Vercel production deployment is `dpl_A4K7trJPt8nmru1RnUhhSzTUsxVT`. Optional JSON additions do not require a relational database rollback. Rolling back UI/engine code can strand queued construction until the new engine is restored, so inspect pending queues and prefer a forward fix for gameplay issues rather than silently discarding queue records.

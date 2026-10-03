# PHASE 5 RESULT — Village visuals and HUD

Status: PASS (local verification, 2026-10-03)

## Implemented and reused

- Extended the existing VillageScene, Pixi renderer, building registry, asset manifest, construction board, BuildingPanel, and useKingdoms hook.
- The HUD displays authoritative level, Arabic rank, total power, XP, progress toward the next level, milestone building requirements, and a maximum-level state. Existing resource HUD remains the resource display.
- Construction shows active and queued items, server start/completion timestamps, remaining seconds at the latest server snapshot, and cancellation with the configured refund percentage and warehouse limit. Cancellation sends only the existing command intent; the server handles refunds and dependent upgrades.
- BuildingPanel prices and previews the next queued level, including pending upgrades of the same building, and enforces the configured pending limit in its UI. All authoritative validation remains server-side.
- Connecting/reconnecting, returning online, or returning to a visible tab triggers a server refresh. Existing polling, revision ordering, and cleanup remain in place.

## Visual tiers and missing assets

`MISSING_ASSET`: six dedicated settlement/city illustrations do not exist. The existing manifest now records six tier slots and explicitly identifies this limitation. The fallback reuses the approved original-art banner crop, adding at most five static banners as server visualTier increases. Existing buildings retain their confirmed levels, positions, and assets. This is a bounded visual fallback, not six completed city illustrations.

Tier changes trigger a rebuild of the existing renderer. No renderer or browser simulation was added. Reduced motion still stops the ticker; static tier details remain visible.

## Files

All paths below are relative to the repository root.

| File | Purpose |
| --- | --- |
| apps/web/src/components/kingdoms/building-panel.tsx | Queue-aware cost, next-level preview, capacity, and build intent |
| apps/web/src/components/kingdoms/village-panel.tsx | Mount construction queue in existing board |
| apps/web/src/components/kingdoms/village-maps.test.tsx | Queue behavior replaces obsolete single-build blocking assertion |
| apps/web/src/components/kingdoms/use-kingdoms.ts | Immediate server refresh on connectivity/visibility recovery |
| apps/web/src/components/kingdoms/use-kingdoms.test.tsx | Recovery, cleanup, and existing snapshot-order checks |
| apps/web/src/components/kingdoms/village/village-progress.tsx | Server-derived progression HUD |
| apps/web/src/components/kingdoms/village/village-progress.module.css | Token-based RTL HUD and queue styling |
| apps/web/src/components/kingdoms/village/village-progress.test.tsx | HUD, level cap, missing legacy progression, queue, cancellation and next-level preview |
| apps/web/src/components/kingdoms/village/construction-queue.tsx | Active/queued schedules, refund policy, cancellation intent |
| apps/web/src/components/kingdoms/village/village-scene.tsx | Integrate progression into existing scene |
| apps/web/src/components/kingdoms/village/village-layers.ts | Bounded original-art tier fallback |
| apps/web/src/components/kingdoms/village/village-layers.test.ts | All six visual tiers preserve gameplay buildings |
| apps/web/src/components/kingdoms/village/village-renderer.ts | Rebuild when authoritative visualTier changes |
| apps/web/src/lib/kingdoms/village/assetManifest.ts | Missing tier artwork inventory and original-art fallback |
| apps/web/e2e/village-scene.spec.ts | Five-hour offline browser acceptance and screenshots |
| apps/web/e2e/fixtures/village-scene-server.ts | Local-only frozen clock and offline scenario endpoints |

## Verification

- Baseline: 81 village tests passed, 3 skipped; desktop reduced-motion Playwright passed.
- New behavior was exercised with failing tests before implementation.
- Focused HUD/hook/maps run: 23 passed; renderer/registry run: 12 passed; final HUD tests: 3 passed.
- Broader UI run: 119 passed, 3 skipped, one existing client test exceeded its short lookup timeout during concurrent work. Isolated rerun of that file plus HUD tests: all 10 passed; no source change was made for the timeout.
- TypeScript and scoped ESLint passed. Parent integration gate runs the full related suite/build separately.
- Full Village Playwright suite on desktop-1920 and Android: **16 passed**, including stable calibration, production/training lifecycle, keyboard/drag/pinch, hit regions, resize, reduced motion, and offline queue recovery.
- Independent contract review found one production-preview mismatch; corrected it and added a test. Reviewer subsequently confirmed no remaining findings.

## Offline acceptance

The local fixture starts a persisted-style server snapshot at village level 12, hall 7, wall 5, warehouse 8. The browser queues hall 8, wall 6, and warehouse 9 using real UI intents, then closes. The test advances only the server fixture clock by five hours, opens a new page, and verifies:

- All three upgrades completed and the construction queue emptied.
- Five guards completed training.
- Resource production continued.
- XP and power increased; level became 15.
- A repeated server read did not award XP twice.
- HUD matches the server level and visual tier; no horizontal page overflow.

This browser harness exercises the real engine and UI over a local API. It does not substitute for production database, receipt, or Socket.IO integration tests. Browser time never completes gameplay. Remaining seconds describe the latest server snapshot and refresh on polling/recovery; they do not run an independent simulation.

## Evidence

Local review artifacts (excluded from source deliverables):

- `C:/Projects/qurabia/.codex-build/mamluk-checkpoint-1/screenshots/village-offline-return-desktop.png`
- `C:/Projects/qurabia/.codex-build/mamluk-checkpoint-1/screenshots/village-offline-return-android.png`
- `C:/Projects/qurabia/.codex-build/mamluk-checkpoint-1/screenshots/village-queue-desktop.png`
- `C:/Projects/qurabia/.codex-build/mamluk-checkpoint-1/screenshots/village-queue-android.png`

DB changes: none in this phase. No phase 6 work performed.
# Production release integration

Integrated on live GitHub main `8e5d236`, preserving the newer commander, stage, village directory, hero and world-navigation surfaces. Release UI tests: 30 focused tests plus all 8 village-scene tests passed. Desktop/Android browser verification covered 18 scenarios across a 16-pass full run and a corrected 2-pass navigation rerun. Offline/queue screenshots were inspected from local release artifacts. See `checkpoint-1-release.md` for combined release verification and inherited dependency findings.

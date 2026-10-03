# Phase 3–4: authoritative village progression and construction

Status: PASS for domain implementation. UI integration belongs to Phase 5; this report does not claim deployment or whole-checkpoint completion.

## Architecture and storage decision

CodeGraph traced `executeCommand → advanceWorld → advanceDraft` and the existing repository transaction, command receipts, worker deadlines, and player projection. Both systems extend `KingdomWorld.state` JSON. A separate Village/Queue table or hybrid model would duplicate the existing world transaction without improving these bounded operations. Selected: extend existing JSON. Migration risk: LOW. No Prisma migration or production data operation.

Public commands remain strict intent schemas. Authorization remains `own()` plus the repository's account/session checks. `KingdomWorld` row locking serializes resource spending; the existing `(worldId, actorId, key)` receipt prevents duplicate queued work and refunds. Reusing a key with a different command remains rejected. Direct cancellation of a terminal item with a new key is rejected.

## Phase 3

Optional `Village.progression` stores XP and cached server-derived level, Arabic village rank, visual tier, milestone requirements, and six power components. Optional `config.progression` preserves old configuration documents. These village ranks are independent of account court ranks.

Defaults support levels 1–50. Each next-level cost is `25 × currentLevel × (1 + floor(currentLevel / 10))`. Milestones at 10/20/30/40/50 require increasing hall, warehouse, and wall levels. Level 50 requires hall 18, warehouse 16, wall 15, within existing building maxima. Existing fully developed buildings alone provide enough XP to reach level 50. Rank and tier thresholds are configurable; `nextLevelXp` is null at the cap.

Completed building levels grant `100 × targetLevel` XP, completed troops grant 5 XP each, successful one-time achievement claims grant 250 XP, and first acquisition of an unowned territory grants 100 XP. Pending/cancelled/failed construction grants none. Existing research does not exist: research power stays zero and no research gameplay is claimed. Resource stock or elapsed production does not generate XP, avoiding transfer/refund farming.

For old saves without progression, XP is derived once from cumulative completed building levels (excluding the free initial hall), current home and deployed troops, and owned strategic land. This does not reconstruct losses or every historical event, which old saves never recorded. It is deterministic and survives JSON round-trips. Strategic land is allocated once to the owner's first village in stable numeric ID order, independent of JSON object-key ordering; claims use the same ordering.

Power categories are disjoint: wall contributes defense; production/storage/market buildings contribute economy; remaining buildings contribute building power; own home and deployed troops contribute military power. Allied garrisons do not add power to their host. Strategic territories are never counted for every owned village. Power is an overview metric, not the battle formula. A cached input signature skips recalculation when only resource stock/time changes. The signature uses ordered value tuples, including configuration, so PostgreSQL JSONB object-key reordering does not invalidate it; meaningful rank/tier array order remains preserved. A nested-key permutation test reproduced the original cache miss and passes with the canonical signature.

## Phase 4

`Village.constructionQueue` extends existing construction; `Village.build` remains the active-work compatibility projection used by existing views and deadline scheduling. Items retain ID, village, building, from/target levels, queue/start/end timestamps, debited cost, and BUILDING/QUEUED/COMPLETED/CANCELLED/FAILED status.

Costs are debited immediately under the existing transaction. Repeated upgrades use the preceding pending target level for cost and maximum-level checks. Defaults allow five pending items including the active item and retain the latest 100 terminal items. Both limits are configurable and bounded. Reserved costs and scheduled durations survive later balance changes.

Offline event order reuses the existing loop:

1. Accrue production to the earliest authoritative deadline using the pre-event production, storage, and troop upkeep.
2. Complete construction and grant its XP; activate the next queued item at that deadline.
3. Complete training and grant its XP.
4. Resolve movements in stable ID order, including strategic rewards.
5. Repeat until every due event has been processed, then accrue the remaining interval and refresh level/power.
6. The existing repository saves state/revision/next deadline atomically; the existing worker notification causes clients to refetch.

Research is not part of this implementation. Season end remains the simulation cutoff. No browser timer controls completion.

`cancelBuild` accepts only village and item IDs. Default refund is 100% for queued items and 50% for active items, rounded down per resource. Cancelling a building level also cancels later pending levels of that same building so levels cannot be skipped. Unrelated work is rescheduled using its original reserved duration. Cancelling active work starts the next item at server cancellation time. A level mismatch fails affected pending work, refunds its reservation, and allows unrelated work to continue without granting XP or rolling levels backward.

Refund credit follows the existing warehouse capacity rule: resources above current capacity are discarded. `refundedCost` records the nominal refund before that capacity cap. Legacy active builds have no recorded historical paid cost; they are adopted with a stable ID, unchanged completion deadline, no additional debit, and zero refundable cost. Guessing a historical cost from today's configuration could mint resources.

## Modified files

- `apps/web/src/lib/kingdoms/types.ts`: backward-compatible progression, queue, and configuration contracts.
- `config.ts`, `progression-config.ts`, `construction-config.ts`: validated bounded configuration and defaults.
- `progression.ts`: legacy derivation, XP awards, milestone/rank/tier/power cache.
- `construction.ts`: queue reservation, completion, cancellation, failure, scheduling, legacy adoption, bounded history.
- `commands.ts`: strict cancellation intent.
- `engine.ts`: existing ownership-checked build/claim/found/mutation integration.
- `simulation.ts`: chronological completion and progression integration.
- `progression.test.ts`, `construction.test.ts`: semantic acceptance and security cases.
- `engine.test.ts`: replace obsolete single-build rejection with queue behavior while preserving immutable input and offline production checks.

Paths abbreviated after the first entry share `apps/web/src/lib/kingdoms/`. Parent-owned repository integration tests separately verify actual PostgreSQL locking, persistence, receipts, and worker retries.

## Verification

Phase 3 gate: 48 domain tests passed, including 13 progression tests. Phase 4 gate: 56 domain tests passed, including 8 construction tests. Post-review canonical-cache verification adds a fourteenth progression test, bringing the domain total to 57. Red-to-green slices included mature legacy derivation, one-time completion/achievement/territory rewards, JSON key permutation, offline queue completion, cancellation, and failure recovery. Web TypeScript and scoped ESLint passed. Independent domain review passed.

The Level-12 acceptance test queues hall 7→8, wall 5→6, warehouse 8→9 and training, serializes state, then advances five hours: completed levels, XP 4485, level 15, tier 3, increased power, and no second award on repeated advancement. A separate five-project test checks exact chronology plus wood/food accrual across construction and training boundaries.

The parent also reported 20 real isolated-PostgreSQL integration tests passed, including duplicate queued requests, competing spending, unauthorized cancellation, duplicate refunds, and repeated offline worker execution. These tests use the isolated test database and do not prove production deployment or capacity under MMO-scale load.

## Limits

The world JSON and existing simulation still scan world state; this change does not redesign world storage or claim MMO scalability. Power formulas are cached but legacy normalization and due-event processing still require state traversal. Queue/history bounds limit the added state. No phases 6–24 systems, research, siege, or occupation mechanics were implemented here.

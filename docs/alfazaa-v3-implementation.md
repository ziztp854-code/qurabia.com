# Alfazaa v3 implementation contract

The user explicitly authorized independent mechanics with documented differences after the original client was shown to depend on unavailable server rules. This does not turn independent behavior into original-server parity.

## Acceptance gates

- Preserve v1/v2 city progress, balances, received quest rewards and training completions when introducing v3 state.
- Owned heroes, progression, skills, formations and a server-resolved PvE battle must be playable, with source-backed costs and explicitly versioned independent battle rules.
- Quest families must have separate condition namespaces, event counters, claim ledgers, daily resets and atomic rewards. Unsupported source conditions cannot silently complete.
- Research, training/healing queues, consumables, crafting, virtual shop and progression systems must affect gameplay rather than be reference-only screens.
- Shared world and alliances must use Alfazaa-owned persistence and real account authorization. NPC opponents cannot be described as human PvP.
- Public command/API tests, real PostgreSQL concurrency checks and desktop/mobile browser journeys must pass before release. All new command seams were approved by the user.
- The current user explicitly authorized merging and publishing this resumed checkpoint. Release only the reviewed source after successful CI, apply the additive Alfazaa world migration with its exact Prisma checksum, and verify the resulting production deployment. Preserve the independent-mechanics disclosure and do not claim original-server parity.

## Ownership and command boundaries

Root owns state v3 integration, existing city/domain types and validation, main API schema/repository, source city expansion, account UI integration and release.

Hero module owns realm/hero-* and its source catalogs, exposing createHeroState(now), validateHeroState(raw), applyHeroCommand(state,command,context), getHeroSnapshot(state), and getHeroCatalog(). It returns GameplayResult and events; it cannot write the database or read client balances.

Systems module owns realm/systems-*, source system catalogs and public command tests, exposing createSystemsState(now), validateSystemsState(raw), applySystemsCommand(state,command,context), advanceSystems(state,context), recordGameEvents(state,events,now), and getSystemsSnapshot(state,balances,now). It owns task counters, timers, daily reset and rewards.

World module owns its own world persistence/API and UI, with isolated tables and fixed lock ordering. It must never import or mutate KingdomWorld repository/state. Shared resource transfers must be atomic and cannot duplicate spendable balances.

All workers share this checkout, preserve unrelated edits and use immutable public state transitions. No concurrent install/build operations. Source data is at outputs/deep-code-audit/decoded-tables and outputs/jsc-decoded/modules relative to the conversation workspace.

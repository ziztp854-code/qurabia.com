# Qurabia engineering guide

Use this guide for the aspects relevant to the requested work; it is not a checklist to run in full for every change. `AGENTS.md`, the user's request, and the existing product and visual guides take precedence. This guide does not itself authorize production changes, deployment, or an expanded scope.

## Implement and verify

1. Identify the affected behavior, contracts, state ownership, and invariants. Inspect the relevant implementation and choose the smallest complete change.
2. Reuse existing components, dependencies, validation, and domain rules. Preserve public behavior unless a change is requested or necessary for the task; do not weaken tests or controls to obtain a pass.
3. Run targeted checks first, then integration or broader checks when the changed boundaries and risk justify them. Inspect the diff and report actual results, including failures, skips, and unavailable checks.
4. Investigate failures before retrying. Distinguish a regression from an environment limitation, apply a focused fix, and rerun the affected check. Report unresolved issues without claiming unsupported success.

For visible work, [Visual Excellence](visual-excellence.md) remains the source for required browser evidence and acceptance. For instruction-file changes, use the checks specified in `AGENTS.md`.

## Security, data, and realtime

- Enforce permissions and validate untrusted input at server boundaries; preserve authentication, rate limits, database constraints, and transaction guarantees. Never expose or log secrets or private game information.
- Treat server state as authoritative for privileged roles, scoring, timing, and game transitions. Inspect both server projections and client behavior when information is private to a player.
- For affected realtime flows, consider duplicate or reordered events, stale state, disconnect/reconnect, races, and idempotency. Test the relevant recovery and denied paths through existing contracts.
- Retry writes only when safe against duplication. Evaluate migration compatibility and recovery for database changes. Do not perform destructive or irreversible production actions without explicit authorization.

## Performance and operations

Measure a repeatable baseline before claiming a performance improvement, using comparable route, state, viewport, and environment. Check only relevant risks: asset loading and layout shifts, unnecessary renders or socket traffic, cleanup of listeners and graphics resources, or recovery from failures.

Before an authorized release, assess relevant tests, configuration, migration compatibility, monitoring, user impact, and rollback. A successful local build alone does not establish production readiness. Follow the Git and visual deployment restrictions in `AGENTS.md`.

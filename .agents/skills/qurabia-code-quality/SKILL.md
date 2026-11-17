---
name: qurabia-code-quality
description: "Refactor or review Qurabia code for maintainability while preserving contracts and behavior."
---

# Code Quality

## Rules
- reuse existing conventions
- TypeScript where project already uses it
- strict types for game events
- avoid giant components
- avoid duplicated constants
- avoid hardcoded selectors
- centralize API/event contracts
- clean up side effects
- document non-obvious game rules

## Verification

Trace callers and existing tests before changing an interface; run targeted checks and document any observable behavior change.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

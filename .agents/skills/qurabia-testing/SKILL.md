---
name: qurabia-testing
description: "Select and implement meaningful tests for affected Qurabia behavior, contracts, and critical journeys."
---

# Testing

## Layers
- unit tests for pure game/rank/subscription logic
- component tests for states
- integration tests for room/game flows
- end-to-end tests for critical journeys

## Critical journeys
- sign in
- join room
- start game
- reconnect
- finish game
- XP/rank display
- subscription entitlement
- checkout callback if present

Test RTL/mobile-critical UI.

## Verification

Choose the smallest relevant test layer, run targeted tests first, and report coverage and any unavailable integration dependencies.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

---
name: qurabia-testing
description: "Use for Qurabia or Tahaddi tasks specifically involving testing. Apply the existing implementation and project conventions within the requested scope."
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

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

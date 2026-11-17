---
name: qurabia-cards-games
description: "Work on Qurabia card-game presentation, turn state, reconnect behavior, or hidden information."
---

# Card Games

Use for Baloot or other card-based games in Qurabia.

## Requirements
- hand layout must work in RTL/mobile
- card selection state
- turn indicator
- team/player state
- bidding/round states if applicable
- reconnect-safe state restoration
- avoid exposing hidden opponent cards
- animation must not leak information

## Verification

Verify the affected turn and reconnect states on mobile and RTL; inspect server projections and client payloads for hidden-card leakage.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

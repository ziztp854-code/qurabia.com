---
name: qurabia-game-state-machine
description: "Review or change a Qurabia game flow, state transition, or separation of authoritative and presentation state."
---

# Game State Machine

## Goal
Make each game flow explicit and testable.

## Separate
- authoritative game state
- presentation scene state
- animation timeline

## Example presentation flow
lobby
→ starting
→ active
→ reveal
→ score
→ next-round
→ finished

Use the real game flow for each game; do not force one generic model if it loses meaning.

## Verification

Trace the actual game-specific transitions and contracts; test valid, invalid, and repeated transitions relevant to the change.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

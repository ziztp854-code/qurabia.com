---
name: qurabia-game-state-machine
description: "Use for Qurabia or Tahaddi tasks specifically involving game state machine. Apply the existing implementation and project conventions within the requested scope."
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

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

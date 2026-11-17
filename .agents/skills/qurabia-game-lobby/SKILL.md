---
name: qurabia-game-lobby
description: "Work on multiplayer lobby participants, readiness, settings, host changes, or reconnect behavior."
---

# Game Lobby

## Goal
Create a reusable multiplayer lobby.

## States
- joining
- joined
- ready
- not ready
- host
- disconnected
- reconnecting
- full
- starting

## Events
- player joined
- player left
- ready changed
- host changed
- settings changed
- game started

## Rules
- Server is authoritative.
- Prevent duplicated players/events.
- Handle reconnects.
- Mobile/touch friendly.
- Motion must not control state.

## Verification

Test the affected server-authoritative lobby transition, duplicate events, and reconnect state through existing contracts.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

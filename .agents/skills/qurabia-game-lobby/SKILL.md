---
name: qurabia-game-lobby
description: "Use for Qurabia or Tahaddi tasks specifically involving game lobby. Apply the existing implementation and project conventions within the requested scope."
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

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

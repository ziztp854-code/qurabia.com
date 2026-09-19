---
name: qurabia-realtime-sockets
description: "Use for Qurabia or Tahaddi tasks specifically involving realtime & socket architecture. Apply the existing implementation and project conventions within the requested scope."
---

# Realtime & Socket Architecture

## Goal
Keep multiplayer state synchronized and resilient.

## Principles
- server authoritative
- explicit event schemas
- idempotent handling where possible
- reconnect strategy
- stale-state recovery
- event cleanup
- avoid duplicate listeners
- version game state if needed

## Pattern
Server Event
→ state validation
→ game state update
→ UI/motion reaction

Never let animation timing become game timing.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

---
name: qurabia-realtime-sockets
description: "Work on Qurabia socket contracts, synchronization, reconnects, or event listener lifecycle."
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

## Verification

Trace the affected event across client and server; test reconnect, stale or repeated events, and listener cleanup where applicable.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

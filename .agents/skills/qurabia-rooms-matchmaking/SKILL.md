---
name: qurabia-rooms-matchmaking
description: "Work on Qurabia room creation, joining, permissions, capacity, or reconnect flows."
---

# Rooms & Matchmaking

## Goal
Make room discovery/join/create flows reliable.

## Cover
- create room
- private/public room
- room code
- capacity
- join validation
- leave
- host transfer
- reconnect
- stale room cleanup if backend supports it

## Security
- validate room permissions server-side
- do not reveal hidden room data
- rate-limit creation/join attempts where appropriate

## Verification

Verify server-side access and capacity checks, repeated joins, and the relevant reconnect or host-transfer behavior.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

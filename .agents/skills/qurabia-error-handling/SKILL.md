---
name: qurabia-error-handling
description: "Use for Qurabia or Tahaddi tasks specifically involving error handling. Apply the existing implementation and project conventions within the requested scope."
---

# Error Handling

## Goal
Provide predictable failures.

## Cover
- network failure
- socket disconnect
- invalid room
- expired session
- game desync
- payment failure
- API validation errors

## Rules
- user-friendly Arabic messages
- technical details stay in logs
- retry only when safe
- prevent duplicate writes
- provide recovery action

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

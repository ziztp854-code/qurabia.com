---
name: qurabia-error-handling
description: "Improve Qurabia error states, recovery actions, safe retries, or user-facing failure messages."
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

## Verification

Exercise the affected failure and recovery path; verify retries cannot duplicate writes and user messages do not reveal sensitive details.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

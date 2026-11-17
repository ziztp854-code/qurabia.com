---
name: qurabia-auth-accounts
description: "Work on Qurabia sign-in, session, account recovery, protected routes, and related account flows."
---

# Authentication & Accounts

## Goal
Maintain secure, reliable user account flows.

## Cover
- sign up
- sign in
- sign out
- session refresh
- password reset
- email/phone verification if present
- profile editing
- account deletion if present
- protected routes
- guest state

## Rules
- Never trust client role/permissions.
- Do not expose tokens in logs.
- Keep auth state separate from game state.
- Handle expired sessions gracefully.
- Prevent duplicate submissions.
- Add loading/error/success states.

## Verification

Trace the affected session and authorization flow on the server; test success, expiry, failure, and retry cases relevant to the change.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

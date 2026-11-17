---
name: qurabia-notifications-toasts
description: "Work on Qurabia notification or toast display, deduplication, actions, and accessible feedback."
---

# Notifications & Toasts

## Goal
Centralize user feedback.

## Types
- success
- error
- warning
- info
- reconnect
- invite
- reward
- rank-up trigger

## Rules
- do not stack unlimited toasts
- dedupe repeated realtime errors
- provide action when useful
- do not use toasts for critical blocking flows that need dialogs

## Verification

Verify live-region semantics, repeated-event deduplication, dismissal, and actionable error recovery for the changed flow.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

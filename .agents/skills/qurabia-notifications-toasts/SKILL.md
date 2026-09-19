---
name: qurabia-notifications-toasts
description: "Use for Qurabia or Tahaddi tasks specifically involving notifications & toasts. Apply the existing implementation and project conventions within the requested scope."
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

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

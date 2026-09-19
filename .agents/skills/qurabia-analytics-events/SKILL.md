---
name: qurabia-analytics-events
description: "Use for Qurabia or Tahaddi tasks specifically involving product analytics. Apply the existing implementation and project conventions within the requested scope."
---

# Product Analytics

## Goal
Track useful product behavior without contaminating game logic.

## Events
Examples:
- game_opened
- room_created
- room_joined
- game_started
- game_finished
- subscription_viewed
- checkout_started
- rank_up_viewed

## Rules
- central event naming
- avoid personal secrets
- do not send hidden game information
- analytics failures must not block gameplay

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

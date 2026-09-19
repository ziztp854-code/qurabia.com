---
name: qurabia-profile-system
description: "Use for Qurabia or Tahaddi tasks specifically involving profile system. Apply the existing implementation and project conventions within the requested scope."
---

# Profile System

## Goal
Build a reusable player profile experience.

## Include
- avatar
- username/display name
- court rank
- subscription badge
- XP/progress
- game statistics
- achievements if real data exists
- recent activity if supported
- privacy controls if supported

## Rules
- Do not invent backend stats.
- Court rank is more prominent than subscription.
- Mobile first.
- Use skeleton/loading and empty states.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

---
name: qurabia-leaderboards
description: "Use for Qurabia or Tahaddi tasks specifically involving leaderboards. Apply the existing implementation and project conventions within the requested scope."
---

# Leaderboards

## Goal
Build clear, live, reusable rankings.

## Include
- rank position
- player
- court rank
- relevant score/XP
- time scope if supported

## Motion
Use subtle list reorder/FLIP animation when rankings change.
Data order must update immediately; animation only visualizes it.

## Performance
Virtualize large lists if needed.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

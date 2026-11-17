---
name: qurabia-question-games
description: "Work on Qurabia quiz or question-game timers, answer states, submissions, or score presentation."
---

# Question Games

Use for quiz / Millionaire-style experiences.

## Flow
Lobby
→ Countdown
→ Question
→ Answering
→ Lock
→ Reveal
→ Score
→ Next
→ Winner

## Requirements
- timer source of truth is game/server state
- avoid duplicate submissions
- clear selected/locked/correct/wrong states
- accessible keyboard/touch interaction
- animated score may visualize state but not determine it

## Verification

Test server-authoritative timer and answer transitions, duplicate submission handling, and accessible selected/locked feedback.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

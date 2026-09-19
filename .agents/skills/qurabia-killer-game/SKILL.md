---
name: qurabia-killer-game
description: "Use for Qurabia or Tahaddi tasks specifically involving killer / social deduction game. Apply the existing implementation and project conventions within the requested scope."
---

# Killer / Social Deduction Game

## Flow
Lobby
→ Role Reveal
→ Night
→ Role Actions
→ Day
→ Discussion
→ Voting
→ Elimination
→ Next Round
→ Winner

## Privacy
Do not expose hidden roles or private actions in general client state unnecessarily.

## UI
- private role reveal
- voting selection
- locked vote state
- eliminated state
- day/night transition
- winner reveal

Avoid violent or graphic elimination visuals.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

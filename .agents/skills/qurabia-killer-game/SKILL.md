---
name: qurabia-killer-game
description: "Work on Qurabia social-deduction game phases, private role presentation, voting, or reconnects."
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

## Verification

Trace authorization and projected state for each affected role; test that private roles and actions are not disclosed to other clients.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

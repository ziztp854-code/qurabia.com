---
name: qurabia-chess-game
description: "Work on Qurabia chess board interaction, legal-move feedback, clocks, or synchronization."
---

# Chess Game

## Goal
Keep chess interaction clear and fast.

## Focus
- legal move feedback
- selected square
- last move
- turn state
- captured pieces
- check
- checkmate
- timers
- reconnect/sync

Motion should never obscure the board.
Do not add decorative board movement that reduces usability.

## Verification

Test legal and rejected moves, turn feedback, and the relevant reconnect or timer behavior through the existing game contract.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

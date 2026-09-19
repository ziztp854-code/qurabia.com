---
name: qurabia-gsap-game-ui
description: "Use for Qurabia or Tahaddi tasks specifically involving gsap for game ui. Apply the existing implementation and project conventions within the requested scope."
---

# GSAP for Game UI

Use GSAP for:
- scene timelines
- stagger reveals
- score counters
- SVG drawing
- coordinated lobby/game transitions
- winner/rank-up sequences

## Requirements
- scope animations
- clean up on unmount
- kill timelines/listeners
- no orphaned ScrollTrigger
- respect reduced motion
- never make game logic depend on GSAP completion

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

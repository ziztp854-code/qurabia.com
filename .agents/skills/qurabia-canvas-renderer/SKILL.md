---
name: qurabia-canvas-renderer
description: "Implement or debug Qurabia canvas rendering for image sequences, resizing, frame loading, and cleanup."
---

# Canvas Frame Renderer

## Goal
Efficiently render image-frame sequences.

## Requirements
- requestAnimationFrame
- resize handling
- DPR cap where appropriate
- object-fit style cover/contain calculations
- progressive preload window
- cancel stale loads
- release references on cleanup
- avoid rendering when frame did not change

## Verification

Check resizing and device pixel ratio, loading/fallback behavior, reduced motion, and cleanup in the affected renderer; measure performance before optimizing.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

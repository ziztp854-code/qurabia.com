---
name: qurabia-frame-sequence
description: "Work on frame-sequence playback, fallback, loading, or memory use in Qurabia."
---

# Frame Sequence

Derived from the frame-sequence concept used in blender-style web experiences.

## Use sparingly
Good moments:
- Sultan rank-up
- reward reveal
- tournament intro
- special victory
- cinematic day/night transition

## Requirements
- canvas preferred for long sequences
- progressive preload
- responsive resolution
- WebP/AVIF where supported
- fallback poster/static frame
- reduced-motion fallback
- memory cleanup

## Verification

Verify the poster and reduced-motion fallback, loading failure, responsive sizing, and cleanup; compare performance on the affected device profile.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

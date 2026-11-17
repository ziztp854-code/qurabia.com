---
name: qurabia-performance
description: "Measure and improve Qurabia loading, rendering, networking, or interaction performance."
---

# Performance

## Audit
- bundle size
- route splitting
- images
- fonts
- long tasks
- rerenders
- socket chatter
- canvas memory
- animation cost
- CLS/LCP/INP

## Rules
- lazy load noncritical routes/assets
- optimize images
- avoid giant shared bundles
- prefer transform/opacity for motion
- profile before adding complexity

## Verification

Capture a repeatable baseline and compare the same route, device profile, and state after the change; report measurements and limitations.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

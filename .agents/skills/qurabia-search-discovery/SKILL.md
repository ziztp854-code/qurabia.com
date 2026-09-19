---
name: qurabia-search-discovery
description: "Use for Qurabia or Tahaddi tasks specifically involving search & discovery. Apply the existing implementation and project conventions within the requested scope."
---

# Search & Discovery

Use when Qurabia supports searching players, rooms, or games.

## Requirements
- debounce client queries
- server-side validation
- empty/no-result states
- recent/history only if product supports it
- accessible keyboard navigation
- Arabic text normalization only when it improves matching and does not corrupt usernames

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

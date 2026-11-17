---
name: qurabia-search-discovery
description: "Work on existing Qurabia player, game, or room search and discovery flows."
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

## Verification

Test query validation, empty/results states, keyboard navigation, and Arabic matching without changing stored identity data.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

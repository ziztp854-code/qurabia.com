---
name: qurabia-admin-moderation
description: "Use for Qurabia or Tahaddi tasks specifically involving admin & moderation. Apply the existing implementation and project conventions within the requested scope."
---

# Admin & Moderation

Use only if admin/moderation exists or is explicitly requested.

## Principles
- server-side authorization
- audit sensitive actions
- confirmation for destructive actions
- role-based access
- do not expose admin controls by frontend hiding alone
- protect user data

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

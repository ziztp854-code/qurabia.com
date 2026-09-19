---
name: qurabia-project-audit
description: "Inspect Qurabia or Tahaddi architecture before a requested cross-cutting refactor or project audit; keep routine changes scoped to their affected paths."
---

# Project Audit

Use this skill for a requested architecture audit or before a cross-cutting refactor. For routine changes, inspect only the affected flow.

## Goal
Understand the real architecture before changing code.

## Inspect
- package.json and scripts
- framework and version
- routes/pages
- components
- state management
- API layer
- backend services
- database models
- auth/session
- realtime/socket layer
- game engines/state
- styling/theme
- localization/RTL
- tests
- CI/CD
- deployment config

## Deliver
Produce a short architecture map:
- frontend
- backend
- realtime
- persistence
- game state
- auth
- shared UI
- risky coupling

Do not change code until the architecture is understood.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

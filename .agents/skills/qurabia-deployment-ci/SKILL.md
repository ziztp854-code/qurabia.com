---
name: qurabia-deployment-ci
description: "Review or change Qurabia deployment configuration, CI checks, release readiness, or rollback plans."
---

# Deployment & CI

## Goal
Keep production releases safe.

## Validate
- environment variables
- build
- migrations
- tests
- lint/typecheck
- asset paths
- websocket/realtime config
- payment webhook URLs
- CSP/security headers if used

## Prefer
- preview/staging
- rollback path
- small releases
- migration compatibility

## Verification

Validate affected configuration and checks without printing secret values; distinguish local validation from deployment and follow repository approval rules.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

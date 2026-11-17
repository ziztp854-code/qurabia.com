---
name: qurabia-security
description: "Review or implement security properties in a scoped Qurabia flow, including authorization, validation, and data exposure."
---

# Security

## Review
- auth
- authorization
- input validation
- XSS
- CSRF where applicable
- rate limiting
- secrets
- payment trust boundaries
- socket event validation
- hidden-role leakage
- insecure direct object references

## Rule
Frontend checks improve UX; backend checks enforce security.

## Verification

Identify the trust boundary and verify server enforcement with allowed and denied cases; avoid logging sensitive values.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

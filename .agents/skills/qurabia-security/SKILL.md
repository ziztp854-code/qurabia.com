---
name: qurabia-security
description: "Use for Qurabia or Tahaddi tasks specifically involving security. Apply the existing implementation and project conventions within the requested scope."
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

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

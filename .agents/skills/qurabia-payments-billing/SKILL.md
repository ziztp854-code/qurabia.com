---
name: qurabia-payments-billing
description: "Use for Qurabia or Tahaddi tasks specifically involving payments & billing. Apply the existing implementation and project conventions within the requested scope."
---

# Payments & Billing

## Goal
Keep billing secure and consistent.

## Requirements
- Backend validates price/product identifiers.
- Never trust client-submitted price.
- Handle success, failure, cancel, pending, renewal, and expired states.
- Keep webhook processing idempotent if webhooks exist.
- Persist entitlement changes server-side.
- Make UI resilient to delayed payment confirmation.
- Never log secrets or full payment details.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

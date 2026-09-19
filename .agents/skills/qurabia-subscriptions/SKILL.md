---
name: qurabia-subscriptions
description: "Use for Qurabia or Tahaddi tasks specifically involving subscriptions. Apply the existing implementation and project conventions within the requested scope."
---

# Subscriptions

## Goal
Implement paid membership without pay-to-win.

## Rules
- Subscription status comes from backend/payment provider.
- Never use localStorage as authority.
- Never grant direct competitive advantages.
- Never couple paid plan with court rank.

## Good benefits
- cosmetics
- profile customization
- room customization
- social/convenience features
- advanced statistics
- cosmetic reactions

## UI
- SubscriptionCard
- SubscriptionBadge
- CurrentSubscription
- SubscriptionComparison
- billing/manage subscription views

Use real plan names/prices/features from project configuration or backend.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

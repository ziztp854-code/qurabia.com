---
name: qurabia-court-ranks
description: "Work on earned court-rank presentation or progression using the existing authoritative rank implementation."
---

# Court Ranks

Current ranks only:
1. المشاهد
2. الفارس
3. الأمير
4. السلطان

## Goal
Represent earned player progression.

## Components
- CourtRankBadge
- RankProgress
- AnimatedXP
- RankUp

## Rules
- Use backend/current project source of truth.
- Do not hardcode new XP thresholds if existing ones exist.
- Do not add الوزير or أسطورة البلاط.
- Subscription must never grant a court rank.
- Sultan is currently the highest rank.

## Visual direction
- المشاهد: dark silver / simple seal
- الفارس: steel / shield
- الأمير: antique gold + emerald / small crown
- السلطان: royal black + gold / premium crown geometry

## Verification

Inspect the actual rank definitions and backend thresholds before changing presentation; report discrepancies rather than migrating rank data implicitly.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.

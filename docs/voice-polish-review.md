# Voice discovery, rooms and delivery review — 2026-10-26

Scope: local working-tree changes to voice discovery, room/chat presentation, event authorization and gift scheduling. The user subsequently authorized GitHub upload and production deployment. No schema changes are included.

## Behavior and latency

- Event GET/POST now validate active account/session version using four account fields. They no longer load display badges, profile decorations or the community catalog during authorization. Full display identity remains in join/display paths.
- Community member identities and the independent cosmetic catalog load concurrently. A deferred-query test verifies that the second query starts before the first resolves.
- Confirmed gifts start on snapshot arrival and advance on dismissal, replacing the 200 ms polling timer. A browser test freezes timers and verifies that a confirmed gift still appears. Existing deduplication, initial-history suppression, queue bounds and server cooldown remain intact.
- Chat displays pending-send status, retains edits and retry request identity, and continues to prevent duplicate in-flight submissions. No unconfirmed message or gift is presented as delivered.
- Mobile initially collapses vacant seats, with an explicit expansion control. Fixed a conflicting moderator-seat CSS rule that kept collapsed grid space occupied. Desktop retains expanded seating.
- Chat bubbles, input surfaces and spacing use existing navy/gold tokens. Discovery now has truthful room counts, a populated-room spotlight independent of sorting, working filter reset, retry states and correct selected navigation.

These remove identifiable waits; they are not measurements of production end-to-end latency. Database contention, SFU transport and deployed network latency remain unmeasured.

## Verification

- Vitest: 283 passed; 41 integration/environment-gated cases skipped (40 passed files, 4 skipped files). Includes authorization, delivery privacy, retry, typing isolation, gifts, queues and community identities.
- Playwright room: 9 passed, including 14 viewports from 320 to 2560 px, expanded seating, keyboard viewport changes, Arabic text at 200%, reconnect/draft retention and immediate confirmed-gift display.
- Playwright discovery: 2 passed, widths 320/390/430/1440/1920, search/reset/retry, reduced motion, focus and text zoom.
- Axe WCAG A/AA/2.1 AA: no automated violations on discovery fixture; room fixture also checked at 390 and 1440 px with no violations. This is not full accessibility certification.
- Changed TypeScript files pass ESLint; CSS literal-color budget and `git diff --check` pass.
- Release verification: the complete Next production build, type checking, static generation, public-secret exposure check and CSS budget pass. The earlier map type error came from stale generated workspace package declarations; rebuilding `@mamluk/world-map-core` and `@mamluk/maplibre-adapter` in the deployment order resolved it without source changes.
- The full Tahaddi surfaces suite passes (5 tests, including the two discovery tests above).

## Visual review

Reviewer: Codex, **self-review**, not an independent review. Existing Cairo/Alexandria fonts and voice color tokens retained; no new assets, fonts or runtime dependencies.

Evidence directory: `/workspace/voice-polish-evidence/`. Before/after discovery screenshots are in `lobby/before` and `lobby/after`. Room comparisons are `room/before-*.png` and `room/final-*.png`; `room/axe.json` records automated accessibility checks. Logs preserve test/build outcomes. Browser evidence uses Chromium on Linux with synthetic HTTP data, not real users or a physical phone.

| Category | Score | Evidence / deduction |
| --- | ---: | --- |
| Composition | 19/20 | Clear chat rail and visible mobile composer; expanded mobile seating necessarily requires scrolling. |
| Color/contrast | 14/15 | Existing tokens and passing automated checks; not every image-backed state manually sampled. |
| Typography/RTL | 15/15 | Arabic, mixed text, long identities, focus and 200% text checks. |
| Assets | 18/20 | Existing assets preserved and inspected at tested widths; high-DPR device rendering not checked. |
| Responsive layout | 15/15 | 14 room widths and five discovery widths; overlays and expanded controls reachable. |
| Usability/accessibility | 13/15 | Core fixture interactions and pending state verified; physical-device performance and authenticated real audio unverified. |

**94/100 — unverified for full visual acceptance.** Local presentation is improved and regression checks pass; remaining evidence gaps are physical-device/high-DPR performance and real authenticated audio/network behavior. No claim of production readiness or complete elimination of all site errors.

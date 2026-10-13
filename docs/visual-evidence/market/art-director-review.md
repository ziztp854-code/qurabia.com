# Independent Art Director / Visual QA — Market pilot

**Decision: accepted for the bounded local market presentation, 95/100.** This is an internal judgment, not a certification, production approval, or assessment of all Qurabia games. No observed acceptance blocker remains after the reviewed refinement rounds.

## Scope and reviewer

- Reviewer: Codex `quality_policy` subagent, independently reviewing the implementation agent's work using `qurabia-visual-qa`. This reviewer authored the permanent policy but did not implement the market presentation.
- Revision: rebased commit `e9eb06b` on upstream `origin/main` at `39eb1f3`, plus refreshed local browser evidence and this review. I inspected the market source diff against that upstream base. Its newer Sultan Farm wrapper/effects and Safari rules remain intact; market picture sources and scoped CSS follow the updated structure. The market input rule uses `max(16px, 1rem)` to preserve enlarged text while retaining the upstream minimum size. The user authorized push/deployment separately; this review assesses visual acceptance only and does not perform either action.
- Direction: existing Mamluk stone courtyard artwork with restrained teal/brass control surfaces; Cairo body and Alexandria headings; shared controls and semantic Kingdoms tokens. Other games retain their identities.
- Environment: Chromium via local village fixture at `127.0.0.1:3314`; actual components, installed fonts, Pixi overview and unchanged local game engine. No production account or authenticated server flow.
- Viewports/DPR: desktop 1440×900/1; mobile 390×844/1; narrow 320×568/2; tablet 834×1194/2; landscape 844×390/2. Reduced motion enabled. Enlarged-text evidence changes root font size to 200%, which is a text-reflow simulation, not native browser zoom.

## Evidence inspected

I opened `before-desktop.png`, `before-mobile.png`, and all five after viewport sets with `view_image`, including form, enlarged-text, and final `fields-text-200` images. I reviewed the affected source, five measurement JSON files, asset rendition manifest, and browser test implementation. Final enlarged resource screenshots show **50000** legibly, including the narrow 320px case; the earlier single-digit screenshots did not establish this.

Before/after desktop and mobile show a clearer hierarchy and usable form grouping. The original mobile portrait consumes almost the entire initial viewport; the new landscape presentation retains the full courtyard and reaches trading controls much sooner. This improves framing and navigation, not the underlying art's detail.

After the rebase, I reopened all five refreshed viewport images and all five refreshed `fields-text-200` images with `view_image`. The visible market composition, scene framing, tablet stacking, Arabic legibility and five-digit enlarged inputs retain the reviewed quality; no new blocker appeared. Historical before/performance artifacts remain evidence from the original pilot baseline, not new benchmarks of the upstream Sultan Farm changes.

Reported by the implementation agent on the rebased revision: six browser tests, 32 targeted unit tests, ESLint, and web/realtime builds passed. This reviewer examined the refreshed image/source evidence and test code but did not independently rerun those commands. The six browser tests exercise empty/error states, resource input, command payload, focus/Escape return to overview, and successful built-market publish/cancel using the unchanged engine. Builds do not contribute visual-quality points.

## Score and deductions

| Category | Score | Basis |
| --- | ---: | --- |
| Composition and alignment | 18/20 | Scene/header/panel align cleanly; empty-state grouping and tablet stacking improve balance. Deduct 1 for desktop artwork column's unused lower space and 1 for initial desktop/landscape publish action below the independently scrolling panel fold with little scroll affordance. |
| Colors and contrast | 15/15 | Coherent existing teal/brass identity; text/state palette and strengthened input border meet the sampled contrast thresholds. No observed color-based readability blocker. |
| Typography and details | 15/15 | Joined Arabic, heading/body distinction, legible labels and stable numerals. Final narrow enlarged-text layout stacks label/input when necessary and preserves five-digit values. |
| Assets and images | 19/20 | Existing courtyard perspective, material/light and landmark identity remain coherent; rendition dimensions/bytes and clean normal-scale rendering inspected. Deduct 1 for finite fine detail in the existing compressed master; a new high-detail art source has not been created. |
| Desktop/mobile responsiveness | 15/15 | Five browser viewports, no measured horizontal overflow, tablet stacking, visible publish action after scroll, readable enlarged values, and removal of mobile sticky-header occlusion. |
| Usability and accessibility | 13/15 | Named controls, ≥44px input heights, keyboard focus/Escape, reduced motion, engine-backed publish/cancel/error flow, and zero reported scoped axe violations. Deduct 1 because native browser zoom, WebP fallback, and additional browser/assistive-technology behavior are unverified; deduct 1 because comparative frame timing/FPS on a physical mobile device is unmeasured. |
| **Total** | **95/100** | **Internal, bounded assessment; no current material interaction/readability/responsiveness defect observed.** |

## Measured checks and asset provenance

Independently calculated sRGB contrast from actual tokens: foreground/surface **9.76:1**, muted/surface **6.92:1**, gold/surface **6.03:1**, danger/surface **5.90:1**, CTA text/gold **7.31:1**. Market control border blends the existing border 85% with foreground 15%, approximately **3.31:1** against the outer surface; the earlier border measured 2.63:1. These values cover the sampled flat UI pairs, not every possible composite or browser state.

`market-renditions.json` records the existing source at **1672×941, 571464 bytes**. Variants are 768×432, 1280×720 and 1672×941 in AVIF/WebP. AVIF bytes: **72899 / 166739 / 276197**; WebP bytes: **117876 / 259228 / 449126**. They are derived encodings/downsamples, not new detail or 4K/8K assets. Browser `naturalWidth`/`naturalHeight` with width-descriptor srcsets is density-corrected; encoded resolution comes from the manifest, not those browser values.

Final browser measurements record one market AVIF artwork request per tested viewport, no obsolete original/portrait preload, decoded images, no page errors, no page/scene horizontal overflow, and no scoped axe violations. Resource timings describe fast local fixture delivery, not internet/mobile-network latency. This market illustration is static and has no dedicated scene zoom; village-overview zoom/LOD/FPS is outside this pilot's evidence.

I also inspected `before-performance.json` and `after-performance.json`: paired Chromium 151.0.7922.173 samples use fresh desktop/mobile contexts, normal motion, a warm local fixture server, SwiftShader software GPU, and 120 requestAnimationFrame intervals on the static market. Median/p95 interval remains approximately **16.7/16.8 ms** before/after in both viewports. This is roughly 60 Hz callback pacing, **not measured game-rendering FPS or a physical-device benchmark**. No material local cadence regression appears in these short samples. Recorded desktop artwork bytes fall from 571464 to 166739 (about 71%); mobile portrait-to-landscape delivery falls from 446010 to 72899 (about 84%). Local image load times are 3.4–4.5 ms and too environment-dependent to establish a real-network latency improvement.

## Remaining actionable observations

- **P3 — desktop/landscape initial trading panel:** publishing is reachable by scrolling and verified, but its position below the initial panel fold is weakly signaled. Consider a visible scrollbar/scroll hint or slightly tighter summary spacing without reducing text/touch readability. The form screenshots prove reachability; the initial screenshot alone would not.
- **P3 — desktop scene column:** the large blank area under the proportional artwork reduces density relative to the form. A future composition revision could balance this without stretching the image or adding heavy decoration. It is not a usability blocker.
- **Verification limit:** native browser zoom, additional engines, WebP fallback decode, screen-reader traversal, real mobile thermal/FPS behavior, and production authentication/network remain unverified. Test them before making broader platform/accessibility/performance claims; this score does not grant full points to those unknowns.

## Resolved review blockers

1. Enlarged narrow mobile header previously covered substantial content: market header is now nonsticky and scrolls normally.
2. Required input boundaries previously lacked reliable contrast against outer surfaces: a scoped reusable border token now clears 3:1 in the sampled pair.
3. Enlarged narrow inputs originally accommodated only single-digit evidence: final container-responsive field layout and five-digit screenshots/width checks establish readable tested values.
4. Stacked portrait-tablet artwork initially selected a 1280px variant from an outdated 62vw `sizes` estimate: the final matching portrait-tablet media clause selects **1672×941**. I reopened the refreshed tablet screenshot and verified `tablet-measurements.json`: **802×451 CSS pixels at DPR2**, one **276197-byte** AVIF request, no overflow or axe violations.

The current images and test evidence support acceptance of this pilot only. Preserve these limitations when presenting its score and before/after images.

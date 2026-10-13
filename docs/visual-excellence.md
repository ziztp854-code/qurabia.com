# Qurabia — Visual Excellence

Permanent acceptance policy for requested visual work. Root `AGENTS.md`, the current user request, and existing design skill precedence still apply. This policy improves presentation, not game rules, persistence, entitlements, or production configuration.

## Scope and sources of truth

Apply the expanded loop only to visible UI, game buildings/scenes, illustrations, asset delivery, and responsive changes. For a nonvisual logic fix, run relevant engineering checks without a full visual audit. Inspect only affected routes and states; reuse valid assets and evidence when the source, state, viewport, and renderer are unchanged.

Read `design.md`, `docs/design-system.md`, relevant local skills, and the affected implementation before designing. The actual token and component implementation is authoritative for current values. Record conflicts in older prose instead of silently changing the product to match it. At policy creation, `apps/web/tokens.css` uses Cairo Variable and an Alexandria alias; the former Readex/Tajawal references in the two design documents were synchronized to these implemented local fonts. Do not load or substitute a font solely from stale prose.

Shared standards govern quality and behavior; game-specific tokens and art direction govern identity. The platform shell, Kingdoms village, and Mamluk map may have different palettes, surfaces, ornament, and composition. Do not replace every game with one gold/card template.

| Surface | Inspect first |
| --- | --- |
| Shared identity and UI | `apps/web/tokens.css`, `apps/web/src/app/globals.css`, `apps/web/src/components/ui` |
| Kingdoms village | `apps/web/src/components/kingdoms`, relevant village route, `apps/web/public/game-art/kingdoms` |
| Mamluk map/game | `apps/web/src/components/mamluk-map`, relevant game route, `apps/web/public/game-art/mamluk-map` |
| Browser evidence | Existing Playwright configs/specs in `apps/web`; use affected fixtures and production components |

## Reusable visual system

- Reuse existing primitive → semantic → component tokens. Add missing reusable tokens to the current source, scoped to the game where appropriate; avoid parallel token files and scattered literal colors.
- Define primary/secondary accents, restrained gradients when appropriate, text/surface pairs, borders, focus, hover/pressed, disabled, loading, selected, warning, success, and error states. Do not rely on color alone.
- Use the installed Arabic font system and logical CSS properties. Check joined Arabic glyphs, line height, diacritics, long labels, mixed Arabic/numerals, tabular resource counters, and RTL reading order. Functional text takes priority over ornament.
- Reuse spacing/radius/type scales, container widths, and z-index tokens. Align to a deliberate grid; use consistent density rather than equally sized generic cards for all content.
- Use one icon family per surface with consistent stroke, size, and optical alignment. Label icon-only controls; mirror directional navigation only when its meaning requires it.
- Reuse shared buttons, labels, panels, dialogs, tabs, and states before creating variants. Keep keyboard focus, disabled/loading behavior, and accessible names intact.
- Make light, shadow, material, and depth coherent with the scene. Decoration must support hierarchy and legibility. Add no expensive blur, particles, animation, or postprocessing solely to appear premium.
- Define mobile and desktop behavior explicitly, including overflow, controls, safe areas, overlays, and long text. Keep touch targets at least 44 × 44 CSS pixels. Respect reduced motion.

## Mandatory design refinement loop

1. Inspect current components, screenshots, game identity, assets, dimensions, renderer, and available tools. Choose one bounded surface and unchanged local fixture state.
2. Open the current result in a real browser. Capture **before** desktop and mobile evidence; note route/fixture, viewport, DPR, zoom, state, commit/worktree context, and any missing backend/data.
3. Record specific weaknesses and a concise art direction: hierarchy, palette, typography, material/lighting, depth, scene scale, interaction priorities, and responsive treatment.
4. Implement a production-quality presentation change using existing architecture, tokens, assets, and reusable components. Keep game rules/data untouched.
5. Reopen the changed surface in the browser; wait for images and fonts. Capture **after** at matching desktop/mobile states and viewports. Also check a narrow 320px layout, 200% text zoom, and relevant scene zoom limits when supported.
6. Inspect screenshots visually and exercise the page: alignment, balance, clipping, Arabic text, contrast, focus, keyboard/touch activation, panning/zooming, selection, and relevant empty/loading/disabled/error states. An isolated fixture proves the exercised presentation only; label it and do not claim authenticated end-to-end behavior from it.
7. Have the Art Director / Visual QA role review the final rendered evidence and measurements. Independent asset, accessibility, and responsive reviews may run in parallel when delegation is authorized; otherwise use the same named review role explicitly.
8. Fix impactful defects, rerender, and repeat inspection of changed states. Keep each review tied to the actual revision; do not recycle an obsolete score or baseline.
9. Run targeted engineering checks and available visual regressions. A build or typecheck proves code validity, not visual quality. Never update screenshot baselines blindly to make failures pass.
10. Deliver final desktop/mobile images, before/after comparisons, weighted score with evidence, commands and results, blockers, and measured limitations. If browser access or assets are unavailable, report **unverified** and do not award final acceptance.

Use existing fixture/regression tooling first, such as `playwright.village-scene.config.ts`, `playwright.living-city-regression.config.ts`, and the relevant Mamluk configs. Their configured device projects are starting points, not proof that every production flow was exercised. Avoid unnecessary new screenshot infrastructure.

## Kingdoms and Mamluk art/asset acceptance

- Preserve recognizable building silhouettes, visual tier differences, placement/hit targets, camera direction, ground plane, consistent scale, horizon/perspective, and a coherent light source. Do not move geometry or alter paths to change gameplay.
- Inspect textures, alpha edges, light/shadow contact, repeated/generic imagery, stretched perspective, blocked labels, and distinctive landmarks at normal and maximum supported zoom. Check that scene overlays remain legible without flattening the art.
- Record original encoded pixel dimensions, delivered dimensions/format/bytes, CSS display dimensions, DPR, and zoom. A larger export of a small original is not new detail. Never claim 4K/8K from filenames, upscaling, viewport size, or CSS size.
- Preserve high-quality masters where appropriate; serve measured WebP/AVIF variants with correct MIME types, responsive size selection, fallback, and intrinsic aspect ratio. Verify decode/display in supported browsers. Do not eagerly load every high-resolution variant on mobile.
- Use LOD, texture variants, mipmaps, or progressive loading when the renderer and measured zoom/performance need them. Inspect for popping, blur, alpha halos, and color shifts after optimization; these techniques are conditional, not mandatory new infrastructure.
- Image generation/processing is allowed when suitable tools and assets are authorized. Review outputs in context for hallucinated geometry, unreadable symbols, inconsistent lighting, and perspective defects. Tool output is a candidate asset, not automatic acceptance.
- Compare delivered bytes/load behavior and scene performance against the same fixture/device before and after. Report measured frame timing/FPS conditions and browser/GPU context; do not call emulator results physical-device performance. Keep controls responsive and avoid new layout shifts, decode stalls, or resource leaks.

## Art Director / Visual QA role

The repository role lives in [qurabia-visual-qa](../.agents/skills/qurabia-visual-qa/SKILL.md). It reviews composition/balance, palette/contrast, typography/RTL, asset/material/light quality, originality relative to the game's identity, perspective/clarity, desktop/mobile usability, and evidence quality.

Give the reviewer the affected paths, art direction, before/after images, viewports/state, asset measurements, checks, and known limits. The role reports actionable defects with severity, location/state, user impact, and a concrete remedy. It can reject visual acceptance; it does not authorize deployment or change game logic. A role assignment is not proof of an independent agent review: name the actual reviewer and whether review was independent or self-review.

## Internal scorecard — 100 points

The final target is **95/100 or higher**. This is an internal judgment backed by observable evidence, not an objective certification. Score each category separately and explain deductions; unknown evidence is unverified, not full marks.

| Category | Maximum | Evidence and deductions |
| --- | ---: | --- |
| Composition and alignment | 20 | Clear hierarchy and focal point; balanced grouping/grid; consistent spacing; no accidental overlaps or visual collisions |
| Colors and contrast | 15 | Coherent per-game palette; measured text/control contrast on actual surfaces; understandable focus/selected/error states |
| Typography and details | 15 | Legible Arabic, RTL/mixed numerals, weights/line height, icons, boundaries, long labels, and text zoom |
| Assets and images | 20 | Verified dimensions/detail at required zoom; coherent perspective/scale/lighting/material; distinctive buildings; clean delivery/alpha edges |
| Desktop/mobile responsiveness | 15 | Matching browser evidence; usable narrow widths and desktop; no page overflow/clipped controls; stable overlays and touch targets |
| Usability and accessibility | 15 | Verified core interactions, keyboard/focus/names, status beyond color, reduced motion, and performance preserving usability |

Contrast minimums: WCAG AA 4.5:1 for normal text, 3:1 for large text, and 3:1 for required control/focus boundaries against adjacent surfaces. Sample real colors, including image/gradient backgrounds; a uniform-token calculation cannot prove every composited background.

**Acceptance blockers override any score:** unreadable or clipped essential information, failed core interactions, inaccessible controls/focus, broken RTL, impactful mobile overflow, missing required browser evidence, visibly damaged/stretched essential assets, or material loading/FPS regressions. Report `needs revision` for blockers or scores below 95; report `unverified` for incomplete evidence. Never inflate the score to close the task. A polished but limited pilot may be delivered with its honest score and remaining work.

## Tool/skill review before adding dependencies

Inventory installed skills, image tools, Playwright, accessibility checks, and the scene renderer first. For a candidate GitHub tool, document its canonical source, reviewed commit/version, license, maintenance status, relevant source/security behavior (scripts, downloads, telemetry, credentials/network), framework/runtime compatibility, expected cost, and why the installed stack is insufficient. Review transitive dependencies where material. Do not bulk-install skill repositories or execute unreviewed installers.

Evaluate only relevant candidates across UI/UX, visual review, design systems, color, typography, responsive layout, image optimization, visual regression, 3D environment art, game UI, and accessibility. A reference or shortlist is not an installation. Prefer a small locally authored role when existing project tooling suffices. Any new installation must meet the user’s source/license/security/compatibility requirement first.

## Review record template

```text
Surface and revision:
Direction and reused tokens/components/assets:
Reviewer and independence:
Route/fixture, state, viewports, DPR, zoom, browser:
Before/after desktop/mobile image paths:
Asset dimensions/formats/bytes and provenance:
Composition /20; color /15; typography /15; assets /20;
responsive /15; usability/accessibility /15; total /100:
Contrast/interaction/zoom/performance measurements:
Checks actually run and results:
Blockers, deductions, unverified production/device behavior:
Decision: accepted / needs revision / unverified
```

Keep this record with task artifacts; do not store secrets or production account details. Reuse valid evidence by recording exactly what remains unchanged. GitHub pushes and Render or other deployments require explicit approval; local inspection and reversible presentation improvements do not.

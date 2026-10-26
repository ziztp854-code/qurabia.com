# Owner sapphire frame refinement

Local presentation update, 26 October 2026. The existing `frame-owner-sapphire` belongs to account 1 according to `docs/exclusive-profile-frames.md`. The runtime asset URL is preserved. No database, grants, roles, entrance effects, deployment configuration or production account data changed.

## Result and implementation

The new frame uses a finer champagne-gold bezel, midnight enamel, a five-point sapphire crown and a smaller pendant. The thinner ornament gives the photograph more visual priority. The generated artwork was inspected and encoded with existing Sharp tooling; no runtime dependency was added.

Browser inspection also exposed a CSS cascade defect: the global `.v-avatar img` rule could override the exclusive portrait's 64% dimensions. Adding `.v-avatar` specificity to the existing exclusive portrait selectors restores the intended dimensions, including the existing Amira renderer. No entitlement or rendering logic changed.

Following the requested sizing adjustment, the owner's photograph now occupies 60% of the artwork canvas, positioned 20% from the inline edge and 22% from the top. These account-specific values match the sapphire aperture, replacing the old shared 64% / 18% / 23% placement. Both profile and voice renderers use the same proportions at every size. Other frames retain their original proportions. The missing-photo placeholder is centered and contained within the same opening.

Source master: image-generation output `/workspace/generated_images/exec-ad2c38b2-bbc0-40d8-b392-2ed44017e59d.png`, 1254 × 1254 PNG. Delivered asset: 768 × 768 RGBA WebP, 139094 bytes versus 178658 bytes before (22.1% reduction). Center and corner alpha checked separately. This is generated jewelry artwork, not a physical product photograph.

## Browser evidence

Actual production profile and voice-avatar components rendered by the existing local Vite fixture at `http://127.0.0.1:3331/?surface=owner-frame`. The fixture uses synthetic profile data and the bundled `/avatars/ghaith.png` image; it does not load the real owner account. Launch from `apps/web` with `COMMUNITY_UI_E2E=1 node ../../node_modules/tsx/dist/cli.mjs e2e/fixtures/community-server.ts`.

Chromium `/usr/bin/chromium`, headless, DPR 1, browser zoom 100%, viewport height 1000. Text enlargement uses root font size 200%, not browser zoom. Before and after use the same fixture and CSS imports; after additionally includes the intended cascade correction.

| State | Before | After |
| --- | --- | --- |
| Mobile, 390px | [Before](before-390.png) | [After](after-390.png) |
| Desktop, 1440px | [Before](before-1440.png) | [After](after-1440.png) |
| Narrow, 320px, 200% text, reduced motion | — | [After](after-320-text200-reduced.png) |
| Light theme, 390px | — | [After](after-390-light.png) |

[Avatar details](detail-390.png). [Before measurements](before-checks.json), [after measurements](after-checks.json), [portrait geometry and axe](accessibility-checks.json).

All four final states display eight owner-frame images, with no broken images, JavaScript errors or page-level horizontal overflow. Profile avatars are exercised at 48/88px (the existing profile CSS sets large avatars to 88px); voice avatars at 40/48/64/112px, including speaking state and a missing photograph. Owner photo widths are measured at 60% of the computed avatar width, with 20% inline and 22% top offsets. The frame remains decorative and does not intercept pointer events; no interaction behavior was changed. Frame resource encoded bytes match the delivered asset.

## Engineering checks

- Targeted Vitest: 3 files, 33 tests passed (`exclusive-cosmetics`, `realistic-art`, `voice-ui`).
- ESLint on the changed fixture and production voice component: passed.
- `git diff --check`: passed.
- Initial local build/typecheck exposed missing installed dependencies and stale generated types. Installed the existing frozen lockfile and regenerated the existing Prisma client and workspace packages before release validation; no dependency versions or schema were changed.
- Final `pnpm --filter @tahaddi/web build`: passed, including Next.js TypeScript checking, public-bundle exposure check and CSS color-budget check. Stale generated `.next` route types were moved out of the worktree before the clean build. Prerequisite contracts/database/domain and map package builds passed.
- Prettier check of changed TSX/CSS and this report: passed.
- Axe on the final mobile fixture: no violations; image-composited color contrast remains incomplete.

## Art Director / Visual QA

Reviewer: Codex primary agent, self-review. Scope: avatar artwork and portrait placement. Composition 19/20; colors 13/15; typography/details 13/15; assets 18/20; responsive 14/15; usability/accessibility 13/15; total **90/100**. Deductions reflect unverified composited contrast and physical-device behavior, miniature gem detail loss, and existing profile-page text clipping at 200% text size. The affected avatar photographs remain within their rings after the correction.

Decision: **unverified** for full Visual Excellence acceptance; the scoped improvement is reviewable. Existing surrounding profile controls/labels can clip or wrap poorly at 320px with 200% text. These surrounding layout issues are outside this artwork update and are not claimed fixed. No physical iOS/Safari, authenticated production account, live audio, FPS or keyboard-flow acceptance is claimed. Local evidence precedes the user-authorized GitHub push and production deployment; release status is reported separately.

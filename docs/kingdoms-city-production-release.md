# Kingdoms living city release

## Permanent recovery and visual guard

The recovery branch `codex/living-city-recovery-20261006` integrates the approved Living City source from `0ed6ed6f997f824c882a22c90328661500c28bf8` above the gameplay batch in `1650e5906edbaa719229de2088ce2d598382150e`, retaining the later authenticated-world readiness fix from GitHub main `5333841e8118e5c53b4dd698bca926805bfd7870`. The approved source and the published batch were sibling histories; the latter did not contain the independently authored city hub and building scenes. A Vercel rollback alone therefore left the GitHub source vulnerable to the next old-scene deployment.

`apps/web/e2e/living-city-regression.spec.ts` checks both the Living City composition/image source and eight committed visual references: overview, palace, barracks and stable at 1920x1080 and 390x844. The references originate from the immutable `0ed6ed6` checkout, not the recovery implementation. A pre-integration run against `1650e590` failed on the absent city composition attribute and recorded the retired `mamluk-capital-1280.webp` source. Traces, screenshots, video and console/network logs preserve that RED checkpoint in local ignored release evidence.

Windows and Linux references are separate. The Linux reference environment and the `living-city-visual` CI job use `mcr.microsoft.com/playwright:v1.63.0-noble@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7` with shared IPC. CI compares committed images with retries disabled and `--update-snapshots=none --repeat-each=10`; it never creates or updates approved baselines. A missing reference or an artwork/layout regression fails the job. Dynamic resource numbers are masked; artwork, headers, navigation and building identities remain compared. The browser clears transient pointer/keyboard focus before capture and waits for renderer readiness, decoded images and fonts.

The existing PostgreSQL job retains its database concurrency, coverage, unit, build and authenticated gameplay checks. Its Village Scene tests now exercise the real City Hub and dedicated scenes, preserving offline construction settlement, XP/power, stable upgrades/training, resource tiers, incoming threats, world navigation and bounded keyboard/drag/pinch controls. The separate city acceptance suite covers all requested resolutions, including the added 320x568 and 412x915 profiles. Dedicated scenes own their building artwork and return navigation; the former floating village sheet is not reintroduced to satisfy obsolete assertions. Failure artifacts cover both browser suites and the visual guard.

The Stable desktop training form retains the later cavalry-unit selector. A narrowly scoped screenshot-only mask covers that form and its dependent controls, not the scene art, camera, header, sidebar frame, level or upgrade summary. The guard asserts the original 1920x1080 sidebar/form geometry before masking. The identical policy is applied to canonical `0ed6ed6` captures; repaired rendering is never a reference source. Separate desktop and touch journeys assert both cavalry options, selected mounted-archer costs/count, actual queue creation, return navigation and 44px controls. Lazy facility content and its applied CSS must be ready before capture. The default Next.js E2E configuration excludes these fixture-only specs; their dedicated configs and CI jobs remain mandatory.

Production CSP remains unchanged. The renderer imports Pixi's bundled CSP-safe adapter, which uses static shader/uniform implementations rather than runtime function generation. The authenticated PostgreSQL journey checks city identity, renderer readiness and real canvas mouse/touch interaction before its existing build/train/persistence/security assertions, preventing silent image fallback from being mistaken for a working production renderer.

Run from the repository root:

```sh
pnpm --filter @tahaddi/web exec playwright test --config playwright.village-scene.config.ts
pnpm --filter @tahaddi/web exec playwright test --config playwright.city-scenes.config.ts
pnpm --filter @tahaddi/web exec playwright test --config playwright.living-city-regression.config.ts --update-snapshots=none --repeat-each=10
```

Reference updates require a deliberately selected approved source checkout and the same pinned browser environment. Use `LIVING_CITY_FIXTURE_ROOT` and `LIVING_CITY_BASE_URL` to run the regression spec against that reference fixture; only an explicit local `--update-snapshots` capture may change baseline images. Verify new references with ten consecutive comparison runs before committing them. Do not update snapshots to accept a broken recovery or production rendering.

These guards prove the fixture's UI and real in-memory game engine integration. Live PostgreSQL validation and production route/browser verification remain independent release requirements. Historical verification totals below describe the original `0ed6ed6` release and are not counts for this recovery; the recovery's final release record must include the exact published commit and resulting production deployment.

## Recovery verification record

Final executable source and tests were verified in isolated recovery checkouts on 2026-10-06. The final Village tree is `9721b11ba1d1d36a9e79b05ebc0d69f55ee8ca15`; application code, unit tests, city tests and visual guards are identical to the earlier fully verified `40a2e7e9` tree. The later Village-only changes clear carried-over mouse hover and close preferences before accessing underlying controls. No application styling, test assertions or timeouts were changed for these fixture corrections.

- Full web suite with actual PostgreSQL: 309 files, 2001 tests passed, zero failures or skips.
- Strict visual comparisons: 100 passed (50 desktop, 50 mobile), zero retries and no reference updates.
- Dedicated city acceptance: 37 passed, zero retries or skips, including every requested desktop/mobile/tablet resolution.
- Village Scene: 64 passed and 36 intentional device-specific skips across 100 listed cases; zero failures, interruptions or retries. Required resolutions and touch behavior are also covered without skips by the city matrix.
- Built Next.js authenticated PostgreSQL journeys: desktop and mobile passed, including CSP without `unsafe-eval`, Pixi readiness, physical canvas interaction, persistent build/train results, commander return, map controls and authorization checks. Anonymous boundaries: six passed.
- Production web/realtime builds, full TypeScript and web lint passed. Lint retains one existing `site-shell.tsx` warning. Camera/input regressions passed, as did renderer/canvas tests after the CSP adapter correction.
- The unchanged 10,001-village integration fixture initially exhausted its five-second budget returning an unused enormous JSON state from Prisma. Selecting only its ID on that test write cut the targeted case to 2373 ms. The persisted dataset, both overview reads, privacy/count/stable-ID assertions and original whole-test timeout remain unchanged; no production map code was altered.

Canonical reference provenance is exact `0ed6ed6`, with separate Windows/Linux browser captures. Only the Stable desktop references were recaptured under the reviewed functional-control mask; the other fourteen PNGs remain byte-identical. Failed development runs and final logs, traces and provenance manifests are retained in ignored local release evidence, not committed environment/database files.

GitHub CI, the resulting main commit, Vercel deployment and authenticated production smoke checks must be confirmed independently after publication. A rollback is not the recovery mechanism.

## Original Approved Release

Date: 2026-10-06. Integration baseline: GitHub `main`, `c580b6a5f17f42cf48a5e5df8d2cc956d6f2d7e6`.

The recovery's current production dependency audit reports 31 inherited advisories: 1 critical, 15 high, 11 moderate and 4 low. Manifests and the lockfile are unchanged. Static review of the critical `proxy-addr` advisory found its vulnerable IPv6 trust-subnet configuration absent from the supported realtime entrypoints (Express keeps `trust proxy: false`). This is a scoped disposition, not a claim that dependencies are vulnerability-free; the other advisories and a separately verified dependency update remain follow-up work. The older audit counts below are historical.

## Scope and preservation

This release adds the independently composed landscape/portrait City Hub, animated Pixi inhabitants and water, calibrated building hit areas, eight dedicated major building scenes, accessible camera/return navigation, an owned palace garden and an additive workshop inventory/queue. It includes 63 WebP assets and the city asset manifest.

The release was assembled in an isolated checkout of the actual production source. Existing commanders, nine troop types, stable requirements/training, incoming attack warnings, campaigns, provisions, geography, caravans, siege combat, progression and onboarding state remain in the production implementation. The older development checkout's core, schema, packages and deployment configuration were not substituted for production versions.

Garden and workshop state are additive JSON fields. No schema migration, reseed or player reset is required or run. Workshop persistence applies production geographic provisioning after world advancement. Workshop inventory is separate from existing battle siege state; attachment of the new workshop equipment to battles is outside this addition.

Landscape artwork is native 1672×941 and portrait artwork 941×1672. The responsive layout accommodates 2K and 4K screens within a native artwork cap; assets are not claimed to contain native 4K detail. Secondary building scenes reuse a relevant major scene.

## Release gates

1. SPEC REVIEW: city-first scope and existing production gameplay preservation reviewed against the supplied requirements.
2. CODE REVIEW: no remaining actionable security/correctness finding after geography persistence, cavalry requirements, valid Arabic labels and render-ref corrections. Ownership, session revalidation, CSRF, limits and idempotency reviewed.
3. VISUAL REVIEW: fresh isolated-release pixels reviewed on desktop, phone, landscape, 2K and 4K. HUD roof occlusion and detached large-screen controls were corrected. Prior development-checkout captures are historical evidence only.
4. PLAYWRIGHT TEST: 33 distinct isolated-release cases passed across targeted executions: 17 critical journeys and 16 viewport profiles. Two large-screen cases passed again after the final frame correction. Automatic retries: 0; QA skips: 0.
5. INTEGRATION REVIEW: final source review has 0 actionable standards/spec findings. Full web suite, TypeScript, lint, web build and realtime build passed.

## Verification record

- Full web suite: 1934 passed, 52 skipped; 302 passing files and 6 skipped files. Existing component assertions were updated for lazy independent scenes and explicit return navigation, retaining server command/resource assertions.
- Final TypeScript and web lint: passed; lint has one inherited warning in `site-shell.tsx`. Final Next.js production build, CSS hex budget and public Supabase exposure checks passed. Realtime build passed.
- Garden/workshop domain and repository coverage: 97.64% statements, 88.76% branches, 97.36% functions and 99.35% lines. These figures cover the four added domain/repository files, not the entire application.
- Critical browser journeys include eight genuine Pixi scene selections and camera return, garden A/B isolation/save/reload/city-preview pixels, keyboard and artwork faults, actual build/train/trade/campaign actions, workshop settlement/repair, moving NPCs/pause/reduced motion, camera bounds/profiles, fallbacks, asset budgets, optional onboarding, existing stable upgrades/cavalry training and commander recruitment/assignment/campaign callbacks.
- Viewports: 1280×720, 1366×768, 1440×900, 1920×1080, 2560×1440, 3840×2160; 360×800, 375×812, 390×844, 393×852, 414×896, 430×932; 768×1024, 834×1194, 1024×768; landscape 844×390. No unexpected page error or horizontal page overflow was observed.
- One initial camera run was interrupted during development-server reload/readiness; the exact preset assertion was retained and the quiet rerun passed. The 33-case count records distinct passing cases across runs, not a single uninterrupted run. A later targeted runner replaced the original matrix output; the entire sixteen-profile PNG archive is not claimed as retained. Final 2K/4K screenshots remain in local ignored browser output.

Release source is linked to Vercel project `tahaddi-platform-realtime` (`prj_aW3JkAc4tEm4c2LCNNMI4yNoW9l6`). The last production deployment before upload is `dpl_Fx7yuooD2rmgbWBUKF3ufmWBN6y2`, source `c580b6a5`. Publishing success must be confirmed from the resulting deployment and public domain separately from these local gates.

The dependency manifests and lockfile remain unchanged from the production baseline. Production dependency audit found 0 critical, 13 high, 11 moderate and 4 low inherited advisories. These are not introduced by this patch.

Live PostgreSQL integration requires an isolated local `kingdoms_test` database; absent such a database those cases remain skipped. Browser fixtures use a local test world and do not prove authenticated production persistence. Public post-deployment smoke checks will not issue gameplay commands against real players.

## Source groups

- City scenes, renderer, camera, garden and facility components under `apps/web/src/components/kingdoms/village`.
- Additive integration in `kingdoms-client.tsx`, `village-panel.tsx` and their scoped CSS.
- Camera/composition types and tests under `apps/web/src/lib/kingdoms/village`.
- Garden/workshop domain, repositories, API routes and tests.
- `apps/web/public/game-art/kingdoms/city-hub` and `city-scenes`.
- Local fixture and Playwright city acceptance suite. Generated browser reports, environment files and dependency/build output remain excluded from Git.

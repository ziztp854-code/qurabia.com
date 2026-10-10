# Sultan garden navigation and release constraints

This records the cosmetic garden change from PR #51 (2026-10-10), including navigation regressions found before publication. The economic food-producing `farm` building remains separate. New planting is free and cosmetic; an existing paid policy-1 crop retains its frozen food entitlement for one successful collection, with a full store preserving that crop for later collection. There is no production migration or player-command verification.

## Shared navigation callback

`VillageSceneProps.onFacilitySelect` previously repeated a narrow union containing only `war-council` and `siege-workshop`. Adding `sultan-garden` to the canvas navigation contract left that wrapper type behind. The wrapper now references `VillageCanvasProps['onFacilitySelect']` directly instead of maintaining a second union.

The existing `village-scene.test.tsx` regression asserts exact callback-type equality using `expectTypeOf`, enforced by the full TypeScript release check. It also opens the garden through `VillagePanel` and verifies that navigation does not issue a game command. A runtime test alone would not detect a narrowed TypeScript callback contract.

## Touch target separation

The original portrait garden entrance rectangle began at `0.28 * 900` and was `0.37 * 900` wide. Its transparent HTML button, placed above building input regions, could capture browser-adjusted embassy taps. The existing iPhone wall/embassy/mine journey reproduced the error: an embassy tap opened the garden.

The corrected portrait rectangle begins at `0.325 * 900` and is `0.28 * 900` wide. Its center remains `418.5` world units, preserving the visible gate position while leaving the embassy gutter. Other building placements and the separate economic farm are unchanged. CSS still enforces a minimum physical target size of 48 pixels through the camera scale.

`sultan-garden-entrance.test.tsx` checks the garden rectangle's dimensions and a gutter of more than 40 world units from the embassy focus point in both compositions. The existing wall/embassy/mine Playwright case passed on tablet, iPhone and Android after the fix. The full Village Scene suite also checks building selection, return navigation, camera controls and state settlement across desktop and touch profiles. The Sultan Farm mobile flow checks usable target size, persistence and preservation of non-garden village state.

## Initial onboarding focus

The initial onboarding focus callback is applied by a React effect. Finding its text in the document does not guarantee the effect has completed. The test now waits for the existing `hall` focus callback using `waitFor`; it retains the subsequent tour, navigation and account-storage assertions without changing product behavior or increasing a timeout.

## Artwork status

This change retains `citySceneAsset('sultan-garden')` backgrounds `sultan-farm-user.webp` and `sultan-farm-user-mobile.webp`. The separately approved frontal city/garden candidate is preserved outside the source checkout as a reference and is not integrated. The existing scene is an angled palace courtyard with independently calibrated landscape and portrait bed geometry. Replacing its raster with the frontal image without reauthoring that geometry would misalign interactive beds; using the same candidate for the City Hub would additionally misalign building hotspots and actors.

Integrating that candidate requires a separate bounded artwork pass: confirm the intended surface, prepare independent landscape/portrait compositions, calibrate bed or building hit areas as appropriate, verify mobile target separation and persistence, and review deliberate reference updates in the pinned browser environment. Do not replace an interactive background merely because a candidate was approved as a visual reference.

## Required release verification

The normal pre-push guard remains enabled for lint, full TypeScript, tests and the original production build including postbuild checks. CI must pass on the final head, including PostgreSQL concurrency/coverage, Village Scene and dedicated city scenes, and canonical image comparisons with unchanged limits, no automatic reference updates and ten repeated comparisons. Successful individual jobs do not override a failed overall workflow. Merge through the normal expected-head path; verify the official Git production deployment, its exact merged SHA and the public `qurabia.com` alias separately from previews.

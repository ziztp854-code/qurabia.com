# Village asset backlog

Presentation only. These entries do not add gameplay, levels, or bonuses.

The current registry stays `villageAssets` in `apps/web/src/lib/kingdoms/village/assetManifest.ts`. Ultra and HiDPI terrain plates stay in place.

## MISSING_ASSET

Dedicated cutouts are still plate or fallback crops:

- Hall, farm, market, and wall use `fallbackCrop` from the oasis plate.
- Lumber, quarry, mine, treasury, warehouse, barracks, embassy, gate, tower, and rally have no shipped standalone art (`src: null`, `placeholder: true`).
- Construction scaffold above a building in progress is a DOM indicator. No scaffold sprite is shipped (`data-construction-asset="MISSING_ASSET"`).
- NPC and environment slots still crop the original plate.

Stable levels 1–5 are the exception: `stable-l1.webp` through `stable-l5.webp` are dedicated assets.

## Later dedicated art

When art is approved, drop it into the existing manifest slots. Do not add a second registry.

Future plots stay non-interactive: blacksmith, siege, hospital, knowledge, archery, industry.

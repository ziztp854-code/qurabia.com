# Village asset backlog

Presentation only. These entries do not add gameplay, levels, or bonuses.

The current registry stays `villageAssets` in `apps/web/src/lib/kingdoms/village/assetManifest.ts`. Ultra and HiDPI terrain plates stay in place.

## Shipped cutouts

Hall, farm, lumber, quarry, mine, treasury, warehouse, barracks, market, embassy, wall, gate, tower, and rally have transparent WebP cutouts for visual sources L1, L3, and L5. Visual slots L2 and L4 reuse L1 and L5. Native generation frames are 1280×720, 1152×864, 864×1152, or 1024×1024. They are not native 4K or 8K. Ultra variants exist only where the trimmed subject already covers about 4× the world slot: mine L5, gate L1, tower L3, and rally L1.

Stable L1–L5 remain the previous 768×464 cutouts.

`construction-scaffold.webp` is a presentation overlay. The construction clock is unchanged.

## Still required

- Independent paintings for visual slots L2 and L4.
- Native art large enough for Ultra on the big slots (hall, farm, barracks, market, wall). Current HiDPI files are downscales of the generated subject, not a higher native capture.
- NPC and environment atlases still crop the oasis plate.
- Future plots stay non-interactive and unpainted: blacksmith, siege, hospital, knowledge, archery, industry.

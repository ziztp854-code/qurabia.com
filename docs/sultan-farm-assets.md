# Farm artwork provenance

Background: user-selected `D:/UserData/Downloads/Gemini_Generated_Image_7vdqzr7vdqzr7vdq.jpg`, decoded2752×1536. The original was read only. WebP derivatives keep the full composition at2048×1143 (673884bytes) and1280×714 (256280bytes). Soil coordinates use the2048×1143 space.

Botanical atlas: generated with the built-in Imagegen tool, transparent PNG; no downloaded third-party farming assets. The source atlas is `public/game-art/kingdoms/city-scenes/sultan-farm-botanical-atlas.png`. Nine optimized transparent WebP tiles live under `sultan-farm-plants/`. Pixi blends young/flowering/ripe tiles and changes height while holding the ground anchor fixed. Only visible canopy sway is cosmetic; server farm contracts govern all time and rewards.

Final generation prompt:

Use case: historical-scene. Asset type: one transparent botanical sprite atlas for the Qurabia Sultan Farm game. Create a SQUARE1024x1024 PNG with genuinely transparent background. Exactly NINE separate realistic botanical cutouts in a precise3 columns by3 rows grid, each centered entirely in its own equal square cell, ample transparent padding, no touching between cells. Columns left to right: a small wheat clump, a bush bean plant, a dwarf pomegranate shrub. Rows top to bottom: young seedling with only green leaves and NO fruit; full grown green plant starting flowering with NO visible edible ripe fruit; mature plant ready for harvest (golden wheat ears, hanging green bean pods, red pomegranates). Consistent plant species across rows, all roots anchored at bottom center of each cell. Elevated three quarter isometric camera looking down at approximately30 degrees, warm afternoon sunlight from upper left, believable natural leaf textures, warm muted olive greens, amber grains, terracotta red fruit, detailed organic leaves and stems, refined realistic historical palace garden game art, not cartoon or pixel art. Soil contact is a small flat faint shadow only; NO soil mound, NO pots, NO ground tile, NO labels, NO text, NO borders, NO grid lines, NO scenery. Each crop isolated, the complete plant fully within its cell, clear root-to-crown silhouette, leaves do not cross cell boundaries.

Actual generated resolution: **1254×1254**, alpha range **0–255**. Row boundaries were inspected and calibrated at y=0/378/795/1254 to avoid importing pieces from the adjacent growth row. Cropping and WebP conversion preserve alpha; no user background was edited by generation.

## Photographic plant set (2026-10-11)

The production renderer now uses transparent photographic cutouts for all ten plants rather than
mixing three raster crops with six procedural vector drawings. Each crop has `young`, `flowering`,
and `ripe` WebP frames at 256×256. The five server growth stages remain unchanged: the scene maps
sprout/growing to `young`, fruiting to `flowering`, and ripe to `ripe`; seed remains a small soil
marker. Lotus is an additive free cosmetic crop and its first collection grants the cosmetic
`garden:lotus-bloom` badge. It does not change village resources.

The source sheets were generated with built-in Imagegen, one three-frame transparent sheet per
crop. Shared prompt constraints: botanically accurate plant; young, budding/flowering, and mature
stages left-to-right; realistic botanical photography; isometric three-quarter camera looking down
about 35 degrees; warm light from upper left; common root baseline; true alpha; no text, pot,
scenery, frame, or watermark. FFmpeg cropped equal thirds, fitted each specimen to 256×256 without
distortion, preserved bottom anchoring, and encoded transparent WebP at quality 88.

The Pixi renderer loads the stable path
`sultan-farm-plants/<crop>-<young|flowering|ripe>.webp`. Wind is cosmetic and deterministic: the root
anchor remains fixed while the canopy receives layered low-amplitude rotation and skew. Animation
still stops for reduced-motion, low-quality mode, off-screen scenes, and hidden pages.

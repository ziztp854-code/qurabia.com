# Academy and blacksmith village sites

The overview now has two visibly empty courtyards in both independently composed city backgrounds. The academy site sits east of the palace garden and north of the mosque, with access from the garden-side lane. The blacksmith site sits south of the market and east of the war council, with access from the market and storage lanes. The existing central avenue and military quarter remain in place.

`knowledge` and `blacksmith` are presentation landmarks classified as `reserved`, with no gameplay target. They are labelled **الأكاديمية / الحداد — مساحة مهيأة**. The former shared blacksmith shortcut to the siege workshop is removed; the genuine siege workshop still opens from its own catapult courtyard and directory.

The new versioned `overview-*-planned*.webp` assets retain the original raster dimensions and have dedicated mobile renditions. Original overview assets remain available. Both backgrounds were edited with the built-in image generation tool from the actual shipped artwork, not from the unintegrated Sultan Garden candidate. The palace/garden, embassy, barracks, stable, market, warehouse, granary, siege courtyard, gates and resource sites retain their logical placements. The visual art is generated; details outside the edited sites may differ subtly.

Each vacant-site footprint is calibrated separately in `city-composition.ts`. Pixi excludes those footprints from all enlarged touch targets even at compact overview scales. The native HTML fallback checks the same visible footprints before pointer activation. Labels have no pointer handler and never intercept pan/pinch. Keyboard activation of named buildings remains available.

The existing garden facility now shares the Pixi canvas pointer path while Pixi is ready. Its DOM button remains for keyboard and native fallback. A separate `onGardenSelect` callback keeps it out of economic building discriminants. Its nominal 48px touch bounds exclude existing building footprints and both reserved sites. This prevents mobile Chromium touch adjustment from redirecting a palace-center tap to the neighboring DOM garden button.

Touch double-tap comparisons use stable client coordinates. If Pixi has already opened a facility during `pointerup`, input clears the prior tap and retains `BUILDING_SCENE`. The 320px regression recorded the overview bounds becoming zero when the palace opened; comparing coordinates relative to those new bounds had falsely treated a distant earlier tap as a double tap and changed the hidden camera to exploration.

On compact phones the garden's minimum 48px touch height now expands around its authored center, with its gate anchored to the authored courtyard edge. It previously expanded downward toward the fixed barracks; a physical Chromium barracks-center tap opened the garden at 320px. The physical-touch regression covers embassy, garden and barracks in sequence. At 360px and below, the academy label sits below the garden label with a line pointing to the empty courtyard; short landscape screens give it a horizontal gutter. Its footprint and interaction boundary stay fixed.

No building keys, server commands, player plots, resources, military progression, garden contracts or legacy crop entitlements change. No migration is required.

Verification covers the reserved footprints against existing buildings and actor corridors, Pixi touch exclusion across scales, native fallback, desktop and portrait/landscape touch navigation, embassy/garden separation, zoom/reset, retained scene camera and unchanged player state. Intentional overview image changes require reviewed canonical Linux screenshot references; all existing comparison thresholds remain unchanged.

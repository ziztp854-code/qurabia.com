# Voice effects preview evidence

25 October 2026. Source baseline: `6ff010afcd68d2a8da5959cefd9b40b1237281e4`;
final images are the current working-tree implementation. Chromium 154.0.8037.57,
DPR1, headless software rendering. Synthetic accounts and HTTP, actual production
room components, existing mocked AudioSession. No live accounts or deployment.

- `preview.mp4`: actual mobile browser recording of VIP entry, realistic car and
  dragon gifts, store selection and hearts. Audio intentionally absent from the
  recording. Generated artwork uses CSS image compositions, not articulated video.
- `before-{1440,390}.png` / `after-{1440,390}.png`: matching settled room state,
  same synthetic host identity, first two messages and no effects; immutable HEAD
  presentation loaded for before. Active gifts have a dedicated row.
- `desktop-gift.png`, `mobile-gift.png`, `mobile-dragon.png`: decoded asset
  presentations; sender/recipient/count visible; seats are outside the gift row.
- `320-room.png`, `390-room.png`, `1440-room.png`: no horizontal overflow in browser.
- `store.png`, `mobile-store-reduced.png`: realistic assets, selection and touch UI.
- `mobile-text200.png`: 320px width, captured font sizes doubled including px sizes.
  This is a text-sizing simulation, not a physical device or OS zoom claim.
- `browser-checks.json`: two viewer order/reconnect scenario metadata and widths.
- `accessibility.json`: gift dialog Axe audit: zero violations; two incomplete
  checks retained for inspection. Reduced art reports zero running animations.
- `audio-performance.json`: real WebAudio context/rendered samples and live stream
  track during the dragon, 120 rAF intervals, visible dock control hit tests.
  Latest isolated run was about 60Hz (p95 ~16.7ms, zero >50ms frames); use JSON for
  exact measurements. It does not establish physical mobile, network or SFU audio.

The 228 voice unit tests pass (9 integration cases skipped); 3 browser tests pass.
Targeted lint, CSS literal budget, public bundle key check and diff whitespace pass.
The full web production build and workspace lint pass after rebuilding existing
map packages; no map source change was necessary. See
[implementation notes](../../voice/room-effects.md).

## Art Director / Visual QA self-review

Reviewer: Codex, same-agent self-review; no independent reviewer was used.
Direction: existing Arabic Cairo typography, dark room tokens, restrained gold,
photographic products and golden cinematic VFX. Existing identity assets and
speaker rings are preserved. Assets are local, explicitly measured WebP derivatives.

Internal score: composition 19/20; color 14/15; typography 13/15; assets 18/20;
responsive 14/15; usability/accessibility 14/15; total **92/100**.
This is an internal visual judgment, not certification or production acceptance.
Deductions: existing narrow-room density and fixed-size avatar initials at doubled
text; mixed opaque photographic backgrounds vs transparent new VFX; two incomplete
contrast checks; real-device and production audio evidence unavailable. Fully
articulated cinematic sequences are not supplied or simulated as video assets.

Decision: **needs revision for the repository's 95-point final visual acceptance**;
the implementation and actual preview are delivered with these limits stated.
Core interactions, RTL, reduced motion and the dedicated gift row are verified.
No production publication, full-device performance or complete build is claimed.

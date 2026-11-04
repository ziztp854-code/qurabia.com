# Ladder intro — local presentation verification

Reviewed 2026-11-04 by the independent Test Automation Engineer agent, acting as Visual QA. Scope: the actual `LadderIntro` React component, approved video, and production tokens in a loopback Vite fixture. Room snapshots and the question placeholder are synthetic. This does **not** certify production multiplayer timing, authentication, independent networks, physical phones, or human-audible sound quality.

## Direction and source

- Preserve the approved cyan-left/gold-right VS video and full duration; actual player names are React text overlays.
- The delivered asset is 1920×1080 H.264 (CRF 22) with the source AAC audio copied unchanged, 9.775011 seconds, 3,581,983 bytes. The user-supplied approved master was 3840×2160, 33,315,488 bytes; no trim was applied. The implementation owner additionally verified matching audio-bitstream hashes between the source and delivered asset.
- Video uses `object-fit: contain`. Standard names stay overlaid. Long names on narrow screens use stacked rows beneath the complete frame, avoiding clipping at enlarged text sizes.
- Name backing uses the existing dark stage token at 90% opacity. This raises worst-case contrast over a white video frame to approximately 9.09:1 for cyan and 14.10:1 for gold, using sRGB alpha compositing. This calculation concerns settled text, not intermediate opacity-animation frames.
- Reduced-motion preference displays a static VS/name presentation and does not autoplay the moving video.

## Evidence and checks

Command from `apps/web`:

```sh
node node_modules/@playwright/test/cli.js test --config playwright.ladder-intro.config.ts
```

Final result: **6 passed, 25.5 seconds, zero retries**. An optional repeat run was stopped at the parent's request after ten passing cases; it was not a completed ten-repeat certification and is not counted as such.

The six tests cover:

1. Desktop 1440×900: full frame, actual decoded media dimensions/duration, dynamic names, shared elapsed position, and removal only on a simulated server snapshot.
2. Portrait phone viewport 390×844: same checks, no page overflow.
3. Narrow viewport 320×700: same checks, no page overflow.
4. Landscape phone viewport 844×390: same checks, no page overflow.
5. Actual video playback and mute toggle; natural video end retains the intro rather than opening a question locally.
6. Reduced motion, long Arabic names, 320px viewport, and 200% root font size: names fit within their containing stage without cropping.

Additional actual Chrome check: the sound button accepted keyboard focus and Space toggled the video's muted property. Its measured touch target at 390px was 144.6×44 CSS pixels. No human listening claim is made.

Screenshots (local artifacts, deliberately not committed as binary fixtures):

- `apps/web/test-results/ladder-intro-evidence/before-preview-1440x900.png`
- `apps/web/test-results/ladder-intro-evidence/before-preview-390x844.png`
- `apps/web/test-results/ladder-intro-evidence/after-1440x900.png`
- `apps/web/test-results/ladder-intro-evidence/after-390x844.png`
- `apps/web/test-results/ladder-intro-evidence/after-320x700.png`
- `apps/web/test-results/ladder-intro-evidence/after-844x390.png`
- `apps/web/test-results/ladder-intro-evidence/after-320-reduced-long-200percent.png`

Before screenshots are the approved standalone preview, not the old production room. After screenshots render the actual new component with fixture controls outside it. Browser: installed Chrome via Playwright, DPR 1, normal page zoom except the explicit text-size test. Mobile evidence is viewport emulation, not physical-device testing. The local fixture loads no production account data.

The initial review found two defects, both fixed and rerendered: long names clipped at 200% font size, and cyan text lacked dependable contrast on cyan video frames. The final review found no remaining blocking presentation defect in the exercised states.

## Visual QA score

| Category | Score | Evidence / deduction |
| --- | ---: | --- |
| Composition/alignment | 19/20 | Balanced left/right names and centered VS; long-name fallback intentionally gives up the overlaid composition. |
| Color/contrast | 15/15 | Existing cyan/gold identity, dark name backing with worst-case contrast calculation, readable controls. |
| Typography/details | 14/15 | Arabic joining and long names remain readable; at 200% text size the fallback needs substantial vertical space. |
| Assets/images | 20/20 | Full verified video frame and duration, no visible stretching/cropping in examined browser evidence. |
| Desktop/mobile responsiveness | 15/15 | Four viewports plus 200% text and reduced-motion state; no horizontal overflow. |
| Usability/accessibility | 12/15 | Keyboard sound control, touch size and static reduced-motion state pass; screen-reader announcement behavior and physical-device media policy remain untested. |
| **Total** | **95/100** | Internal judgment, not external certification. |

**Decision: accepted for the exercised presentation fixture.** Production integration and the authoritative intro-to-question transition require separate verification. Local Vite compilation time and test-run duration are not production page-load measurements.

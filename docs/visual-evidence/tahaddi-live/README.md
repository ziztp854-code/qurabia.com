# Tahaddi Live reference UI — browser evidence

Captured 2026-10-22 from branch `feat/tahaddi-live-reference-ui`, based on commit `22b6ef02458143646155219890d0eeba7a8688f5` plus the task's uncommitted changes. These are real Chromium renders, not mockups. Browser: Chromium 154.0.8037.57, headless Linux; local Cairo variable font; default screenshots DPR 1 and 100% zoom.

## Evidence

| State | Mobile | Desktop |
| --- | --- | --- |
| Before, existing synthetic room | [390×844](before-390x844.png), [430×932](before-430x932.png), [320×700](before-320x700.png) | [1440×900](before-1440x900.png), [1920×1080](before-1920x1080.png) |
| After, same room data | [390×844](after-390x844.png), [430×932](after-430x932.png), [320×700](after-320x700.png) | [1440×900](after-1440x900.png), [1920×1080](after-1920x1080.png) |
| After, explicitly occupied synthetic room | [390×844](after-occupied-390x844.png) | [1440×900](after-occupied-1440x900.png), [1920×1080](after-occupied-1920x1080.png) |
| Interaction/stress | [Reply](after-chat-reply-390x844.png), [keyboard viewport](after-keyboard-390.png) | [200% computed text](after-text200-1440.png) |

[Native mobile 1080×1920 output](after-mobile-reference-1080x1920.png) uses a 360×640 CSS viewport at DPR 3. The separate [1080×1920 CSS viewport](after-1080x1920.png) correctly follows the existing desktop breakpoint; these are distinct cases. The 1920×1080 desktop image is the requested 16:9 ratio.

Before screenshots were captured before source edits using the existing `live-room-responsive` fixture and copied here. The fixture data is unchanged in normal after screenshots; empty seats are now expanded by default, so composition differs intentionally. Before at 1080×1920 was not captured and is not fabricated.

## Checks run

```sh
cd apps/web
LIVE_ROOM_STAGE=before node node_modules/@playwright/test/cli.js test --config playwright.live-room.config.ts -g 'room fits responsive'
node node_modules/@playwright/test/cli.js test --config playwright.tahaddi-reference.config.ts
node node_modules/@playwright/test/cli.js test --config playwright.tahaddi-reference.config.ts -g 'mobile reference ratio'
```

Baseline: 1 test passed across 14 viewport sizes. Final room validation after the density/navigation refinements: the four interaction/occupied/native-ratio cases passed; the strengthened default-layout case initially found the last desktop row extending 5 px beyond its scroll viewport. Reducing desktop row gaps by 3 px fixed it. The targeted geometry rerun passed in 8.5 seconds and regenerated every normal after screenshot. No new runtime errors in the checked default states.

The tests verify:

- 320×700, 390×844, 430×932, 1080×1920 CSS, 1440×900 and 1920×1080 layouts: RTL, no horizontal page overflow, no broken images, on-screen room controls with minimum 44×44 targets.
- At 1440 px and 1920 px, the strengthened geometry case also verifies every normal seat lies within the stage viewport at initial scroll.
- A synthetic nine-seat room: no overlapping seat bounds at mobile and desktop sizes. Missing profile photographs remain null; no illustrated replacement or fabricated person is inserted.
- Reply sends the expected `replyTo` and text in exactly one POST; changing the local draft sends no POST. Draft clears after successful send. Escape closes mobile chat and returns focus to its toggle.
- A simulated keyboard viewport from y=20 to 350 keeps chat inside those bounds with focus inside it. At doubled computed Arabic font sizes on desktop, the textarea is 74 px high against 74.4 px line-plus-padding (rounding tolerance 1 px); no horizontal overflow.

Initial targeted existing tests exposed Escape focus restoration and a fixed 42 px desktop textarea clipping at 200% text. Both were fixed and verified by the dedicated tests. Existing tests that assume collapsed empty seats need their state setup adjusted before using them unchanged after the deliberate default-state change.

Machine-readable records: [default geometry](after-measurements.json), [occupied geometry](occupied-measurements.json), [keyboard/text zoom](keyboard-textzoom.json), [baseline geometry](before-measurements.json).

## Verification limits

The fixture uses the actual `VoiceRoomView`, production CSS/assets, deterministic synthetic HTTP snapshots/preferences, and an `AudioSession` adapter. It does **not** prove authenticated backend access, database persistence, actual microphone permissions, SFU audio, real video/PK, production performance or physical mobile keyboard behavior. Viewport/font-size simulation is not physical-device certification.

The reference composite is visible in the chat but its original PNG bytes are unavailable in this checkout. Therefore no reference pixel-difference or SSIM score is claimed. Different source images, actual room membership, moderation controls, absence of a video/PK backend in this audio surface, and actual profile metadata remain material differences. The latest user direction excludes drawings: the occupied fixture now leaves missing profile images null, and the desktop no longer expands an avatar into an artificial portrait stage. A visual QA review is recorded separately in `docs/tahaddi-live-visual-review.md`.

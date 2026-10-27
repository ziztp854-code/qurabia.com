# Tahaddi Live — immersive audio studio

The final presentation follows the actual completed OpenDesign Cloud / Local Codex artifact, `outputs/open-design-live/index.html`, including the subsequent removal of the large hero heading and subcopy. Earlier slate/mint candidate screenshots are superseded. This is a local implementation; it has not been deployed.

## Visual direction and source fidelity

Charcoal studio with cyan accents, small pink live controls, local Cairo conversation text and Alexandria headings. Existing voice token names remain scoped compatibility aliases; other product surfaces retain their palettes. No dependency or runtime font request was added. The OpenDesign font is not bundled, so existing Arabic fonts are retained.

The two original OpenDesign PNG files are copied byte for byte into `apps/web/public/voice/`. The studio background uses `live-studio-night.png` directly, not an optimized substitute. SHA-256: `1F829006A54126BD50FC8DC0A14B3674C2AEE56BA078F7F02427A39A65E9F154`. The decorative 3-by-3 portrait sprite is `guest-portraits-grid.png`, SHA-256: `940F1363432ABA2C9B17DA1ADFF40C14A8D99B7FA9952269F656DCAC3341A849`. Real profile images take precedence. Sprite faces are aria-hidden decorative fallback artwork, not verified photographs of participants. The local preview contains synthetic identities.

## Room and discovery

The room name appears compactly in the host header. The accessible h1 remains visually hidden; the large hero and description no longer occupy the stage. Nine modest guest seats fit normal 320-by-720 and 390-by-844 viewports, with a separate stage scroll region for enlarged text or longer content. Desktop uses a broad stage and an integrated chat rail; four explicit grid rows place stage flexibility on the stage rather than audio controls.

Mobile chat is an intentional floating stream, with passive pointer events so it cannot intercept guest controls. Its composer remains interactive, clear of the control dock. A separate compact strip holds the audio disclosure and host end-broadcast action above the stream. Opening audio exposes an opaque bounded panel. Full chat retains reply, report, pin controls, keyboard focus return and keyboard-aware sizing. Overflowing messages are keyboard-focusable. Existing handlers, media behavior, authorization and persistence are preserved.

Discovery reuses the same exact studio asset and scoped palette, larger room covers, one mobile card column and existing filter/retry states.

## Evidence and limits

Focused browser checks cover room layout at 320, 390, 430, 1021 and 1440 widths; 200% text; simulated keyboard; nine-seat last-row hit testing and separation from chat; full-chat reply/report/pin access; draft availability during synthetic API acknowledgement; pinned/reply composer reachability; keyboard focus return and reduced motion. Discovery checks cover responsive filters, text zoom, accessibility, retry and inactive-room state. See `docs/voice-polish-evidence/after` and user-facing `outputs/voice-redesign/final-*` evidence.

The room suite had five passing tests and one keyboard-scroll accessibility failure after reducing stream height; adding tabIndex=0 to the message log made the focused accessibility rerun pass. The final nine-seat and accessibility rerun passed together. The two discovery tests passed. Targeted ESLint, CSS color budget and diff whitespace checks passed. The root agent separately confirmed the full Next.js build.

Axe reports zero violations in its final room audit but leaves four color-contrast nodes incomplete. Contrast over imagery still needs manual assessment; this is not a blanket WCAG certification. Synthetic browser previews do not prove production deployment, real microphone publication, remote audibility, server-owned moderation or database safety.

## Reproduce the local presentation

From apps/web: set LIVE_ROOM_E2E=1 and VOICE_STUDIO_PREVIEW=1, then run `node --import tsx e2e/fixtures/live-room-server.ts`; open http://127.0.0.1:3417/. Omit VOICE_STUDIO_PREVIEW for the default six-participant fixture. From repository root run `pnpm --filter @tahaddi/web exec playwright test --config playwright.voice-polish.config.ts`, and the discovery config with `voice-lobby-polish.spec.ts`.

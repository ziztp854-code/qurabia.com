# Chat typing QA

Independent QA owner: `typing_qa` (Agent 4). Source revision: base `b78162f6`, with the uncommitted chat composer isolation and message-row memoization for this task. No production, deployment, permissions, message transport or audio logic changes are owned by this agent.

## Scope and environment

- Actual `VoiceRoomView`, production CSS/assets, localhost Vite development fixture, mutable synthetic HTTP snapshots and the existing mocked `AudioSession`.
- Linux cloud container, headless system Chromium 151.0.7922.173 on Debian 13, Node 24.19.0, DPR 1, 4-core CPU cgroup. Desktop 1440×900 and mobile viewport 390×844. Mobile coverage uses a mobile-sized Chromium viewport, not an Android browser or physical device.
- No available WebKit browser binary, `adb`, `/dev/snd` or `/dev/bus/usb`. Safari, physical Android/iOS, native OS keyboard opening/closing, real microphone/audio and SFU behavior were **not executed**. No browser/device download or environment changes were needed.
- Chromium clipboard uses `navigator.clipboard` plus native Ctrl+V; the composition check uses Chromium CDP IME commands and remains a synthetic IME check.
- Keyboard coverage uses focus/blur and synthetic `visualViewport` resize; it cannot prove a physical keyboard's behavior.

## Reproducible command

From `apps/web`:

```sh
node node_modules/@playwright/test/cli.js test --config playwright.chat-typing.config.ts
```

A single worker runs after the performance baseline window closes, without competing browser tests. `--list` parsed all three tests successfully before execution. The final actual run passed **3/3 tests in 35.8 seconds**, with **0 failed and 0 skipped**. Targeted ESLint passed for the new spec/config, and `git diff --check` passed. Functional tests are not a source of typing latency/CPU claims; those measurements belong to the separate browser performance evidence.

## Acceptance coverage

| Requirement | Execution scope | Result |
| --- | --- | --- |
| 100 rapid English characters; no missing characters | Native browser keyboard events, exact value and caret | Passed |
| Long Arabic text | Native browser text insertion, exact full value | Passed |
| Incoming message while typing | Real room polling consumes mutable synthetic snapshot during per-character input | Passed |
| Typing with microphone running | Real microphone/audio unavailable; unmuted UI and mocked connected audio session only | Not executed on real media |
| Active speaker motion | Fixture event enters actual production speaker state and running CSS animation is asserted | Passed |
| Owner badge entrance while typing | New participant with owner/verified badges enters an accepted polled snapshot during typing | Passed |
| Rapid deletion/paste and middle insertion | Chromium clipboard, Ctrl+A/Backspace and exact caret checks | Passed |
| Keyboard open/close | Synthetic visualViewport resize with focus and draft preservation | Passed simulation; native keyboard not executed |
| Message sent and appears once | One recorded POST, one rendered message and successful clear | Passed |
| Continuous writing without dropped characters | Exact full draft, stable focus and final caret during concurrent updates | Passed |
| 200% text, seats/controls/avatars | Actual computed font doubling at 390×844 and 1440×900, collision/reachability/aspect ratio guards | Passed |

This is a nonvisual performance refactor. The visual check is a focused regression guard; no new art direction, visual score or full-product visual acceptance is asserted.

## Observed results and retained evidence

All evidence JSON files include SHA-256 fingerprints of the tested production files:

- `voice-chat.tsx`: `6aaed1f3f23b3e928a3a5273c770c5703c0f976b00d4a9ddf9e6e64a7cb4fd5c`.
- `voice-room.tsx`: `d7f15c7aad6bb2031bc2e9662672bb1fcb1f7d659044ce080f2fdf7ebdabbb85` (unchanged by this task).

1. [Desktop input JSON](qa/desktop-input.json): exactly 100 rapid keyboard characters; 760 Arabic characters; a 460-character native clipboard paste; quick select-all/delete; native middle insertion advances the caret from 79 to 80 without losing focus; CDP composition commits `اختبار` once. Exactly one message POST and one rendered matching article after send. No `pageerror` events.
2. [Concurrent update JSON](qa/concurrent-updates.json): 207 Arabic characters preserved exactly across five heartbeat reads, seven participants, a new message, an owner/verified arrival and active speaker updates every 160ms. Both the message and owner entrance became visible at draft length **15/207**, proving they arrived during writing. The final caret was 207 with focus retained. The actual speaker subtree had running 650ms/1800ms CSS animations. No message was sent by typing.
3. [Viewport/200% JSON](qa/mobile-and-text-zoom.json): root computed font size was **32px at both viewport sizes**, avoiding accidental 400% accumulation. No page horizontal overflow or seat collisions; avatar width/height difference 0px; all inspected controls remained inside the viewport. Visible occupied-seat height was **96.80px at 390×844** and **181.03px at 1440×900**. These are occupied-seat checks, not an all-empty-seat load test.

Independent rendered-image review by Agent 4 inspected [keyboard simulation](qa/after-keyboard-simulation-390x844.png), [mobile 200% text](qa/after-text200-390x844.png) and [desktop 200% text](qa/after-text200-1440x900.png). The focused textarea and send control remain inside the simulated keyboard viewport; seats, avatars and the control dock retain their intended shape and separation. Arabic text is joined and RTL. Scrollable room/chat content may extend beyond the current scroll window at 200%; this evidence does not claim all content is simultaneously visible. No CSS or visual design changes were made.

No failing functional regression was found in these three tests. Real-media typing, physical mobile/OS keyboard, Safari/WebKit and Android-device behavior remain **unexecuted**, rather than passed or silently skipped. This QA result supports the exercised frontend behavior only, not production audio/device acceptance. Latency and CPU claims must use the separate controlled browser-performance report, not the duration of these acceptance tests.

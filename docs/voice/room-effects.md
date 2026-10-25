# Tahaddi Live room effects

Implemented for `/voice`, the existing Next.js/React voice product. The independent
`/community-voice` mesh pilot is unchanged. Baseline: commit
`6ff010afcd68d2a8da5959cefd9b40b1237281e4`. No deployment or database migration.

## Behavior and preview

Run from `apps/web`:

```sh
LIVE_ROOM_E2E=1 VOICE_EFFECTS_PREVIEW=1 node --import tsx e2e/fixtures/live-room-server.ts
```

Open `http://127.0.0.1:3418/` and, in a separate browser profile/context,
`http://127.0.0.1:3418/?viewer=guest1`. This is a loopback-only, synthetic-account
preview using the real room components and room-state reducer. Its cookie-based
viewer selector is **only fixture code**, never a production authorization path.
AudioSession is replaced by the existing fixture adapter. The default fixture on
3417 remains available without `VOICE_EFFECTS_PREVIEW`.

Reload the host preview to see its VIP arrival; open الهدايا, select a gift and
send. Preview and production trial gifts use the existing five-second server
throttle. Hearts and a short sparkle celebration have their own 1.2-second
server throttle. The تخفيف المؤثرات button remains available on mobile.

- Reuses existing server-resolved identity, frames, entrance banners, Arabic fonts,
  theme tokens, speaker illumination, accessible dialogs, account badges and
  real-time notifications. Ordinary arrivals last 1.6s; privileged arrivals 2.6s.
  Crown/car/portal/meteor accents follow the trusted account rank.
- Gift scenes occupy a dedicated smoothly expanding row above the seats, rather
  than covering the chat, microphone or participant controls. The row is
  pointer-transparent apart from its dismiss control.
- One active gift, at most 12 pending groups, 15-second freshness deadline.
  Repeated sender + recipient + gift events within 12 seconds combine, with a
  cumulative counter even across successive presentations. Overload drops only
  visual effects; confirmed gift receipts remain in chat.
- Initial history is consumed silently; duplicate IDs cannot replay on polling or
  reconnect. Hidden views consume events without building a visual backlog.
- Hearts/sparkles rise in a narrow, pointer-transparent rail: maximum six at once,
  two-second animation, no animation under reduced motion. Server state retains
  at most 24 recent reactions and never exposes the per-member throttle field.
- Frames add a bounded shimmer without rotating the photograph or replacing the
  speaker ring. Small avatars retain a static frame; VIP text is legible beside
  the existing entitlement badge. No badge or animation grants privileges.
- Gift store is dynamically imported; image variants are loaded when mounted.
  CSS transforms/opacity animate local WebP assets. No canvas, video decoder,
  animation runtime download, audio playback or external asset service is added.
  Timers/listeners/requests are released on unmount.
- OS reduced motion and low CPU devices automatically use the light mode. Manual
  preference is local to the browser and respects the account's existing reduced
  effects setting when no explicit local override exists. It cannot override OS
  reduced motion. Existing speaker illumination remains unchanged.

## Authority, transport and money

Gifts use the existing `VoiceChatCommand` receipt transaction, scoped to room,
account and request UUID. New clients retain the same UUID after an ambiguous
send failure. A retry cannot create another gift, including after message
removal. Gift receipts carry `clientId`; LiveKit notification selects that exact
receipt. The packet schema derives gift IDs from the shared catalog.

The existing authenticated HTTP event endpoint performs origin, schema, account,
membership, room-open, recipient and throttle checks. Effects do not request SFU
publication changes. The existing LiveKit change/message notifications and HTTP
snapshot fallback distribute the committed events. Heart events are bounded
snapshot data and use the same command receipt mechanism. Joining an existing
membership preserves its joinedAt; no extra entrance broadcast channel exists.

This work does **not** introduce purchases, prices, wallet writes or rewards.
The pre-existing gifts remain explicitly free trials. A future paid catalog must
emit animation receipts only after its authoritative purchase transaction commits;
a client presentation event is never evidence of payment.

## Reviewed libraries (25 October 2026)

No new runtime dependencies. Installed `framer-motion`/Motion continues to animate
the shared dialogs; CSS handles these bounded effects. Existing GSAP, Pixi and
Three.js were inventoried but are unnecessary for this surface.

| Canonical source / reviewed revision | Maintenance and license | Decision / integration cost |
| --- | --- | --- |
| [Tencent VAP](https://github.com/Tencent/vap/tree/5d7c9f6789ccc5f384356001b71ef90c876cd95e) | README explicitly says maintenance stopped, despite repository not being archived and a recent release record. `LICENSE.txt`: MIT with third-party notices; GitHub metadata alone reports NOASSERTION. | Browser MP4 alpha + JSON/WebGL supports names/photos and destroy(). Needs authored encoded video, GPU decoder budget and browser lifecycle work. Rejected as a new dependency. |
| [SVGAPlayer Web Lite](https://github.com/svga/SVGAPlayer-Web-Lite/tree/5a4ad9deb02486165ba8b52fc6303b7a08bb8d5b) | Last reviewed commit 28 February 2025, not archived, no GitHub releases. Apache-2.0. | README documents Canvas, Worker parsing, async mount, SVGA 2.x only and **no audio**. Useful with an actual licensed SVGA catalog; none supplied. Avoid worker/decoder cost now. |
| [dotLottie Web](https://github.com/LottieFiles/dotlottie-web/tree/d8a4e9e2cf76740b7b3848257f962b38d71aa71a) | Active October 2026; reviewed release 0.81.0; MIT. | Canvas/WASM with software/WebGL2/WebGPU backends. Browser-only lifecycle and WASM loading required. Good future option for commissioned JSON/.lottie assets, unnecessary for local image effects. |
| [tsParticles](https://github.com/tsparticles/tsparticles/tree/d78159e1a26ff6466e9acce1ec712b36b4b5aa39) | Active October 2026; latest release record 4.4.0; MIT. | React-compatible modular engine, density/FPS controls and destroy lifecycle. Six CSS sprites and four sparks do not justify a separate canvas engine. |
| [Motion](https://github.com/motiondivision/motion/tree/fa2079f101353f1fa1c9463f5ba9709a0ca3d3bf) | Active 23 October 2026; MIT (`LICENSE.md`). | Already installed as framer-motion, compatible with the current client React components. Reuse Dialog/AnimatePresence, focus handling and reduced-motion support; no second Motion package. |

Inspected canonical README usage and license files plus repository metadata,
latest commit and release records. No candidate installation scripts, sample
asset packs, remote CDN runtime or tracking integration were executed. Existing
locked dependencies were restored with frozen-lockfile installation when the
provided node_modules lacked LiveKit/Sharp; manifests and lockfile are unchanged.
Player software licenses do not license third-party gift artwork.

## Artwork and limitations

See [the gift asset manifest](../../apps/web/public/voice/gifts/README.md).
The final preview uses photographic-style product assets and cinematic generated
VFX, **not SVG icons or emoji gift substitutes**. The car translates into frame,
heart pulses, dragon floats in, fireworks bloom, and the other gifts reveal with
restrained spark accents. These are animated image compositions; they are not
articulated 3D video, recorded product footage or a ready-made commercial SVGA pack.

Future fully articulated dragon wings, moving car wheels and frame-by-frame flame
simulation need separately authored transparent video/SVGA/Lottie sequences.
No such files were supplied, and they are not claimed to exist. Current generated
art is included in the change; no external asset subscription is needed.

## Validation

- `node node_modules/vitest/vitest.mjs run src/lib/voice src/components/voice`
  from `apps/web`: **228 passed, 9 skipped** (the database integration fixture is
  not configured). Includes real AudioSession lifecycle/microphone-preservation
  tests with SDK mocks, permissions, receipts, schemas, bounded queues, and retry
  deduplication after deletion.
- `node node_modules/@playwright/test/cli.js test --config playwright.voice-effects.config.ts`:
  **3 passed**: two isolated viewers share real fixture HTTP state; checks ordered crown/car/rose
  delivery, one overlay, synchronized hearts, no replay on reload, 320/390/1440px
  overflow, real image decoding, radio selection, keyboard Escape and light mode.
- The second browser test runs an actual WebAudio graph to a live MediaStream
  destination while the dragon displays, records rendered sample advancement,
  checks microphone/chat/seat control hit tests and captures 120 frame intervals.
  This proves local audio rendering continues. Local RTCPeerConnection gathered
  no ICE candidates in this environment, so it does not prove network audio.
- Release validation: the full web production build, including TypeScript and
  static page generation, passes after rebuilding the existing world-map-core and
  MapLibre adapter packages. The earlier population type error was stale local
  build output; no map source or game logic was changed. Full workspace lint and
  `git diff --check` pass (two pre-existing lint warnings remain).
- Desktop/mobile browser images, audio/frame metrics, dialog accessibility audit,
  200% text sizing and the local recording are under
  [visual evidence](../visual-evidence/voice-effects/).

Production LiveKit delivery, real microphone acoustics, physical-device GPU/battery,
restricted NATs and a real database transaction integration run remain unverified.
The user authorized GitHub upload and production deployment on 25 October 2026.
Release uses the existing main-branch CI gate and Vercel project. No new database
migration, hosting configuration, package version or map logic is introduced.
Standalone voice effects tests now run explicitly in CI and are excluded from
the default authenticated-browser suite.

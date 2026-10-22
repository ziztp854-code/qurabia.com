# Tahaddi Live — reference and dependency audit

Reviewed 2026-10-22. Scope: the user-supplied composite image and six requested GitHub repositories. This report does not authorize production deployment, replace existing services, or claim visual acceptance.

## Reference interpretation

The image shown in the conversation is a 1536 × 1024 composite: five phone mockups above one wide desktop strip. The phone interiors are approximately 270–320 pixels wide in that displayed composite; these are presentation mockups, not CSS viewports. The desktop strip is approximately 1530 × 380 (about 4:1), rather than the requested 16:9 target. Adapt its column relationships to 1440 × 900 and 1920 × 1080; do not stretch the strip.

The original PNG mentioned at `D:/UserData/Downloads/…` was not available as a local attachment during this audit. Only the pasted request was present under `/workspace/attachments/`. The following values are **visual estimates from the displayed reference, not pixel samples or extracted font metadata**. A numerical comparison against an unavailable original would be unsupported.

| Role | Estimated reference treatment | Implementation guidance |
| --- | --- | --- |
| Canvas | Blue-black, approximately `#030b12` | Scope existing voice tokens; leave other games alone |
| Raised cards | Approximately `#101820`, with subdued cool borders | Opaque surfaces, restrained transparency in overlays |
| Primary gold | Approximately `#e6bd72` → `#b68b48` | Short vertical button gradient; dark text |
| Text | Near white; secondary cool gray | Retain readable Arabic and measured contrast |
| Live / competition | Pink-red approximately `#f42b58`; bright blue opponent score | State labels accompany color |
| Voice accent | Purple approximately `#a44cec` | Active avatar ring, gift effects; avoid purple canvas |
| Fine border | Muted gold, about 1 CSS pixel | Gold mainly on selected elements and identity |
| Radius | Cards about 10–14px; buttons 14–20px or pill | Reuse scoped tokens rather than per-component values |
| Spacing | Approximately 8px rhythm, 12–16px page gutters | Maintain at least 44px touch targets even if mockup icons look smaller |
| Arabic type | Compact sans, mostly 12–16px, headings 18–24px at phone scale | Exact family is not identifiable; retain local Cairo/Alexandria |

Reference composition by surface:

- **Sign-in:** full-height navy stage, large central crown and title, warm spotlights/crowd below, gold primary sign-in button, outlined account action, three provider buttons. Preserve real provider availability and existing authentication behavior.
- **Discovery:** compact branded top bar, three text tabs, wide weekly tournament banner, horizontal category pills, two-column image cards with live pill and audience overlay, fixed bottom navigation. Actual room data remains authoritative; do not invent tournament prizes or audience counts as real data.
- **Voice room:** small host/audience header, short ranking chips, prominent crowned host avatar, three columns of small circular participants/empty seats, translucent chat below, compact bottom deck. The screenshot shows one featured host plus a nine-cell lower grid (six occupied and three empty); the written requirement asks for nine seats. Keep actual room capacity and permissions authoritative rather than infer new backend capacity from the illustration.
- **Duel:** two adjacent portrait crops fill the stage; top red/blue score bar and timer; transparent chat/gift overlay; hearts rise at the edge; composer and gift/share controls sit below. Do not fabricate server scoring, timer authority, or duel availability.
- **Profile:** circular portrait with thin gold glow, verified badge, three statistic columns, full-width gold follow control, short bio, three gallery tabs, three-column media grid. Verification and statistics must come from existing data.
- **Desktop:** physical column order in the reference is sidebar at left, broadcast and participant grid in the center, chat to their right, suggestions at far right. Each column's Arabic content remains RTL. A thin global search/header runs above; controls sit below the broadcast. At narrower widths prioritize the stage and chat without clipping controls.

Reuse the existing `apps/web/tokens.css` voice token namespace, React components, `live-room-*.module.css`, chat/emoji/gift primitives, and viewport handling. The pre-task palette used purple-black voice surfaces; a scoped blue-black correction brings it closer to this reference without recoloring the rest of Tahaddi.

## GitHub verification

All six canonical GitHub repositories were reachable through the GitHub REST API. Metadata, complete repository trees, package manifests and license endpoints were inspected read-only; selected interaction source files were read. No installers, project scripts, or downloaded application code were executed. No code or assets were copied into Tahaddi, and no dependency was added as part of this audit.

| Repository / reviewed commit | License evidence | Stack and compatibility | Reference decision |
| --- | --- | --- | --- |
| [ChatCN](https://github.com/leonickson1/chatcn/tree/a7be5c3aedebed3441594ce8f532acc168c1628c) `a7be5c3` | [MIT LICENSE](https://github.com/leonickson1/chatcn/blob/a7be5c3aedebed3441594ce8f532acc168c1628c/LICENSE) | Next 16.2, React 19.2, Base UI, shadcn, Tailwind 4; broadly similar runtime, different component styling | Reference message grouping, scroll/unseen state, composition; preserve Tahaddi CSS and chat transport |
| [Semaphore Chat](https://github.com/semaphore-chat/semaphore-chat/tree/42af8b418ce97fcc6f7c0c7ac0c6396c7a3ad7c5) `42af8b4` | [AGPL-3.0 LICENSE.md](https://github.com/semaphore-chat/semaphore-chat/blob/42af8b418ce97fcc6f7c0c7ac0c6396c7a3ad7c5/LICENSE.md); repository also includes commercial license files | React 19.3/MUI/Vite, LiveKit 2.22.3, Nest 12, Socket.IO 4.8; concepts fit, full stack replacement does not | Observe connection/voice UI concepts only; no direct source reuse or new licensing obligations introduced |
| [LiveKit Livestream](https://github.com/livekit-examples/livestream/tree/f8926732520f16a130f2ae40c58c2bb4601ff280) `f892673` | GitHub metadata `license: null`; `/license` returned 404; recursive tree contained no license file | Next 14, React 18, LiveKit client 1.15 and components 1.4; major-version mismatch with installed client 2.23 | Reference broadcast/chat separation and submit-time send; no copying without clarified license |
| [VideoSDK HLS example](https://github.com/videosdk-live/videosdk-hls-react-sdk-example/tree/d91ad09d79d2b0ed64a0e90c833c30df0e2efb0a) `d91ad09` | GitHub metadata `license: null`; `/license` returned 404; recursive tree contained no license file | CRA/react-scripts 5, React 18, VideoSDK 1.1.1 and hls.js; separate transport/provider | Reference audience/chat panel organization only; do not add SDK or copy code |
| [Cord](https://github.com/SpacePalm/cord/tree/94da876274f39dfaa8db82592099025f86d84217) `94da876` | [MIT LICENSE](https://github.com/SpacePalm/cord/blob/94da876274f39dfaa8db82592099025f86d84217/LICENSE) | React 18/Vite, LiveKit 2.9, React Query, Zustand; root is not an npm app, frontend manifest lives below `frontend/` | Reference participant/presence and voice-state presentation; keep existing Tahaddi state/provider |
| [Quetalcast](https://github.com/ktallp/quetalcast/tree/b85c44f5b3a7e2b981e6c96e770070b83df74769) `b85c44f` | [MIT LICENSE](https://github.com/ktallp/quetalcast/blob/b85c44f5b3a7e2b981e6c96e770070b83df74769/LICENSE) | React 18/Vite, Radix, Tailwind 3, Node/WebRTC backend; cannot replace LiveKit without architectural change | Reference persistent transport controls, explicit mute state, and accessible toggle labels |

Observed last-push metadata respectively: 2026-04-03, 2026-10-21, 2026-02-28, 2026-08-26, 2026-10-15, and 2026-09-13. None was marked archived. These timestamps indicate repository activity, not security assurance or compatibility testing. Dependencies/transitive packages were not installed or audited because integration was unnecessary. The VideoSDK manifest includes a destructive `kill-start` helper; it was inspected as text and never executed.

Selected source inspected at the pinned revisions:

- ChatCN: `src/components/ui/chat/hooks.ts` (local typing, message grouping, unseen/scroll state).
- Semaphore: `frontend/src/components/DirectMessage/DMVoiceControls.tsx` (existing voice connection hook and call controls).
- LiveKit: `src/components/chat.tsx` (local draft state, `useChat`, explicit send action).
- VideoSDK: `src/components/sidebar/ChatPanel.js` (local composer draft and chat messages).
- Cord: `frontend/src/components/voice/VoiceRoom.tsx` (connection state, local participant controls and volume/presence UI).
- Quetalcast: `src/components/broadcast/TransportBar.tsx` (persistent controls and `aria-pressed` mute state).

The current project already has React 19, Next 16, LiveKit client 2.23, Socket.IO 4.8, local Arabic fonts, chat, emoji, gift, permission, and voice lifecycle components. No missing runtime capability demonstrated a need to import these applications. Design concepts are implemented using the project's own components. If direct MIT code reuse is proposed later, retain the relevant copyright/license notice and record the exact file and commit; this report records **zero direct code reuse**.

## Comparison limits and acceptance evidence

Do not compare a single rendered route directly with the entire composite: device frames, multiple unrelated screens, and aspect ratios would dominate pixel difference/SSIM. A valid reference comparison requires the original image, one cropped screen content region, matched viewport/state and documented scaling. Use visual review now and record numerical reference comparison as unavailable unless those inputs become available. Before/after regression screenshots of the same fixture are still valid evidence of the changes, but are not proof of reference fidelity or live production behavior.

Retain screenshots at 390 × 844, 430 × 932, 1080 × 1920, 1440 × 900, 1920 × 1080 and a documented 16:9 viewport, with route, fixture state, browser, DPR, and zoom. Verify actual authentication/room behavior separately from fixture presentation; never label mocked audio as a real end-to-end voice connection. Exact portrait assets, crown illustration, font metadata, duel availability and real external provider credentials remain constraints to disclose where applicable.

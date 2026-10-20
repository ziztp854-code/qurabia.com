# Tahaddi community/voice QA risk matrix

Reviewer: independent Codex child quality_review. Scope: requested new social profiles, appearance, badge/admin and voice-room surfaces; existing quiz/game behavior must remain unchanged.

| Priority | Boundary / journey | Required evidence |
|---|---|---|
| P1 | Cookie-auth mutation | Anonymous, stale/suspended identity, cross-origin and null-origin POST/PATCH rejected before writes. JSON/body bounds checked. |
| P1 | Display badges vs authority | User badge/category cannot grant real role. Sensitive administrative catalog create/edit/grant/revoke require owner authority. |
| P1 | Privacy/IDOR | Numeric profile lookup respects PUBLIC/MEMBERS/PRIVATE; server emits DTO allowlist, omits email/hash/session/internal account fields and hidden collection/rooms. |
| P1 | Appearance activation | Foreign/expired/revoked/archived cosmetics cannot activate; primary badge and linked frame/effect ownership recomputed on reads and after revoke. |
| P1 | Voice signaling | Server membership/seat controls each signal; sender spoof rejected; recipient-only delivery; bounded valid SDP/ICE; muted/listener publishing rejected. |
| P1 | Moderation | Owner/mod checks server-side for approve/mute/remove/block/close; mod cannot elevate self or target owner; blocked reconnect rejected. |
| P1 | Concurrency | Atomic version/transaction guard prevents duplicate seats, lost chat/signals, simultaneous capacity bypass; 6 speaking /24 membership cap. |
| P1 | Media cleanup | Seat revoke, forced mute, leave, room close, auth error and unmount stop tracks/peers/context/timers; no automatic mic activation without gesture. |
| P2 | Reconnect / events | Stable entrance ID, no stale effect replay, bounded effect queue/TTL; heartbeat expiry prunes ghosts and signaling. |
| P2 | Privacy in room identity | Safe public room identity only; cosmetics are read server-side and refreshed after change/revoke. |
| P2 | XSS / uploads | Text escaped, URLs/asset content validated, no HTML/SVG injection or arbitrary remote effect execution. |
| P2 | Mobile / a11y | RTL, 320px no new overflow, touch 44px, focus and labels, copy feedback, reduced motion, nonblocking entry overlay. |
| P2 | Availability / NAT | Production Redis rate-limit requirement documented; mesh room/speaker bound; TURN configuration and real-browser NAT limitations disclosed. |
| P2 | Migration integrity | Existing numeric IDs/internal relations preserved; additive tables/columns+indexes; no user data reset; schema validate/generate. |
| P3 | Performance / assets | Baseline/after fixture requests and DOM animation behavior recorded; no blocking assets before join; no unbounded poll fanout/buffers. |

Initial architecture: Next.js web routes, latest server session/database revalidation helpers, existing quiz/live Socket.IO separate Nest backend. No existing voice/WebRTC implementation found in parent audit. Existing Profile provides name/bio/avatar locale/timezone; accountNumber change already pending. Existing distributed checkRateLimit fails closed in production without configured Redis; do not treat missing config as a functional deployment.

Test limitations: device emulation is not physical iPhone/Android testing; Chromium does not establish Safari/Edge media behavior. No production deployment authorized.

## Independent findings and fixes during implementation

- Fixed: SDP browser/server parser differential. Real Chromium accepted session-only recvonly/inactive as sendrecv, and media suffixes `sendrecv:ignored` / `sendrecv ignored` as publishing. Voice engine now requires explicit canonical media directions for nonpublishers and rejects ambiguous/malformed direction lines. Six QA engine cases (including protected-host seat approval) are regression tests.
- Fixed: room moderator could force-mute/reposition protected host via approve-seat although direct mute denied. Target authority and request-seat checks added.
- Fixed: nested global identity lookup while holding voice room transaction could starve max5 Prisma pool under concurrent heartbeats. Community resolver now accepts same transaction client; backend threads tx through.
- Fixed: appearance-only first profile creation replaced OAuth user's existing name with generic label. Transaction create fallback now preserves user.name.
- Fixed: private-target unfollow was denied after target privacy change. Own relation deletion now independent of public profile visibility.
- Fixed: raster upload validation previously accepted truncated magic-only PNG. Complete structure/dimensions and WebP dimensions now bounded by validator.
- In progress: signaling transport order/HTTP failure handling and reentrant mesh processing; parent/voice UI informed.
- In progress: embedded data-URI assets duplicated in room identity snapshots can inflate heartbeat bandwidth; data agent informed for bounded projection/cacheable asset references.

Executed so far: five files /30 tests passed including community service+validation and independent QA tests. Browser parser experiments used local headless Chromium only, no microphone capture/network peer established; these prove SDP negotiation interpretation, not real-device audio quality.

## Final independent presentation review

- Real production components exercised in opt-in Vite fixture at127.0.0.1:3331; synthetic profile/admin/room DTOs, API mocks, full global CSS/tokens/local fonts. This establishes presentation and fixture interaction behavior only.
- Viewports:1280x900,390x900,320x900,DPR1, Chromium. All profile/appearance/admin/voice surfaces had scrollWidth==viewportWidth. Appearance and voice also passed320px+200%roottext layout check.
- Axe:0 violations for profile/appearance/admin at390px;0for voice base view; one modal-only generic-span aria-label issue was fixed and final dialog also has0violations.
- All visible button/link/input/select targets had44pxminimum except native18pxcheckboxes whose surrounding clickable labels exceeded44pxheight.
- Clipboard copied exact123456789 with live feedback; profile tabs changed state; appearance display name preview updated before save; forced403save displayed denial rather than success. Voice fixture opened member card, Escape closed it, and chat text appeared after fixture command.
- Fixed after independent visual inspection: entrance card previously obscured lower seat labels; now it has a dedicated rail between seats and controls. Initial chat auto-scroll previously jumped document to chat on mobile; now initial scrollY is0at all checked widths. Entrance overlay pointer-events:none; reduced-motion disables animations.
- Final voice screenshots visually inspected after fixes: voice-final-1280.png,voice-final-390.png. Profile390,appearance1280,admin390 also visually inspected. No presentation blocker in exercised states.
- Internal presentation score for these isolated states only: composition19/20 (long mobile scroll), color14/15 (animated/composited states not exhaustively contrast-sampled), typography14/15 (dense administrative forms), assets20/20 (CSS/vector artwork and intended initial-avatar fallback; no new encoded-image quality claims), responsive15/15, usability14/15 (physical-device touch/media behavior unverified). Total96/100. This subjective score is NOT functional audio, privacy/persistence, physical-device, Safari/Edge or production acceptance.
- Before/after comparison evidence: community-before-{1280,390,320}.png vs community-profile-{1280,390,320}.png. Voice is a new surface with no pre-existing voice page; earlier voice-*.png vs voice-final-*.png show refinement corrections.
- Additional final evidence: community-appearance-final-{1280,390}.png,voice-member-dialog-final-390.png,community-appearance-text200-320.png,voice-text200-320.png.
- Independent QA tests:18 tests passed across entrance-queue.qa, schema.qa, engine.qa and http.qa. Targeted lint for these new test files passed. A test-only HTTP headers TypeScript union was corrected after backend tsc review; parent owns final broad checks.
- Remaining full acceptance: parent real authenticated browser/RTC flow, NAT/TURN across networks, physical iPhone/Android, Safari/Edge, and production configuration. No deployment authorized/performed by reviewer.

# Tahaddi Live acceptance record

Scope: the new `/voice` experience on branch `feat/tahaddi-live-platform`. This record separates implemented behavior from evidence; a successful build is not visual or audio acceptance. Existing games, subscriptions, payments, and production data are outside this change.

Follow-up: [persistent microphone during games](persistent-voice.md). Ten React route-fixture tests now cover persistence, controls, background revocation and explicit switching; actual browser/game/microphone acceptance remains unverified. The app document microphone policy now intentionally allows same-origin capture for cross-route audio; the isolated farm iframe still denies it.

## Evidence status

Independent QA reviewer: the `voice_qa` agent. Applied repository testing/security guidance and the Art Director / Visual QA role. The referenced `.claude/skills/review-changes` directory is absent in this checkout; repository rules and targeted source review apply.

| Acceptance area | Required evidence | Current status |
| --- | --- | --- |
| Public discovery | Persisted room data, truthful empty state and counters; filters/search; no invented production activity | API data paths verified; rendered discovery/filters unverified |
| Account reuse | Existing NextAuth credentials/session; revoked or suspended account denied | Passed real-auth local HTTP integration checks |
| Room persistence | Create/update/join/leave through production API; server restart preserves settings | Create/update/join/close persisted and verified in separate HTTP clients; restart durability not separately exercised |
| Private rooms | No discovery leak; invalid password/invite denied; invitation authorizes only intended scope; secrets absent from responses | Passed real-auth local HTTP integration checks |
| Role enforcement | Listener cannot assign roles/seats, remove users, moderate messages or close room; moderator obeys granted scope | Passed real-auth local HTTP integration checks |
| Concurrent seats | Competing assignments cannot place two users in one seat or duplicate a user | Passed real-auth local HTTP integration checks |
| Chat | Cross-client updates without reload, reply/reaction/pin/delete authorization; disabled chat and rate limits | API state/update reads passed; 2.5s client polling and browser exercise unverified |
| Media security | Listener cannot publish; demotion/removal/mute changes enforced by SFU, including already-issued tokens | Source reviewed: mandatory signaling gateway, signed JWT exchange with current membership/account checks, and serialized SFU refresh; actual SFU smoke evidence is separate |
| Microphone/audio | Two physical devices, different networks, real microphones; bidirectional speech, mute and departure | Unverified; not interchangeable with synthetic/local audio |
| Recovery | Disconnect/rejoin, microphone denial/device change; no duplicate media session; stale membership cleaned | Source reviewed; physical device/reconnect exercise unverified |
| RTL/accessibility | Keyboard/focus/names, joined Arabic, mixed numbers, reduced motion, 44px controls, 200% text zoom | Unverified in a browser |
| Responsive appearance | Real desktop, mobile and 320px evidence, no page overflow or clipping; all images decoded/fonts loaded | Unverified in a browser |
| Upload privacy/safety | Authentication, origin, size/type/signature validation, authorized asset delivery, durable file storage | Passed actual raster upload/decode/type/size/private-access/ownership API checks |

## Local API verification

Use only an explicitly isolated PostgreSQL database named `voice_test` or `voice_test_<suffix>` on loopback. Never point tests at production or an existing shared database. Test accounts use random `@example.test` identifiers; cleanup deletes only IDs created by the test. No destructive global reset or fixture-as-production route is permitted.

The API test plan uses Playwright's HTTP request context and the real NextAuth CSRF/credentials endpoints. It does not launch or control a browser. Tests verify response headers and server state, not just the absence of UI buttons. The isolated test server must receive the same database URL as the test process. A clean skip for a missing test database is **not** a passing integration test.

Covered assertions and remaining protocol exercises:

1. Anonymous mutations fail; a foreign/missing Origin cannot mutate. Invalid JSON, unexpected fields, oversize payloads and unsafe cover URLs fail.
2. Host creates a real room, joins, updates its settings and reads the same persisted settings in a separate request context. Closing prevents fresh joins.
3. Listener cannot approve a seat, promote self, remove the host, pin/delete another person's message or close the room. Host/moderator cannot force another participant to unmute.
4. A private room is excluded from discovery and denies access/message read before successful password/invitation admission. Password hashes, invitation hashes and media signing secrets never appear in JSON.
5. Listener requests and host approves a seat. Two simultaneous seat assignments produce one winner. Locked/out-of-range seats are denied. Leaving a seat revokes publishing capability.
6. Messages are text data, tied to the current actor, rate limited and hidden from outsiders. Disabled chat rejects messages. A removed/banned user cannot send or rejoin.
7. Personal favorites/history/preferences persist and remain private to that account. Session revocation takes effect on subsequent requests.
8. A media configuration failure returns an actionable unavailable state rather than a token or a false connected status. Listener media grants cannot publish audio. SFU failure during demotion/mute must fail safely.

## Commands and actual results

QA ran only against the dedicated local `voice_test_qa` database using the standard local PostgreSQL container. No production database, remote API, deployment or GitHub write was used.

```sh
# The Prisma helper does not read .env/.env.local and rejects non-test/non-loopback URLs.
VOICE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/voice_test_qa \
  pnpm exec prisma migrate deploy --config scripts/voice-qa-prisma.config.ts
# HTTP requests only; no browser fixture is used.
VOICE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/voice_test_qa \
  pnpm --filter @tahaddi/web exec playwright test --config ../../scripts/voice-qa-api.config.ts --reporter=line
```

- All 28 migrations applied to the isolated database, including the new VoiceRoom/VoicePreference/VoiceReport/VoiceCover migration.
- All **6 HTTP integration tests passed in 30.2 seconds** after updating the test cover preset and fixing the upload advisory-lock query's PostgreSQL `void` decoding problem.
- Added a member token-version revocation check after the full run: its affected favorites/history test passed again in **10.0 seconds**. A host heartbeat removes the revoked member, updates the participant count and does not expose internal token-version fields.
- Added a real sixth-create-request rate-limit assertion: the affected authentication test passed again in **11.9 seconds**, including HTTP 429 and revoked-session rejection.
- Test discovery listed six tests; targeted ESLint and `git diff --check` passed. Parent-owned engineering checks are recorded in the main implementation report.
- The tests create random real accounts, sign in through existing NextAuth credentials and clean up only their own account/room IDs. HTTP assertion failures do not generate design screenshots.

Independent review identified and coordinated corrections for media token replay/reconciliation ordering/account revocation, invitation fragment parsing, generic seat-request `-1` handling, report input minimum mismatch and pending media-sync feedback. The final frontend source contains the fragment capture helper, valid-seat fallback, report minimum of five characters and persistent media-sync warning. These source checks do not prove rendered/browser behavior.

## Independent signaling-gateway follow-up

The earlier deny-all-token/webhook admission strategy was replaced after provider testing demonstrated that it did not establish usable native transport, and raw OSS SFU JWT replay remained possible after removal. Current tokens carry current media grants and immutable session-version metadata. **They are safe only behind the mandatory app admission gateway while the upstream SFU signaling endpoint is inaccessible to clients.**

Reviewed `admission.ts`, `/api/voice/admit`, the default HTTP/WebSocket proxy and media configuration:

- The server-to-server exchange authenticates an explicit JWT bearer, verifies its signature/expiry and scoped room, checks current active account/session version, and reads current membership/role under the shared room advisory lock. Ambient application cookies do not authorize this endpoint.
- The gateway rechecks each initial/resumed signaling handshake; replaces both query and Authorization bearers with the exchanged current token; removes duplicate token query parameters and cookies; accepts only GET `/rtc` paths; and does not expose SFU administration endpoints.
- Missing internal/public media configuration, an insecure non-loopback URL or an identical internal/public origin fails configuration. Different origins alone do **not** prove private signaling: firewall/network isolation is an external deployment requirement. A publicly reachable LiveKit Cloud or self-hosted upstream would permit gateway bypass; use private self-hosted signaling or independently verified provider admission/revocation controls.
- Permission RPCs use bounded timeouts, disable cloud failover and settle all parallel operations before releasing the shared lock. SFU failures remain visible as pending synchronization rather than successful hard enforcement.
- Admission is a point-in-time decision. A concurrent moderation change after admission but before an upstream connection establishes can require the signed join webhook to reconcile rights. Do not claim zero-window revocation. Request-driven reconciliation also does not prove autonomous idle-session cleanup.

Added `scripts/voice-qa-gateway.test.mjs`, an independent loopback-only HTTP integration test using the **default real admission HTTP exchange**, without a custom admission mock. It passed in **137.7 ms**. It verifies missing bearer rejection before admission; propagation of 401/403/429; fail-closed 503 on upstream admission 500, malformed JSON, missing token and redirect; no SFU request during failures; and replacement of duplicate stale query/header tokens without forwarding cookies on success. This is not an actual SFU or browser test.

```sh
node --test scripts/voice-qa-gateway.test.mjs
```

Parent-owned gateway WebSocket/native-media and JWT unit checks are separate evidence; their scope and provider replay limitation are recorded in `audio-local.md`. No physical-device, browser, autoplay, TURN or rendered-design acceptance follows from these HTTP checks.

## Required browser evidence

No supported browser-control or CUA tool was exposed to the QA agent's tool inventory. The browser skill's boundary forbids substituting standalone Playwright/browser automation. API-only checks remain possible. No real screenshots were captured by this agent and none should be inferred from static assets, generated images or build output.

Capture with supported browser tooling when available, using production components and clearly labelled local test accounts/rooms:

| Image | Suggested viewport | State |
| --- | --- | --- |
| Home desktop | 1440 × 1000, DPR 1 | Discovery with real local room data |
| Home mobile | 390 × 844, DPR 1 | Mobile navigation and categories |
| Room desktop | 1440 × 1000, DPR 1 | Host, speaker, listeners and media status |
| Room mobile | 390 × 844, DPR 1 | Seats, controls and safe area |
| Create desktop/mobile | Matching dimensions above | Open dialog, keyboard focus and validation |
| Active speaker | Desktop/mobile as relevant | Real incoming audio drives the indicator |
| Open chat | Desktop/mobile as relevant | Live message, reply and moderator controls |
| Narrow layout | 320 × 740, DPR 1 | No body overflow or clipped essential controls |

Record revision, route, viewport, DPR, zoom, browser, fixture/data scope, before/after image paths, asset dimensions/bytes and measured contrast. Review actual rendered pixels, not token colors alone. Verify 200% text zoom, keyboard/Escape/focus restoration, reduced motion, long Arabic labels, network errors, empty/loading states and image decode.

Art Director score: **unverified**. Composition /20, color /15, typography /15, assets /20, responsiveness /15 and usability/accessibility /15 cannot be responsibly awarded without rendered evidence. Missing required browser evidence blocks final visual acceptance under `docs/visual-excellence.md`.

## Physical audio procedure

1. Configure an authorized local/staging LiveKit SFU, reachable signaling/TURN, HTTPS and server-side credentials. Keep signing secrets out of browser payloads and logs.
2. Device A joins as host using a real microphone; device B joins through a different network as listener. Confirm B hears A and cannot publish before approval.
3. B requests a seat, A approves; verify actual speech both ways. Record device/browser/network and observed latency/quality, without recording private audio by default.
4. Test self-mute/unmute, host mute, demotion, removal and departure. Confirm audio ceases on the remote device even if the removed client keeps its media SDK connected or reuses an old token.
5. Disable/re-enable network; switch microphone/headset; deny permission; open a competing tab; leave and reopen. Verify bounded reconnect, actionable errors and microphone capture cleanup.
6. Exercise a TURN-only/UDP-blocked network. An SFU startup or synthetic one-machine test does not prove cross-network voice.

The user explicitly requires no claim of working voice before a real two-device test. Until that evidence exists, report audio as **implemented/integrated but unverified**, with any configuration prerequisites.

## Release boundary

This is a local review candidate. The user explicitly forbids pushing, merging or deployment without permission. No release approval is implied by local test success. No new payment, currency, subscription or recording behavior is authorized.

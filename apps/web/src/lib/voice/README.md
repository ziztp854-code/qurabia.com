# Voice rooms

Voice is a separate feature at `/voice`; quiz and game transports remain unchanged.

The browser uses a bounded audio-only WebRTC mesh (six seats, twenty-four total
participants). Authenticated, same-origin JSON commands transport SDP and ICE
through `/api/voice/[roomId]`; the 1.2-second heartbeat returns recipient-only
signals and trusted entrance events. Audio packets go directly between peers or
through the configured TURN relay, never through the JSON polling endpoint.

PostgreSQL row locks serialize room state across web instances. Memberships expire
after 45 seconds without heartbeat. A reconnect retains the member ID; a new tab
replaces its connection epoch and invalidates the old tab. Recent entrance IDs
are retained to avoid effects on reconnect or rapid leave/rejoin. A monotonic
signal cursor avoids timestamp races. State buffers and per-member chat, reaction,
and signaling rates are bounded. Room creation is limited to one open room per
owner and three rooms per hour with a user-row lock.

All operations revalidate the current database account status and token version.
Polling also removes revoked sessions. Join/heartbeat resolves the current actor's
badges and cosmetics using the same transaction client, avoiding pool deadlock or
quadratic entitlement queries. Display badges never confer actual permissions.

Only approved seats may publish audio. A listener can initiate a receive-only offer
to a seated participant so negotiation ownership remains stable as seats change.
Muted seats and listener offers or answers require an
explicit media-level receive-only or inactive SDP direction. Non-audio, ambiguous
direction attributes, oversized SDP/candidates, unsolicited answers, and signals
outside an existing negotiation are rejected. Browser receivers must additionally
disable tracks for peers who become muted, leave seats, or change connection epoch.
This mesh enforcement cannot provide the transport-level publishing revocation
of an SFU; the feature is deliberately capacity-limited and should move to an SFU
before raising the six-seat or twenty-four-member limits.

## Connectivity

Microphone capture requires HTTPS (localhost is allowed by browsers) and an
explicit user action. Denying capture leaves room chat and listening available.
`Permissions-Policy` must allow `microphone=(self)` only on `/voice` routes.

Public Cloudflare STUN is the default. Configure `VOICE_STUN_URLS` with a
comma-separated list to replace it. STUN alone cannot connect every NAT/firewall.
For production relay coverage configure:

- `VOICE_TURN_URLS`: comma-separated `turn:`/`turns:` URLs, optionally
  `?transport=udp` or `?transport=tcp`.
- `VOICE_TURN_SHARED_SECRET`: coTURN REST authentication shared secret.

Authorized participants receive HMAC-signed credentials expiring after ten minutes.
The shared secret never reaches clients. Configure the relay for matching REST
authentication and TLS, then test real devices, restricted NATs, long sessions,
autoplay restrictions, microphone interruption and reconnection. Local browser
fixtures do not establish real-device audio quality or SFU-scale performance.

## Validation

`vitest run src/lib/voice src/app/api/voice` runs engine, input, HTTP and relay
credential tests. The community integration suite exercises migration and real
PostgreSQL room mutations with isolated test accounts.

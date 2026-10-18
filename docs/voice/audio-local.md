# Local SFU audio verification

The audio UI uses `livekit-client` with a microphone-only server grant, one active
audio session per browser, and cleanup on exit. No application audio is recorded.
Microphone capture requests echo cancellation, noise suppression and automatic gain
control; browser/device support determines the result. Device selectors are shown
only where supported. Speaking indicators use SFU active-speaker events.

## Service boundary

`LIVEKIT_URL` is the public admission gateway; `LIVEKIT_INTERNAL_URL` is the
private SFU. Both must be configured and their origins must differ. The browser
must never reach the private signaling endpoint. Room administration uses the
internal address. The gateway must validate **every** initial or resumed signaling
connection against current app membership, room role, account status and session
version before exchanging its token. Signature validation alone is insufficient.

JWTs expire after 60 seconds and contain immutable session-version metadata.
The SFU can refresh tokens during an established session; the gateway must apply
current admission to those refreshed tokens too. Signed join webhooks and
request-driven permission reconciliation provide additional checks. Room media
reconciliation takes a PostgreSQL advisory transaction lock, reads fresh complete
membership, and applies bounded SFU RPCs before releasing the lock. Microphone
publication is revoked and published microphones are muted on moderator mute or
demotion. Removed/expired members are disconnected.

A raw OSS LiveKit server is **not** a replacement for the admission gateway.
Local verification with OSS 1.13.10 demonstrated that `moveParticipant` returns
`not implemented`, and a successful `removeParticipant(revokeTokenTs)` does not
reject replay of the old JWT. The private signaling port must therefore remain
inaccessible to clients. Do not infer token revocation from a successful removal
RPC or infer transport readiness from a token that denies both publication and
subscription: the latter prevented the native client's transport from connecting.

Webhooks alone do not provide zero-window admission, and reconciliation is driven
by requests rather than an autonomous presence worker. A production deployment
must preserve the private gateway boundary, configure the signed webhook, provide
monitoring and check idle-session enforcement. No paid provider is required for
local review.

## Generated-audio smoke test

`scripts/voice-sfu-smoke.py` deliberately connects to the **private loopback SFU**,
using administrator-controlled test credentials, to test the provider's actual
media behavior independently of app authentication. It accepts no remote host,
creates a temporary isolated room, publishes generated 440 Hz and 660 Hz PCM from
two native WebRTC clients, consumes decoded remote PCM and reports frame counts,
RMS and dominant frequency. It checks microphone mute/unmute, listener publication
denial and leave cleanup. It also records the raw provider's JWT-replay limitation;
that diagnostic is not counted as a passed gateway test. All tracks/rooms close in
cleanup. It does not record a real user. A generated remote-audio WAV sample is saved only
when the test-only `VOICE_TEST_AUDIO_SAMPLE` variable is explicitly set.

Use a temporary virtual environment outside the repository:

```sh
python3 -m venv /tmp/tahaddi-voice-test-venv
/tmp/tahaddi-voice-test-venv/bin/pip install livekit==1.0.25 livekit-api==1.1.0 numpy
# Load your local LIVEKIT_* variables without printing the credentials.
/tmp/tahaddi-voice-test-venv/bin/python scripts/voice-sfu-smoke.py /tmp/voice-sfu-result.json
```

The native SDK's WebSocket stack may apply an inherited outbound proxy even to
loopback. For this loopback-only test, run the process with proxy variables removed
if necessary. Keep the configured proxy and CA trust for all downloads and external
network traffic. The test rejects non-loopback SFU addresses.

## Gateway replay test fixture

`scripts/voice-sfu-fixture.mjs` starts the real signaling gateway on loopback 7891,
a signal observer on 7883 and an in-memory membership controller on 7892. This is
**test-only authorization**, separate from NextAuth/database admission. Start it
with the same local `LIVEKIT_INTERNAL_URL`, key and secret; then run:

```sh
VOICE_SFU_GATEWAY_TEST=1 /tmp/tahaddi-voice-test-venv/bin/python scripts/voice-sfu-smoke.py /tmp/voice-gateway-result.json
```

The fixture captures real SFU refresh tokens in memory without logging or saving
them. The verified run passed 11 checks (six media checks and five gateway replay or
session-version checks). The smoke test replays both the original publisher JWT and the actual
server-refreshed publisher JWT after a role change; both reconnect with current
listener permission. It removes membership and verifies both JWTs are rejected
before reaching the SFU, then changes the session version and verifies rejection
again. Stop the fixture when the test ends; its unauthenticated loopback control
endpoint and token observer must never be deployed or exposed to users. The
production gateway has no fixture control/observer and delegates admission to the
application's server-side route.

Observed local SFU binary: LiveKit 1.13.10, extracted from official image digest
`sha256:89ca9ce0791e18d6e03bf6e2c49ceb27e1c754eae8bd50c989386c1a5963791a`.
It runs as a local process rather than exposing an additional Docker signaling
port. Credentials and generated configuration stay in a mode-600 temporary file,
never in source control. The local preview can retain that intended service; stop
it when local review ends.

This evidence concerns generated sources on one machine. It does not establish
microphone quality, autoplay behavior, browser device switching, TURN reachability,
or successful audio between two physical users/devices on different networks.
Those checks remain a separate acceptance step.

## Current managed Linux review environment

The retained private SFU is a native Linux process, not a running Docker container.
Its mode-600 config and key file are outside the repository. Start or restart it
from the current review workspace with:

```sh
/tmp/tahaddi-voice-local/livekit-server --config /tmp/tahaddi-voice-local/livekit.yaml
```

Do not start a second process on the same ports. If restarting, stop only that
review process first. The binary comes from the pinned official image digest above.
The active signal listener binds `127.0.0.1:7880`; expose only the gateway to clients.
Start the production-path local gateway in a separate terminal with:

```sh
set -a
source /tmp/tahaddi-voice-local/session.env
set +a
VOICE_APP_ORIGIN=http://127.0.0.1:3000 node scripts/voice-signaling-gateway.mjs
```

The corresponding Next preview on port 3000 must load the same local environment
file. These temporary files are specific to this review machine and are not part
of the delivered source or the review archive. Provision fresh secrets on another
machine rather than copying credentials into the project.

# Chat transport audit — typing responsiveness

Baseline: `b78162f6a3314d1f9131a2d210220e15221cd036`. Scope: chat event dispatch, delivery ordering, duplicate listeners, message retention and draft safety. No production transport, audio, permission, rate-limit or timeout code was changed by this audit.

## Findings

- **Typing does not wait for a network round trip.** In the baseline `VoiceChat`, the textarea `onChange` calls `setText(e.target.value)` directly. `onEvent` is called by submit and explicit message actions, not by character changes. There is no chat typing-indicator event in this path and no per-character Socket.IO emit.
- **This room's chat uses HTTP writes plus LiveKit delivery, rather than Socket.IO chat events.** `VoiceRoomView.event` posts to `/api/voice/rooms/${roomId}/events`; the response supplies authoritative state. The server schedules notifications with `after()` in `notifications.ts`, and `livekit.ts:notifyVoiceRoomChanged` sends a reliable, server-origin message packet plus an invalidation packet. Polling recovers missed notifications.
- **The redundant work is local rendering.** In the baseline, `text` shares `VoiceChat` with `messages.map`, a participant-map allocation, per-message date formatting, avatars/member badges, and reply lookups. Each local draft change re-executes this history work. This is a rendering explanation, not evidence of network-induced input latency. Per-character room/provider renders must be established by the profiling agent rather than inferred.
- **Listener lifecycle is not tied to the draft.** `AudioSession` registers its data handler in the connection effect, whose dependencies are `roomId`, `participantId`, `retry`, and a stable microphone accessor. Callback changes update `callbacks.current` separately. Disposal calls `room.removeAllListeners()` and disconnects. A draft update cannot install another handler through this path. This is source inspection, not a live-SFU soak result.
- **Existing delivery integrity is retained.** `readVoiceLiveMessage` validates room, payload size and trusted fields; `AudioSession` rejects participant-origin data. `VoiceRoomView.receiveRoomMessage` filters blocked/stale/wrong-room packets and repeated IDs. `withLiveMessages` deduplicates IDs, sorts by `createdAt` then ID, caps displayed history at 200, and does not advance the authoritative permission cursor. Authoritative deletion/revocation is not overridden by stale deltas.
- **Stable list keys already exist:** message articles use `message.id`. There is no justification for changing IDs or order as part of the typing fix.
- **Virtualization is not the first corrective action.** Server `room-state.ts` and client merge both cap retained messages at 200. Isolating draft updates avoids doing all 200 rows on each keypress without introducing scroll anchoring, reply and accessibility risks. A separate measured case would be needed to justify virtualization after this change.
- **Rate limits remain server-side.** The schema trims text and enforces 1–1000 characters. `applyVoiceEvent` requires chat to be enabled, validates the reply target, and enforces a one-second per-user message interval (`SLOW_MODE`). `voiceRateLimit` retains the shared 40 writes / 120 reads per minute event limits. None is replaced or bypassed.
- **Acknowledgement semantics are preserved.** While a send is pending, the existing composer disables further typing/submission and retains the draft. A failed send retains the draft; only a successful acknowledgement clears it. The typing fix should preserve these semantics. The UI single-send check is not a claim of global exactly-once delivery after arbitrary timeout/retry: the server allocates a new message UUID for each request and has no client idempotency key in this contract.

## Regression checks

`apps/web/src/components/voice/voice-chat-transport.test.tsx` adds three focused checks:

1. Every one of 100 incremental character updates appears synchronously; no chat/typing event is dispatched.
2. Two send clicks while acknowledgement is pending dispatch once; repeated server delivery merges into one message; the draft clears only after acknowledgement.
3. Out-of-order/repeated live packets stay chronological, unique and bounded to 200 messages without advancing the authoritative cursor.

Status at audit handoff: **3 new checks prepared, not yet executed by this agent**. The primary agent owns their fresh execution with the affected voice suite after the browser measurements and production fix. This avoids duplicate runs and CPU contention; the central acceptance report will record the actual results.

## Evidence references

- `apps/web/src/components/voice/voice-chat.tsx`: textarea, submit, message list.
- `apps/web/src/components/voice/voice-room.tsx`: `event`, `receiveRoomMessage`, `apply`, heartbeat/refresh effects.
- `apps/web/src/components/voice/audio-session.tsx`: callbacks ref, connection effect, `DataReceived`, disposal.
- `apps/web/src/components/voice/voice-live-message.ts`: packet validation and `withLiveMessages`.
- `apps/web/src/app/api/voice/rooms/[roomId]/events/route.ts`: authenticated/rate-limited HTTP handlers; no SFU grant transaction for messages.
- `apps/web/src/lib/voice/{notifications,livekit,message-delivery,room-state,schemas,identity,repository}.ts`: scheduled trusted delivery, membership filters, retention, validation and limits.

This audit does not claim physical-device audio, real mobile keyboard, Safari or Android testing. Those belong to the independent QA report and must be distinguished from emulation.

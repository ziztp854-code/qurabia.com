# Native room audio

This implementation uses the existing authenticated POST
`/api/voice/rooms/{roomId}/token` and LiveKit SFU. It does not implement or
alter the separate legacy `/community-voice` mesh service.

## App integration

- Call `registerGlobals()` from `@livekit/react-native` at entry before any
  Room is constructed. Call `registerVoiceBackgroundTask()` once at entry.
- Create one `NativeVoiceSession(apiRequest)` above navigation.
- Feed every authoritative room membership to `updateParticipant(snapshot.me)`.
  A null member stops media immediately. Use `connect(roomId, snapshot.me)`
  only after successful room admission.
- The room hook owns join/leave/events/heartbeat REST, not the media controller.
  Keep the room heartbeat active while background audio is active: the server's
  presence TTL is 90 seconds. Expired or rejected membership must stop media;
  this controller never rejoins membership automatically.
- Capture starts muted. On explicit unmute, acknowledge the server's
  `{type:'mute',muted:false}` command first, feed the new member, then call
  `setMuted(false)`. On mute/leave/logout, stop local capture before network work.
- Subscribe chat to `subscribeData(payload,topic,senderIdentity)` and
  `subscribeReconnected()`. These methods take a callback and return unsubscribe.
  The chat parser must reject peer-origin authoritative messages.
- Unsubscribe root consumers and call `dispose()` only when the application
  session is destroyed, not when changing screens.

## Android build

Verified upstream released package versions: `@livekit/react-native 3.1.0`,
`@livekit/react-native-webrtc 150.1.0`, `livekit-client 2.23.0`,
`@livekit/react-native-expo-plugin 1.1.0`.
The RN SDK peer range accepts RN 0.86; actual Expo 57/RN 0.86 native compilation
and device compatibility require the project's CI and device run.

Configure the official Expo LiveKit plugin with Android communication audio,
then `./plugins/withVoiceAndroid.cjs`. The latter generates a private foreground
service, a HeadlessJS keepalive task, and a small RN bridge. It does not change
ReactHost or build/debug flags. The generic WebRTC config plugin is unnecessary
for this Android audio-only setup; its camera and overlay permissions are removed
from the merged manifest by this plugin.

Listening starts a mediaPlayback foreground service only from a resumed Activity.
Explicit microphone activation requests RECORD_AUDIO, then upgrades the service
to microphone while visible. Reconnection can reuse an existing microphone
service; it cannot grant permission or start capture after process death.
BLUETOOTH_CONNECT is requested on Android 12+ only when selecting Bluetooth.
POST_NOTIFICATIONS is requested once on Android 13+; denial does not grant any
extra privileges and Android can still show the foreground service in active apps.

The service has an ongoing private notification and a HeadlessJS task so RN
timers can continue for membership heartbeat. Leaving disconnects tracks, stops
audio focus/session and the service, resolves the task and releases its wake lock.
The service is not sticky and stops when the task is removed. An unexpected
service stop ends the media session rather than silently recreating it.
LiveKit owns communication audio focus and native headset/device routing.
Android recording-silenced callbacks mute local capture after interruption;
microphone recovery requires explicit user action.

## Remaining validation

No emulator, native build or physical-device result is claimed by these sources.
Policy tests exercise publication restrictions, URL validation, terminal errors,
and the retry budget; they do not prove microphone quality or background survival.
The plugin transformation can be inspected separately from native compilation.

Verify two real accounts/devices, permission denial/revocation, Bluetooth attach
and detach, 90+ seconds in background and with screen locked, incoming calls,
Wi-Fi/mobile handover, account revocation, duplicate login, long sessions, and
leave/logout during pending connection or microphone enable. Record CPU, RAM,
battery, packet loss and reconnect latency from actual runs. OEM battery policy,
Doze, force-stop, network restrictions and process death can terminate the session;
foreground service presence alone does not establish acceptance of those cases.

iOS background audio/CallKit is outside this Android service implementation.

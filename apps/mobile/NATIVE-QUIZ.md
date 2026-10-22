# Native quiz reconciliation

This change recovers the native quiz feature from PR #18 on top of the newer Arabic native authentication/voice application. It does not replace App.tsx, the account cookie vault, the LiveKit owner, or the voice-room APIs.

Open **حسابي → المسابقات**. Join by an official room link/code and player name, browse the existing games directory, or play the classic quiz phases. The quiz modal has its own Android back handling and keyboard viewport. Closing it unmounts polling and aborts outstanding reads. A quiz player identity is ephemeral component state, separate from the account.

The new public POST /api/live/join/ endpoint and the existing token-authorized room endpoint must be available on the same configured HTTPS API origin. The web server and native bundle therefore need coordinated delivery after review. No deployment is performed by this PR. Unsupported game rooms continue to open on the website from the directory.

## Safety and verification

- The guest client reuses origin validation, canonical trailing slashes, timeout/abort handling, omitted OS credentials and redirect rejection from the existing HTTP client. It never reads account SecureStore state, accepts response cookies or installs the account sign-out handler.
- Participant tokens are sent in POST bodies, never links, persistent storage or reports. A quiz-token 401 ends quiz participation without signing the account out.
- Server time controls the question countdown; server state controls accepted answers, score, reveal and rankings. A synchronous answer guard blocks concurrent taps.
- The join route normalizes input, rate limits guest joins and uses the same helper as the website. Existing database capacity semantics are preserved; this port does not claim to fix concurrent joins at the last available seat.
- Expo-supported React/React Native/safe-area versions remain unchanged. The only lockfile addition links the existing contracts workspace for types.
- The native runtime changes. A new delivery APK is required; the prior pinned APK cannot validate this feature.
- Typecheck, unit tests and bundling are engineering evidence. Native quiz UI, authenticated host/quiz integration, supported viewport/font-scale screenshots, physical devices and iOS release acceptance require their own executed evidence. No production participant is created by the unit tests.

The original PR #18 stays open until the replacement's integration and visual acceptance are complete.

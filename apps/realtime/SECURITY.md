# Realtime service — Security posture

This document explains the headers applied by the persistent NestJS service on Render. The separate Next.js service uses `config/web-security.mjs`, loaded by `apps/web/next.config.ts`. Both services set their own response policies without relying on an edge hosting configuration.

Headers are applied to Socket.IO polling, `/health`, and `/realtime/*` responses at the Express layer. The production services are `qurabia-web` and `tahaddi-realtime`; their allowed browser origins must be configured explicitly.

## Headers applied

| Header | Value | Purpose |
| --- | --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for two years on every host. Applied directly by the service on every host. |
| `X-Frame-Options` | `DENY` | Disallows embedding any realtime response in an `<iframe>` (clickjacking). |
| `X-Content-Type-Options` | `nosniff` | Disables MIME sniffing on responses. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends the bare origin on cross-origin requests, full URL only on same-origin. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Disables powerful APIs the realtime service does not use; also opts out of FLoC tracking. |
| `Content-Security-Policy` | `default-src 'self'; connect-src 'self' wss://qurabia.com wss://*.qurabia.com; img-src 'self' data: blob: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` | Locks the realtime responses to the project origin, allows Socket.IO websocket upgrades against `qurabia.com`, and forbids framing. |

The headers are injected by an Express middleware registered in
`src/main.ts` (`createSecurityHeadersMiddleware`) before any route handler, so
they are visible on `/health`, on `/realtime/*`, and on every
Socket.IO long-poll response.

## Verification

```bash
curl -sI https://qurabia.com/realtime/health | grep -Ei 'strict-transport|x-frame|x-content|referrer|permissions|content-security'
```

All six headers should be present in the response.

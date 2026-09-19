# Realtime service — Security posture

This document explains the security headers that the NestJS realtime
service applies to every HTTP response. It complements the security
posture configured in `apps/web/next.config.ts` and the Vercel edge
configuration for `qurabia.com`.

The realtime service is the one currently serving `qurabia.com` and
`www.qurabia.com` (the production Next.js app and this NestJS service
share a Vercel monorepo with a single set of rewrites). Adding the
headers at the Express layer guarantees the protection on the
Socket.IO long-poll transport and `/realtime/*` routes, where the
Vercel edge headers would otherwise be the only line of defence.

## Headers applied

| Header | Value | Purpose |
| --- | --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Forces HTTPS for two years on every host. Repeated even though Vercel sets it at the edge so non-Vercel deploys (Docker, on-prem) are also covered. |
| `X-Frame-Options` | `DENY` | Disallows embedding any realtime response in an `<iframe>` (clickjacking). |
| `X-Content-Type-Options` | `nosniff` | Disables MIME sniffing on responses. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends the bare origin on cross-origin requests, full URL only on same-origin. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Disables powerful APIs the realtime service does not use; also opts out of FLoC tracking. |
| `Content-Security-Policy` | `default-src 'self'; connect-src 'self' wss://qurabia.com wss://*.qurabia.com; img-src 'self' data: blob: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` | Locks the realtime responses to the project origin, allows Socket.IO websocket upgrades against `qurabia.com`, and forbids framing. |

The headers are injected by an Express middleware registered in
`src/main.ts` (`applySecurityHeaders`) before any route handler, so
they are visible on `/health`, on `/realtime/*`, and on every
Socket.IO long-poll response.

## Verification

```bash
curl -sI https://qurabia.com/realtime/health | grep -Ei 'strict-transport|x-frame|x-content|referrer|permissions|content-security'
```

All six headers should be present in the response.

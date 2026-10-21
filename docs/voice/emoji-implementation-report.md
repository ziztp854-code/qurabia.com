# Voice chat emoji release report

Release approved by the owner on 2026-10-22. Source base: `7e2a71d0a53fff57440bf3d8df3ced6cc37b9f00` in `ziztp854-code/qurabia.com`.

## Implementation

- Arabic RTL picker: expressions, favorites, recent, animated, search and packs. Preferences are per account. Twenty Unicode expressions work while custom packs load or fail.
- Inline custom emoji and reactions use the existing HTTP command path with server-origin reliable LiveKit packets and polling. No extra Socket.IO connection or audio/broadcast implementation was added.
- `/admin/voice-emojis` requires `MANAGE_CONTENT` and supports exclusive packs and static/animated WebP uploads. Sharp validates assets, normalizes them and generates still posters. SVG and remote URL inputs are rejected.
- Shared image visibility/reduced-motion observers, lazy picker loading, catalog caching, private asset cache headers and bounded pagination. Text-only messages do not wait for asset downloads or asset database queries.
- Stable command UUIDs, transactional room version checks and durable receipts prevent duplicated messages and repeated reaction toggles, including concurrent retry and replay after deletion. Existing order and transport are preserved.
- Server limits: 12 emoji/message, 512 KiB/upload, 256px dimensions, 60 frames, six seconds, 20 reaction types/message, existing cooldown and 40 writes/minute. Administrative authorization and rate limits apply.
- Additive migration: `prisma/migrations/20261022040000_voice_emojis/migration.sql`. The production guard checks tables, columns, indexes and foreign keys before allowing this migration.

## Verification

The full upstream repository was installed with its frozen lockfile in an isolated Linux sandbox. No production credentials or live room data were copied.

| Check | Result |
| --- | --- |
| Focused emoji/chat tests | 56 passed across 11 files |
| Production schema guard tests | 17 passed |
| PostgreSQL integration tests | 9 passed on PostgreSQL 18 after all migrations |
| Concurrent retries/deleted-message replay | Passed against real PostgreSQL |
| Custom reaction retry/disabled packs | Passed against real PostgreSQL |
| Workspace lint | 10 tasks passed; two existing warnings in unrelated files |
| Workspace typecheck | 15 tasks passed |
| Production build | Next.js optimized compilation and workspace build verified |
| Browser review | Actual chat component, 200 seeded messages; desktop, 320px and 390px |
| Browser interactions | Favorites, insertion and send callback passed; picker within viewport |
| Asset failure fallback | Unicode picker usable without the authenticated custom catalog |

Coverage includes permissions, input/file validation, Unicode graphemes, bounded history, stable request IDs, retry handling, lazy loading, favorites, recent and reactions. Integration tests use disposable local data only.

## Evidence limits

Mobile viewports were emulated; physical phones were not tested. A 200-message fixture and bounded rendering tests do not establish production FPS or a sustained multi-client SFU benchmark. A live authenticated pack upload and cross-device room session should be checked by the owner after rollout. Audio and broadcast source files were unchanged.

The immutable release commit and production deployment status are reported after the hosting provider finishes. A source upload alone is not considered deployment success.

# Reserved account numbers and exclusive frames

Requested changes: public account `123456800` becomes `2`, `123456821` becomes `78`, owner stays `1`. The user approved applying the sapphire owner frame and rose-gold **Amira** frame exclusively to their respective accounts. The user also approved the two matching exclusive entrance effects. Existing roles, internal user IDs, names, subscriptions, voice permissions and other profile data are preserved.

## Implementation

- A bounded transaction verifies both original public numbers against their immutable public account identities before renumbering. Any collision or unexpected identity aborts the transaction. New numbers are unique, immutable and reserved; all other users retain nine-digit numbers. Retired numbers are never allocated again.
- Old `/people/123456800` and `/people/123456821` URLs redirect permanently to `/people/2` and `/people/78`. APIs, avatar/cover authorization, following and administrator searches resolve the same aliases with existing privacy and session checks.
- Four new catalog entries and account-specific grants use the existing cosmetic system. One-time migrations equip the frames and entrances, merging `appearance.frameId` / `appearance.effectId` into existing profiles and filling missing appearance defaults. No account, profile or grant is deleted.
- Database constraints reject grants to another account and making these items free. Server resolution, equip validation and administrative commands also enforce the exclusive identities. The owner cosmetics additionally require the current OWNER role. Revocation and expiry remain effective; the accounts can select other owned frames later.
- Shared profile and voice-avatar renderers display the transparent jewelry over the actual account photograph, with a neutral message if no photo exists. The two exclusive entrance effects use the existing bounded royal animation and queue, with reduced motion and user opt-out preserved. No audio logic or dependency changes.
- Production preflight allowlists only the three reviewed migrations, verifies existing schema metadata and rejects incomplete or unrelated pending changes. It does not read credentials or user data. The migrations themselves make the explicitly requested, guarded account changes.

## Validation

- Web unit/component selection: 132 tests passed.
- PostgreSQL account-number and deployment-guard checks: 31 passed, including identity mismatch rollback, protected numbers, ownership changes, alias retirement, profile preservation and exclusive grants.
- Full community/voice PostgreSQL integration suite: 9 passed, replaying the entire migration history in its dedicated loopback fixture database.
- TypeScript and production Next.js build passed. ESLint has zero errors and two pre-existing warnings in `world.js` and `site-shell.tsx`. Public bundle exposure and CSS token-budget checks passed.
- Production preflight executed against the explicitly configured isolated local database and reported `Voice/profile/community schema is already present.`
- Browser: Chromium, local synthetic users, DPR 1, zoom 100%; matching 390px and 1440px before/after views for both accounts. Also 320px/430px with 200% root text size and reduced motion, no horizontal overflow. Both public API aliases, redirects, owner 1, invalid short IDs and absence of frames on account 78 passed. No page JavaScript errors. Axe reported zero violations; image-composited color contrast remains incomplete.

## Evidence

“Before” shows the same local profiles with the exclusive frame unequipped; “after” shows the granted frame equipped. The final build and all other fixture state are held constant. Test users deliberately have no uploaded portrait; production photographs are preserved. These screenshots are not production accounts.

| Account | Before mobile | After mobile | Before desktop | After desktop |
| --- | --- | --- | --- | --- |
| Owner 1 | [390px](visual-evidence/exclusive-profile-frames/before-1-390.png) | [390px](visual-evidence/exclusive-profile-frames/after-1-390.png) | [1440px](visual-evidence/exclusive-profile-frames/before-1-1440.png) | [1440px](visual-evidence/exclusive-profile-frames/after-1-1440.png) |
| Amira 2 | [390px](visual-evidence/exclusive-profile-frames/before-2-390.png) | [390px](visual-evidence/exclusive-profile-frames/after-2-390.png) | [1440px](visual-evidence/exclusive-profile-frames/before-2-1440.png) | [1440px](visual-evidence/exclusive-profile-frames/after-2-1440.png) |

[Browser measurements](visual-evidence/exclusive-profile-frames/checks.json). Asset dimensions, provenance and delivered byte sizes are in the [artwork README](../apps/web/public/community-assets/README.md).

Art Director / Visual QA: Codex primary agent, self-review. Scoped internal score: composition 19/20, color 13/15, typography 14/15, assets 18/20, responsive 14/15, usability/accessibility 13/15 = 91/100. The frame overlays are clear and bounded, with no layout changes; existing mobile page-title clipping remains outside this change. Full visual acceptance is **unverified**: real iOS/Safari devices, complete image-background contrast, physical-device audio/performance and actual browser zoom were not tested. No claim of final WCAG or 95/100 certification.

## Recovery

Normal application rollback must preserve support for reserved short IDs. Do not restore the original nine-digit-only constraint while rows use 2/78. Cosmetic grants may be revoked and the selected exclusive cosmetic IDs cleared through an explicitly reviewed repair; original assets and other profile selections remain available. Migrations are transactional and never reset the database.

## Exclusive entrances

The final user instruction also includes both matching entrances. `entrance-owner-sapphire` and `entrance-amira-rose` use the same account bindings and current-owner guard, database grant/free constraints, active-grant checks and safe catalog resolution. A third transactional migration selects only `effectId`, retaining the chosen frame and other profile settings. The royal animation, three-second voice welcome lifetime, queue and reduced-motion/opt-out behavior are reused.

Authenticated local appearance previews were verified for both accounts at 390px and 1440px, with real account names layered separately from the generated image. [Owner entrance: before](visual-evidence/exclusive-profile-frames/before-entrance-1-390.png) · [after mobile](visual-evidence/exclusive-profile-frames/after-entrance-1-390.png) · [after desktop](visual-evidence/exclusive-profile-frames/after-entrance-1-1440.png). [Amira entrance: before](visual-evidence/exclusive-profile-frames/before-entrance-2-390.png) · [after mobile](visual-evidence/exclusive-profile-frames/after-entrance-2-390.png) · [after desktop](visual-evidence/exclusive-profile-frames/after-entrance-2-1440.png). Both previews load their account-specific image and have no horizontal overflow.

Local production-mode browser fixtures use the existing loopback-only `RUN_AUTH_E2E` configuration. For these HTTP-only local screenshots, the browser fixture removes only CSP `upgrade-insecure-requests` from local navigation responses; deployed CSP is unchanged. Voice transport is deliberately not configured locally. Full voice-stage avatar screenshot acceptance remains unverified (the tested selector found hidden profile images); server identity resolution, shared renderers, entrance queue tests and authenticated appearance previews passed. No physical-device or live audio verification is claimed.

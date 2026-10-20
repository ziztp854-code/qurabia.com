# Production compatibility review

Independent reviewer: `quality_review`. Reviewed the shared integration working tree against production commit `1679ca61` on 2026-10-20. This is a targeted compatibility review, not a deployment attestation or exhaustive security audit.

## Findings and disposition

No unresolved blocking logic regression was identified in the inspected integration paths. The SFU header-avatar clipping issue found during authenticated mobile review has been fixed and independently verified in fresh renders; see visual review below. The earlier username and privacy compatibility issues are fixed:

- Existing usernames beginning with digits or underscores remain valid; canonical and community editors share the same identity validator, with the username limit extended from 24 to 30.
- Explicitly disabling private-profile mode in the existing voice settings also clears community `MEMBERS`/`PRIVATE` visibility to `PUBLIC`. The preference revision update and profile update share a transaction; a failed compare-and-swap cannot clear visibility prematurely.

## Production behavior retained

- `/voice` continues to use the production LiveKit SFU implementation. Its media/session modules and API routes have no changes relative to the production baseline in the inspected diff. Existing room controls, gifts, reports, covers, direct messages and account role/subscription badges remain. Changes to its room views concern trusted display metadata and artwork.
- The new P2P implementation is isolated under `/community-voice`, its own API/component/library namespaces and `CommunityVoiceRoom` table. It is an experimental surface outside primary navigation. Its one-open-room and three-creations/hour limits are independent of the existing SFU five-active-rooms/host limit. A user can use both engines; there is no combined five-room budget.
- `/profile` keeps the production editor, upload endpoint, blob preview, error handling, follow counts and lazy activity. Added controls expose the numeric public ID, public profile, appearance, equipped frame and actual badge metadata.
- Canonical `VoicePreference` remains the follow/block/privacy source. No second follow graph is introduced. Public profile room links distinguish `/voice` and `/community-voice`; private room membership checks and asset access account for both engines.
- Migration additions preserve original user IDs and existing profile avatar bytes, usernames, LiveKit rooms, covers, messages and preferences. Public numeric IDs are unique nine-digit integers without zero padding; the owner is 1. The existing IDs remain relationship keys.

## Identity and presentation checks

SFU enrichment batches authoritative server identity data and does not change microphone role, mute state or original account badges. Expired/revoked cosmetics are removed on refresh. A catalog lookup failure drops optional decoration rather than preventing SFU use. Entrance artwork tier is selected only from the resolved equipped effect, never inferred from an owner/subscription badge. Room snapshots retain public metadata while omitting session and gift internals.

Missing photos have neutral text rather than fabricated faces or initials. Actual role labels remain distinct from granted community badges. Entrance announcements use a polite status region, a labelled dismiss button, bounded lifetime, and the user's entrance/reduced-effect preferences. These assertions combine source inspection and narrow component tests; they do not establish physical-device accessibility.

## Verification

Independently reran five focused suites: `voice/community-identity`, `voice/preferences-privacy`, `voice/member-name`, `voice/member-entrance` and `profile/profile-overview`: **23 tests passed, five files passed**. This covers metadata isolation, revoked grants, snapshot redaction, privacy transaction/retry semantics, trusted badge rendering, entrance behavior and the retained profile editor.

The database reviewer separately reports nine integration tests passing against all 32 migrations, including a seeded legacy username/avatar, canonical reciprocal follows, pre-existing private-profile preference and retained LiveKit data. This report does not relabel that result as an independent rerun. Root owns the full suite, typecheck, build and release checks.

## Authenticated visual review and limits

Independently inspected current authenticated Next.js screenshots supplied by root: `profile-existing-{1280,390}`, `profile-390`, `appearance-390`, `admin-390` and `room-{1280,390,320}` retained here as `production-*.png`. Existing and public profiles show the actual test account name, owner ID 1 and equipped artwork with usable mobile controls. Appearance/admin retain the real forms and granted badge catalog. These are local synthetic test accounts authenticated through NextAuth, not production screenshots.

**Resolved P2 — SFU room header, 390/320px:** the original fixed 140px artwork exceeded the requested 40px avatar size. The owner added a proportional 120% frame wrapper. Independently inspected replacement screenshots at 1280/390/320: header and seat frames now stay within their intended area, host identity is readable, and room controls/composer remain inside the viewport. The entrance was moved into a reserved stage rail instead of overlaying chat; active-state findings are recorded below.

**Desktop evidence corrected:** replacement `room-1280.png` shows the ready room, participant list, seated host, chat/composer, audio-configuration warning and bottom controls. The earlier loading/Compiling capture is superseded. Replacement captures were independently inspected after waiting for the seat and 3.5 seconds.

**Active entrance review — resolved:** independently inspected the final replacement `entrance-active-{390,1280}.png` after moving the reserved rail before the stage section. Both show the full banner and actual account name below the room heading and above the seated host. It no longer overlaps the host identity, empty-seat control, chat or bottom controls, and the desktop nameplate is no longer hidden by the fixed footer. Agent-provided final mobile CSSOM measurements place the rail at y173–383, banner at y239–361 and stage start at y395, consistent with the inspected pixels. Earlier captures with inherited offsets or desktop footer occlusion are superseded. The previously reported active-entrance P2 is closed for these exercised widths/states.

**Text scaling and keyboard limits:** inspected `room-text200.png`; the enlarged warning wraps without document overflow. This changes the root font size rather than proving full browser/text zoom for all pixel-sized labels. Root's Tab attempt landed in the Next development portal, so comprehensive app keyboard navigation is not claimed. Composited contrast and physical-device performance were not measured in this integration pass.

Root's capture log reports no document overflow/broken image on six routes at 1280/390/320 and a real room snapshot with owner ID1/equipped royal effect. Root also reports real local API grant/equip200 and room creation201. Local LiveKit is not configured, so these captures do not prove remote audio. Media integration is unchanged in the inspected production diff; existing audio test evidence must remain separate.

The previous `realistic-review.md` assesses unchanged artwork/static pilot captures only. Its score is **not** a score for the restored production SFU or merged profile. No production SQL or deployment was performed by this reviewer.

Technical review: **no blocking logic issue found in the inspected scope**. Authenticated ready-room/profile rendering and mobile active entrance have no remaining blocking clipping or missing-image defect observed. Current inspected entrance decision: **no remaining blocking overlap/occlusion observed at 390/1280px**. The exercised ready room and profile also remain free of the previously identified header-frame defect. Full accessibility/visual-policy acceptance remains unverified for the stated keyboard, text-zoom and contrast limits. No numeric score is assigned to the whole integrated application, and the old pilot score is not reused. The unavailable local audio service also prevents an actual two-user SFU audio acceptance claim.

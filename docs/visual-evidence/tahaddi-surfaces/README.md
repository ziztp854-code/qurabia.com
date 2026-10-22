# Tahaddi Live — discovery, public profile, voice sign-in presentation

These are **synthetic local browser fixtures**, not production or authenticated service verification. They render the actual `VoiceLobby`, `CommunityProfilePage`, and live `AuthShell` production components. Next links/images/navigation use existing local adapters. The sign-in fixture uses the production Input, PasswordInput and Button components with a transport-free form; it does not prove authentication, OAuth availability, or the complete production form.

The latest user direction excludes drawings: the lobby trophy illustration and large authentication crown have been removed. Both use restrained text identity. Built-in illustrated room covers are no longer shown by default: cards use an actual host image when present or a name initial fallback. Uploaded custom room covers remain supported. The synthetic profile has no avatar photo and displays its honest missing-photo fallback.

## Browser verification

Run from `apps/web`:

```sh
./node_modules/.bin/playwright test --config playwright.tahaddi-surfaces.config.ts
```

Final expanded suite: **3 passed in 13.1 seconds**. Two cases cover 390×844 and 1440×900. Each verifies live/popular/new ordering from deterministic room data, public-profile follow and refreshed count via mocked HTTP, login input usability, no page JavaScript errors, and no horizontal document overflow. Six final screenshots are `lobby-{390,1440}.png`, `profile-{390,1440}.png`, and `login-{390,1440}.png`.

A third case covers 320×700 for all three surfaces with doubled computed Arabic font sizes: RTL, no horizontal document overflow, editable email input, enabled submit control, and input line-height fitting its box. Critical geometry checks additionally require the sign-in link inside the viewport with 44 px targets, unclipped card headings without count overlap, the missing-photo label inside its avatar, and metric labels inside separate columns. Screenshots are `{lobby,profile,login}-320-text200.png`; `login-text200-inputs.json` records measured input geometry. This is font-size emulation, not physical OS text scaling. Inspection found the password eye above its field under enlarged text; scoped grid alignment corrected it, and the final screenshot shows the eye inside the field.

Earlier browser inspection caught inherited horizontal mobile room-card styling that clipped labels when placed in a two-column grid. The final scoped mobile style uses a full image card with readable title, host, listener count and favorite control. Existing cover/title links still enter the room; the duplicate entry button is hidden only in compact mobile cards. A subsequent inspection corrected a legacy mobile avatar alignment override.

## Limits and differences

- No original PNG file is available locally for calibrated pixel/SSIM comparison. Do not claim exact matching or a measured similarity score.
- No matching before screenshots were captured for these three surfaces before editing. The separate room evidence covers before/after room layouts.
- The existing backend has no weekly-prize campaign source or profile video gallery schema. The banner creates a real room, and profile tabs preserve existing badges, achievements and collection instead of fake campaign claims or videos.
- Actual user media, credentials, production authentication and live room connectivity were not exercised by this fixture.
- Browser emulation is not physical mobile device performance evidence.

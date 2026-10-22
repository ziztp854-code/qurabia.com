# Qurabia / Tahaddi — interaction and design specification

Status: implementation guidance for the UI audit fixes. Audit date: 2026-10-22.
Source reviewed: working tree at `88dddf7`. Live public homepage inspected at
1440, 390 and 320 CSS px in cloud Chromium; `/games` navigation checked.
Authenticated voice/game behavior was inspected in source, not exercised in production.
This document specifies target behavior; release verification is reported separately.

## Identity and precedence

Keep the current logo, artwork, Arabic RTL composition, colors and font families.
Use Cairo Variable for body/UI and the existing Alexandria Variable display assignments.
Do not substitute system fonts. Keep existing game-specific visual directions.
The current homepage uses the dark Prestige composition; the Ivory Crown section
in `design.md` is historical and must not drive this work.

`apps/web/tokens.css` remains the executable token source. Move existing home
palette values there unchanged when implementation is authorized. Keep existing
light/dark values and all semantic foreground/background pairings. Derive material
opacity from those colors rather than introducing a white/gray Apple palette.
Existing `design.md` and `docs/design-system.md` remain unchanged; this uppercase
file is the requested proposal. Reconcile documentation after approval to implement.

## Typography

Keep `html { font-size: 100%; }`. Do not cap user font enlargement.
Set `font-optical-sizing: auto` on the existing font families.
Weights and leading belong to the role, not arbitrary component overrides.

| Role | Size | Weight | Leading | Arabic tracking | Latin-only tracking |
| --- | --- | --- | --- | --- | --- |
| Caption / dock label | 0.75rem | 600 | 1.5 | normal | 0.015em |
| Supporting label | 0.875rem | 600 | 1.5 | normal | 0.01em |
| Body / input | 1rem | 400 | 1.65 | normal | 0em |
| Action / navigation | 1rem | 700 | 1.5 | normal | 0em |
| Lead | 1.125rem | 500 | 1.6 | normal | 0em |
| Minor heading | 1.5rem | 700 | 1.4 | normal | -0.005em |
| Section heading | 2rem | 700 | 1.3 | normal | -0.01em |
| Page heading | 3rem | 800 | 1.2 | normal | -0.015em |
| Display | clamp(3rem, 1.5rem + 6vw, 6.8rem) | 900 | 1.15 | normal | -0.02em |

Arabic is cursive: do not impose Latin negative/positive letter spacing on joined
Arabic glyphs. Size-specific tracking applies to Latin runs only. Use `:lang(en)`
or an explicit Latin utility, not an RTL-wide letter-spacing override. Preserve
Alexandria's existing 900 display weight; do not normalize the brand wordmark.
Remove the homepage's 0.84/0.9 heading leading and -0.06em tracking overrides.
Use tabular numerals for timers, codes and resources; isolate codes with `dir="ltr"`.
Check diacritics, wrapped Arabic, mixed numerals and 200% text enlargement.

## Spacing, sizing and layout

Retain the existing rem spacing scale:

| Token suffix | rem |
| --- | --- |
| 1 | 0.25 |
| 2 | 0.5 |
| 3 | 0.75 |
| 4 | 1 |
| 5 | 1.25 |
| 6 | 1.5 |
| 8 | 2 |
| 10 | 2.5 |
| 12 | 3 |
| 16 | 4 |
| 20 | 5 |

Use 0.5rem control gaps, 0.75rem grouped field gaps, 1rem mobile gutters,
1.5rem panel padding, and 3rem mobile / 5rem desktop section separation.
Replace the voice room's 24px panel inset with 1.5rem and 48px height deduction
with 3rem. Convert layout gaps/padding to rem, leaving artwork coordinates and
measured pointer coordinates in CSS pixels.

Keep current radii: 0.75rem small, 0.875rem medium, 1rem large, 1.5rem sheet.
Minimum interactive box: `max(2.75rem, 44px)` on each axis. Where a small visible
icon needs extra hit area, add about 0.625rem padding without overlapping neighbors.
Keep a 0.5rem gap between independent touch controls.
Use logical properties and test 320px, 390px, desktop and enlarged text.
The mobile dock keeps five destinations and safe-area padding. Its labels never
fall below 0.75rem; voice room control labels use the same minimum, not 8px.

## Materials and depth

Structural content cards remain solid. Only floating chrome and task surfaces use
translucency. Keep content scrolling beneath sticky chrome. Never nest a light
translucent surface inside another; a menu over a glass header gets an opaque
interior and its own shadow.

Recipes below use the active surface's existing semantic colors. Within the home
scope, `--material-base` aliases `--home-panel`, `--material-ink` aliases
`--home-ink`, and `--material-rim` aliases `--home-border`; elsewhere use
`--surface-strong`, `--foreground`, and `--border`. No palette values change.

### Navigation / floating toolbar

```css
background: color-mix(in srgb, var(--material-base) 82%, transparent);
color: var(--material-ink);
-webkit-backdrop-filter: blur(20px) saturate(145%);
backdrop-filter: blur(20px) saturate(145%);
border-block-end: 0;
box-shadow: inset 0 1px 0 color-mix(in srgb, var(--material-ink) 8%, transparent),
            0 0.5rem 1.5rem rgb(0 0 0 / 18%);
```

Use a pointer-inert bottom pseudo-element extending 0.5rem below the header,
with `linear-gradient(to bottom, color-mix(in srgb, var(--material-base) 35%, transparent), transparent)`.
This replaces the hard sticky-header divider. Do not add blur to every card.

### Modal sheet / drawer

```css
background: color-mix(in srgb, var(--material-base) 90%, transparent);
color: var(--material-ink);
-webkit-backdrop-filter: blur(28px) saturate(145%);
backdrop-filter: blur(28px) saturate(145%);
border: 1px solid var(--material-rim);
border-radius: 1.5rem 1.5rem 0 0;
box-shadow: inset 0 1px 0 color-mix(in srgb, var(--material-ink) 10%, transparent),
            0 1.5rem 3.75rem rgb(0 0 0 / 36%);
padding: 1.5rem;
padding-block-end: max(1.5rem, env(safe-area-inset-bottom));
```

Use the existing `--overlay-dialog` scrim for a blocking task. A nonmodal parallel
panel has no scrim and must not claim `aria-modal`. For nested modal sheets,
dim the parent by 12% and scale it to 0.98; restore it on exit. Reduced motion
keeps the dimming but removes scale. Isolate dialog titles with `useId()`.
Text on materials uses the existing foreground at weight 600 for small labels;
apply the Latin tracking table only to Latin text. Keep colored controls solid.

Backdrop blur stays constant during movement: animate an already blurred surface
with transform/opacity. The supplied checklist's instruction to animate blur conflicts
with its transform/opacity-only rule. If a materializing blur effect is needed,
crossfade a fixed blurred layer under a sharp layer; do not tween backdrop-filter
per frame. Profile before adding a second layer.

Fallback without backdrop-filter support: opaque `var(--material-base)`.
Under reduced transparency: opaque base, both backdrop filters `none`.
Under increased contrast: opaque base, `1px solid var(--material-ink)`, no fade edge.
Under forced colors: Canvas/CanvasText, no shadows or backdrop filters.

## Response and press feedback

Native buttons and links commit on click/release. Never execute a destructive or
navigational action on pointer-down. Show pressed feedback immediately:

```css
/* Merge into the effective button and home action selectors, removing overrides. */
transition: transform 100ms cubic-bezier(0, 0, 0.2, 1),
            background-color 100ms ease-out, border-color 100ms ease-out;
/* :active:not(:disabled), including the home hover+active combination */
transform: translateY(0) scale(0.97);
```

Constrain hover lift to `(hover: hover) and (pointer: fine)`. Keep focus rings.
Use an explicit `.actions a:is(:hover, :focus-visible):active` override so a hover
selector cannot mask compression. Preserve native drag-away cancellation.
No artificial timers before input feedback. Loading guards prevent duplicate
network operations; they must not disable unrelated navigation or dismissal.

## Springs and interruption

Use the installed Framer Motion package, existing motion library entry point and
motion values. Export these proposed defaults from `src/lib/motion.ts`:

```ts
const uiSpring = { type: 'spring', bounce: 0, duration: 0.4 } as const;
const sheetSpring = { type: 'spring', bounce: 0, duration: 0.3 } as const;
const momentumSheetSpring = { type: 'spring', bounce: 0.2, duration: 0.3 } as const;
const momentumRotationSpring = { type: 'spring', bounce: 0.2, duration: 0.4 } as const;
```

These are perceptual spring settings, not fixed settle deadlines. Default damping
intent is 1.0; approximately 0.8 only for an actual momentum release. An ordinary
menu, click-opened sheet or score update gets no bounce. Replace the shared score
`scale: [1, 1.08, 1]` with a nonbouncing state change. Treat opacity independently
with a short 120ms ease-out when helpful.

Use separate X and Y motion values. Pointer-down stops the current animation,
keeps its current displayed value and velocity, and stores the pointer-to-element
offset. Re-target from that current value; do not reset to zero or wait for exit.
Keep an exiting panel mounted until its animation completes. A reopen cancels the
pending unmount and reverses the same motion value. Focus and scroll locks last
through the modal's actual visible lifetime. Do not lock input during transitions.

## Gesture mechanics

Apply these rules to the mobile voice-chat handle and any future draggable sheet.
Retain pointer capture. Track positions/timestamps over the last 80–100ms and
compute velocity in CSS px/s. Ignore stale samples after a pause. Capture the
current translation on grab; use pointer delta plus that translation. Batch DOM
reads before writes and update a motion value/display-synced frame once per frame.

Before direction lock, measure both axes from the first move. Commit to the
sheet's vertical gesture after 10px when abs(dy) exceeds abs(dx); otherwise leave
horizontal intent to its owner. Keep the handle's `touch-action: none`; do not
apply it to the scrollable message list. A handle tap may close the sheet. A drag
suppresses the following synthesized click, including when it returns to origin.
Reset bookkeeping on pointercancel/lostpointercapture without resetting the
presentation value; spring to the appropriate retained state.

For a sheet of height H with snap positions [0, H]:

```ts
const d = 0.998;
const projected = y + (velocityY / 1000) * d / (1 - d);
const target = snaps.reduce((a, b) =>
  Math.abs(projected - a) <= Math.abs(projected - b) ? a : b);
// Animate the same motion value, with velocityY in absolute px/s.
animate(yMotionValue, target, { ...momentumSheetSpring, velocity: velocityY });
```

Use velocity sign to distinguish a continuing dismissal from a reversal; at low
velocity use projected proximity. Do not force dismissal merely because y > 80.
Only call the semantic close/unmount callback after reaching H. Allow a regrab
before that completion. Recalculate H when viewport/safe-area dimensions change.

Within bounds, follow the pointer 1:1. Beyond either bound, with signed overshoot o
and measured dimension D, use `o * D * 0.55 / (D + 0.55 * Math.abs(o))` added to the
boundary. Remove the current 250px hard cap. No extra damping inside the valid range.

Hint dismissal continuously: `p = clamp(y / H, 0, 1)`; modal scrim opacity follows
`1 - p`. Keep the text surface legible rather than fading its content while dragging.
Enter and exit bottom sheets through the bottom, drawers through their original
RTL-aware side. Menus use an origin derived from the trigger's measured position,
e.g. `100% 0%` for the normal RTL end-aligned popover, with collision-aware updates.

## Frame budget and ambient motion

Animate transform and opacity. Remove the hero gradient/background-position shine
loops, the 6s trophy breathing and the 5.6s crown sweep. Keep the artwork and its
static gradients. No full-stage moving grain/particle background. A live-status
indicator may move only while it communicates a real state; retain a text label.

Do not add stretch/blur without measured fast-motion benefit. Add will-change only
while an interaction is imminent/active, and remove it at rest. Use requestAnimationFrame
or the animation library's scheduler, never timers as the rendering clock.

## Sound and haptics

Use existing mute preferences and game cues only for meaningful commit/result/error
states. Initialize/unlock audio during an authorized user interaction. If a suspended
context must resume, await it and compute audio start time afterward; do not queue
a stale success sound after the visual state has moved on. Dispatch visual feedback
and any ready audio/haptic cue from the same state event. Unsupported audio/haptics
must not block the action. Never add sound to routine hover/navigation.

## Reduced motion and accessibility

Use both CSS media queries and a reactive motion preference in JavaScript.
Disable parallax, translations, rotations, spring movement, overshoot, moving noise,
particles and hover/press transforms. Keep instantaneous color feedback. Use at most
a 120ms opacity crossfade for presence changes; keep content available throughout.
Remove the blanket 0.01ms transition override where it defeats useful opacity changes.

On a draggable sheet in reduced motion, retain immediate direct pointer tracking
when the user explicitly drags; remove release travel/bounce and apply the destination
immediately with optional opacity feedback. Provide click/keyboard close controls.
Never make dragging the only way to perform an action.

Maintain Escape, focus trapping/restoration, visible focus and accessible names.
Errors validate locally on blur and after edits to a touched invalid field; use
existing Input/PasswordInput `error` props so aria-invalid/aria-describedby connect
the message. Keep authentication failures generic; do not reveal account existence.
Do not initiate authentication on blur. No unneeded confirmation for reversible edits.

## Review and process

Prototype the real interaction, not a separate visual mock. Record desktop/mobile
viewport, DPR, theme, text size, source revision and authenticated/fixture state.
Inspect press-down, mid-drag, reversal, release, settling and reopen-during-close
frames. Test slow and fast flicks, upward reversal beyond the old 80px threshold,
pointer cancellation, lost capture and taps versus drags.

Verify light/dark materials, reduced motion, reduced transparency, contrast, keyboard,
320px layouts and 200% text. Measure representative frame timing before claiming
smoothness. Existing motion tests and screenshots are useful but do not establish
velocity continuity or interruption correctness. A source-only finding remains so
until exercised in a browser. This audit is not a final visual acceptance sign-off.

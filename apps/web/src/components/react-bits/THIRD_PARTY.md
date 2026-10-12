# React Bits adaptations

Upstream: [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits), immutable revision
`2139cb3098d4fedc6264f13e50dcb4694224ba7c` (reviewed 2026-10-12).
The project distributes individual copy-and-paste components, rather than a required gallery runtime.
No React Bits npm package or gallery dependencies are installed.

Copyright (c) 2026 David Haz. These three adaptations retain the upstream
[MIT + Commons Clause license](./LICENSE.md). It permits use within this website,
including commercial use; it restricts selling, sublicensing or redistributing the
components themselves. No account, subscription, click-through agreement or external service was used.

| Local file | Original source at the pinned revision | Changes |
| --- | --- | --- |
| `gradient-text.tsx`, gradient CSS | [GradientText.tsx](https://github.com/DavidHDev/react-bits/blob/2139cb3098d4fedc6264f13e50dcb4694224ba7c/src/ts-default/TextAnimations/GradientText/GradientText.tsx), adjacent CSS | Retains the linear-gradient text renderer. Specializes to one token palette; replaces per-frame painting with CSS background position. Removes pointer, border and glow variants. Preserves Arabic shaping by keeping the whole text intact. |
| `magnet.tsx` | [Magnet.tsx](https://github.com/DavidHDev/react-bits/blob/2139cb3098d4fedc6264f13e50dcb4694224ba7c/src/ts-default/Animations/Magnet/Magnet.tsx) | Retains center-offset motion. Listens on the owning button, moves the label only, clamps to 2px, removes React updates on mouse movement and global mousemove listeners. Excludes touch, dragging and reduced motion. |
| `noise.tsx`, noise CSS | [Noise.tsx](https://github.com/DavidHDev/react-bits/blob/2139cb3098d4fedc6264f13e50dcb4694224ba7c/src/ts-default/Animations/Noise/Noise.tsx), adjacent CSS | Retains the seeded grain generator. Builds a single 128px tile; CSS shifts it at two steps per second. Removes dust/scratches, full-size canvas, RAF and unused options. Revokes the generated blob URL on cleanup. |

Noise is lazy-loaded on the homepage only. GradientText and Noise stay still until
an IntersectionObserver confirms visibility, and pause when the document is hidden
or the live reduced-motion preference is enabled. Magnet has no continuous loop.
Decorations cannot receive pointer events. Text and links remain rendered without JS.

## Runtime packages

- `gsap@3.15.0`: core + ScrollTrigger only, deferred client-side.
  [Standard no-charge license](https://gsap.com/community/standard-license/),
  including commercial websites. This implementation provides no visual animation builder.
- `lenis@1.3.26`: official `lenis` core, [MIT license](https://github.com/darkroomengineering/lenis/blob/main/LICENSE).
  React 19 is supported by its optional React peer (`>=17`); core is framework-independent.
  Next.js 16 initializes it inside a client effect only.
- Official references: [Lenis/GSAP integration](https://github.com/darkroomengineering/lenis#gsap-scrolltrigger),
  [GSAP React cleanup](https://gsap.com/resources/React/).

The GSAP ticker is the only Lenis clock (`autoRaf: false`). It supplies wall-clock
milliseconds, avoiding a global `lagSmoothing` mutation. ScrollTrigger observes native
window scroll with Lenis scroll updates; no transformed scroller/proxy is necessary.
Each reveal has its own GSAP context. Only these contexts are reverted; no global
`killAll`, ticker sleep or ScrollTrigger disable is used. Native hash navigation,
history restoration and keyboard input keep browser semantics. Smooth scrolling
is opt-in to `/` and `/games`; nested scrollers, dialogs, previews, editable fields,
maps, canvases, dragging and touch remain native. Mobile filter overlays suspend
the runtime until closed. Dynamic import generations prevent stale initialization
after StrictMode cleanup, preference changes or route transitions.

Content changes refresh only the owned, unpinned triggers using the documented
[instance `refresh()`](https://gsap.com/docs/v3/Plugins/ScrollTrigger/refresh()/).
They do not require a global pin-layout refresh, which temporarily resets all
scrollers and can restore a stale scroll cache during native keyboard/hash input.

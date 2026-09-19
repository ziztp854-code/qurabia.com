# Qurabia Full-Site Codex Guide

## Mission
You are working on Qurabia, an Arabic-first competitive social gaming website.

Primary goals:
- Preserve existing product and game logic.
- Improve code quality, reliability, UX, performance, and maintainability.
- Keep the product Arabic-first and RTL-safe.
- Treat backend/game state as the source of truth.
- Avoid pay-to-win mechanics.
- Prefer reusable systems over one-off fixes.
- Never rewrite the whole application unless the current architecture makes that unavoidable.

## Required workflow
Before major changes:
1. Read package.json and project config.
2. Identify framework, routing, state management, styling, backend, realtime, auth, and database.
3. Locate current source-of-truth for game state, ranks, subscriptions, rooms, and users.
4. Reuse existing architecture where practical.
5. Make incremental changes.
6. Run lint, typecheck, tests, and build after meaningful changes.
7. Fix regressions introduced by your work.

## Product language
- Arabic-first.
- RTL must work correctly.
- Avoid unreadable decorative Arabic typography for functional UI.
- Use modern Arab-court visual inspiration subtly.
- Avoid neon/casino/cyberpunk clichés.

## Court ranks
Current court ranks only:
1. المشاهد
2. الفارس
3. الأمير
4. السلطان

Do not add ranks without explicit instruction.

## Engineering rules
- Game logic and presentation/motion layers must remain separate.
- Server/backend is the authority for multiplayer state, XP, ranks, subscription status, and rewards.
- Never trust localStorage for entitlements or rank.
- Do not expose hidden roles or private game information in the client unnecessarily.
- Clean up timers, sockets, event listeners, animations, requestAnimationFrame, observers, and canvases.
- Respect prefers-reduced-motion.
- Mobile-first and touch-first.
- Accessibility is required, not optional.

## Motion
Motion should explain state changes.
Use CSS for simple micro-interactions.
Use GSAP only for coordinated timelines, SVG animation, complex transitions, or frame sequences.
Avoid decorative animation overload.

## Performance
Optimize:
- initial load
- route-level code splitting
- image delivery
- frame-sequence loading
- socket event volume
- rerenders
- long tasks
- layout shifts
- memory leaks

## Security
Never:
- move authorization to the client
- trust client-side prices or subscription state
- expose secrets
- weaken validation
- leak private role/game data
- introduce unsafe HTML rendering

## Output expectations
When asked to implement:
- inspect first
- modify files directly
- explain important architectural decisions briefly
- show changed files
- run validation
- report remaining risks

## Integration and precedence

This guide was integrated from the user-provided `qurabia-full-site-codex-pack.zip`. The current user request and root `AGENTS.md` take precedence. Preserve the existing design skill order, visual identity, Git permissions, and unrelated local edits.

- These are task-specific operating instructions, not a backlog to implement automatically. Games, payments, subscriptions, analytics, and PWA guidance applies when the feature exists or is explicitly requested.
- Keep `.agents/skills/` as the discoverable repository skill location. The 37 imported skills use the `qurabia-` prefix to preserve existing skills with overlapping names.
- Select only matching skills and read their full `SKILL.md` before use. Do not load all 37 on every task.
- Reuse existing components, tokens, and installed dependencies; GSAP guidance does not require installing GSAP or replacing CSS animations.
- Treat the four court ranks as the pack's intended product constraints. Inspect the authoritative implementation before rank work; report discrepancies instead of silently migrating data or changing thresholds.
- Check environment configuration by presence/status only; never print secret values or read secret files for this guide.

## Imported skills

- [`qurabia-accessibility`](../.agents/skills/qurabia-accessibility/SKILL.md)
- [`qurabia-admin-moderation`](../.agents/skills/qurabia-admin-moderation/SKILL.md)
- [`qurabia-analytics-events`](../.agents/skills/qurabia-analytics-events/SKILL.md)
- [`qurabia-auth-accounts`](../.agents/skills/qurabia-auth-accounts/SKILL.md)
- [`qurabia-canvas-renderer`](../.agents/skills/qurabia-canvas-renderer/SKILL.md)
- [`qurabia-cards-games`](../.agents/skills/qurabia-cards-games/SKILL.md)
- [`qurabia-chess-game`](../.agents/skills/qurabia-chess-game/SKILL.md)
- [`qurabia-code-quality`](../.agents/skills/qurabia-code-quality/SKILL.md)
- [`qurabia-court-ranks`](../.agents/skills/qurabia-court-ranks/SKILL.md)
- [`qurabia-deployment-ci`](../.agents/skills/qurabia-deployment-ci/SKILL.md)
- [`qurabia-design-system`](../.agents/skills/qurabia-design-system/SKILL.md)
- [`qurabia-error-handling`](../.agents/skills/qurabia-error-handling/SKILL.md)
- [`qurabia-frame-sequence`](../.agents/skills/qurabia-frame-sequence/SKILL.md)
- [`qurabia-game-lobby`](../.agents/skills/qurabia-game-lobby/SKILL.md)
- [`qurabia-game-state-machine`](../.agents/skills/qurabia-game-state-machine/SKILL.md)
- [`qurabia-games-directory`](../.agents/skills/qurabia-games-directory/SKILL.md)
- [`qurabia-gsap-game-ui`](../.agents/skills/qurabia-gsap-game-ui/SKILL.md)
- [`qurabia-homepage`](../.agents/skills/qurabia-homepage/SKILL.md)
- [`qurabia-killer-game`](../.agents/skills/qurabia-killer-game/SKILL.md)
- [`qurabia-leaderboards`](../.agents/skills/qurabia-leaderboards/SKILL.md)
- [`qurabia-motion-core`](../.agents/skills/qurabia-motion-core/SKILL.md)
- [`qurabia-notifications-toasts`](../.agents/skills/qurabia-notifications-toasts/SKILL.md)
- [`qurabia-payments-billing`](../.agents/skills/qurabia-payments-billing/SKILL.md)
- [`qurabia-performance`](../.agents/skills/qurabia-performance/SKILL.md)
- [`qurabia-profile-system`](../.agents/skills/qurabia-profile-system/SKILL.md)
- [`qurabia-project-audit`](../.agents/skills/qurabia-project-audit/SKILL.md)
- [`qurabia-pwa-mobile`](../.agents/skills/qurabia-pwa-mobile/SKILL.md)
- [`qurabia-question-games`](../.agents/skills/qurabia-question-games/SKILL.md)
- [`qurabia-realtime-sockets`](../.agents/skills/qurabia-realtime-sockets/SKILL.md)
- [`qurabia-rooms-matchmaking`](../.agents/skills/qurabia-rooms-matchmaking/SKILL.md)
- [`qurabia-rtl-arabic-ui`](../.agents/skills/qurabia-rtl-arabic-ui/SKILL.md)
- [`qurabia-search-discovery`](../.agents/skills/qurabia-search-discovery/SKILL.md)
- [`qurabia-security`](../.agents/skills/qurabia-security/SKILL.md)
- [`qurabia-seo-sharing`](../.agents/skills/qurabia-seo-sharing/SKILL.md)
- [`qurabia-subscriptions`](../.agents/skills/qurabia-subscriptions/SKILL.md)
- [`qurabia-svg-motion`](../.agents/skills/qurabia-svg-motion/SKILL.md)
- [`qurabia-testing`](../.agents/skills/qurabia-testing/SKILL.md)

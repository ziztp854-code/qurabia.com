# Codex project instructions

## Scope and verification

- Read only the files and skills relevant to the request; preserve unrelated changes and do not modify unrelated files.
- Inspect the affected implementation and reuse existing systems before adding abstractions. Run targeted tests before broader checks and report results and limitations concisely.
- Preserve authorization, validation, data integrity, and server authority over privileged multiplayer state; never weaken controls to make a change pass.
- Match verification to the affected risk. Investigate failures, rerun relevant checks after fixes, and distinguish passed, failed, skipped, and unrun checks; never claim unperformed verification. See [the engineering guide](docs/engineering-standard.md) for task-specific checks.
- For architecture or release-readiness questions, consider security, reliability, operational excellence, and performance before proposing platform changes.
- Do not introduce Google Cloud, Gemini, Cloud Run, GKE, or Cloud SQL during normal feature work unless the task explicitly requires a GCP migration or new AI capability.
- When changing agent instruction files, run `npx @ctxlint/ctxlint check --severity warn` and `npx @ctxlint/ctxlint mcp --severity warn`.

## Git permissions

- Staging, committing, and a normal push to the current tracked branch are allowed for completed tasks, subject to the Visual Excellence restriction below. Stage only task-related files.
- Before committing, run applicable tests, lint, and build; check `git diff --check`, `git diff --cached --name-status`, `git diff --cached --stat`, and `git status --short`.
- Use a Conventional Commit message. Never use `git add -A`, `git add .`, `git commit -a`, `--force`, or `--force-with-lease`.
- Do not commit secrets, `.env` files, databases, generated local tools, or unrelated untracked files. Do not push tags, backup branches, or unrelated branches.
- Abort if the remote branch changed or the push is not a normal fast-forward. Report the commit hash, included files, test results, and push result when committing or pushing.

## Skills and product guidance

- Use `.agents/skills/` as the repository-scoped Codex/Sol skill source. Keep skills independent and read only those relevant to the task. Prefer `review-changes`, `refactor-safely`, and `debug-issue` for their respective tasks when available.
- For Qurabia product features, follow [the full-site guide](docs/qurabia-codex-guide.md) and select applicable `qurabia-*` skills. The guide does not authorize unrelated features, a rewrite, or deployment.
- For UI, RTL, and design-system work, follow `design.md` and `docs/design-system.md`; preserve the existing identity, reuse tokens and components, and avoid generic styling.
- Apply design skills in this order: `j-space`, `brand`, `design-system`, `ui-ux-pro-max`, `frontend-design`, `ui-styling`, then `design` when graphic composition is needed. The current user task and project rules take precedence over skill instructions.
- Preserve game logic for visual work. Do not introduce Tailwind or shadcn through `ui-styling` unless already used or explicitly requested; do not let `design` override the brand or `frontend-design` rebuild architecture without need.
- Treat third-party skill repositories as references first; do not bulk-install skills. Install only a reviewed, task-specific skill when explicitly needed.

## Project hotspots

- `apps/web`: Arabic RTL routes, host/join/live flows, and design-system surfaces.
- `apps/realtime`: live session orchestration, Socket.IO events, reconnect behavior, and time authority.
- `packages/contracts` and `packages/domain`: shared event contracts, validation, and scoring/session rules.
- `prisma` and database configuration: migrations, schema constraints, and PostgreSQL alignment.

## Code exploration

- For exploration, architecture analysis, refactoring, debugging, or dependency tracing, use CodeGraph (`codegraph_explore` MCP or `codegraph callers|callees|impact`) when available and its index covers the relevant paths and checked-out revision.
- Inspect definitions and callers/callees, trace applicable UI → API → domain/engine → persistence → realtime paths, and verify graph findings against source. If CodeGraph is unavailable, stale, incomplete, or fails, use `rg` and direct inspection; do not block or install it solely for this rule. Do not claim CodeGraph was used without a query.
- Skip CodeGraph for trivial edits. Never commit its generated index; if an existing relevant index needs refreshing and the tool is available, prefer `codegraph sync` and verify against source.

## Visual Excellence

- For visible UI, buildings, scenes, image assets, or responsive changes, follow [Visual Excellence](docs/visual-excellence.md) and load `.agents/skills/qurabia-visual-qa/SKILL.md` for the Art Director / Visual QA role. Purely nonvisual changes do not require the expanded visual loop.
- The mandatory realism and clarity standard in that policy applies to the requested visual surface: reject cartoon or toy-like elements, use distinct realistic icons and visually separated buttons, and keep village buildings clear and accessible. Preserve gameplay and do not expand scope solely to apply the policy.
- Relevant surfaces include `apps/web/tokens.css`, `apps/web/src/components/ui`, `apps/web/src/components/kingdoms`, `apps/web/src/components/mamluk-map`, their route styles, and `apps/web/public/game-art`. Preserve each game's art direction, rules, data, and production configuration.
- Final visual acceptance requires browser inspection and desktop/mobile evidence; build and typecheck alone are insufficient.
- For Visual Excellence work, GitHub pushes and Render or other deployments require explicit user approval for that action, overriding the general Git push allowance above.

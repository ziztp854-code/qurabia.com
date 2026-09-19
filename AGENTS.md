# Codex project instructions

## Context discipline

- Keep context focused and minimize token usage.
- Read only files relevant to the current task.
- Never modify unrelated files.
- Run targeted tests before the full suite.
- Keep reports concise.

## Git permissions

- Git staging, commit, and push are allowed for completed tasks.
- Stage only files directly related to the current task.
- Before committing, verify:
  - `git diff --check`
  - `git diff --cached --name-status`
  - `git diff --cached --stat`
  - `git status --short`
- Run the relevant tests, lint, and build before committing when applicable.
- Use a clear Conventional Commit message.
- A normal push to the current tracked branch is allowed after verification.
- Never use `git add -A`, `git add .`, or `git commit -a`.
- Never use `--force` or `--force-with-lease`.
- Never push tags, backup branches, or unrelated branches.
- Never commit secrets, `.env` files, databases, generated local tools, or unrelated untracked files.
- Abort if the remote branch changed or if the push is not a normal fast-forward update.
- Report the commit hash, included files, test results, and push result.
## Tahaddi Skill Routing

- For UI, RTL, and design-system work, follow the project visual direction in `design.md` and `docs/design-system.md`. Use `frontend-design` principles: bold identity, no generic SaaS styling, and tokens over hard-coded colors.
- Use `.agents/skills/` as the repo-scoped Codex/Sol skill source. Keep each skill independent; do not combine their instruction files.
- For design work, apply skills in this precedence order: `j-space` (scope and verification), `brand` (Tahaddi identity), `design-system` (existing tokens and components), `ui-ux-pro-max` (UX, accessibility, and responsive review), `frontend-design` (web implementation), `ui-styling` (CSS polish), then `design` (graphic composition when needed).
- When skill instructions conflict, the current user task and project rules win. Preserve Tahaddi's current identity and design system; do not let `ui-styling` introduce Tailwind or shadcn unless the existing stack or the user explicitly requires them; do not let `design` override the brand; do not let `frontend-design` rebuild architecture without need; and never change game logic for a visual decision.
- For code exploration, reviews, refactors, and debugging, prefer the local skills in `.claude/skills`:
  - `review-changes`
  - `refactor-safely`
  - `debug-issue`
- Treat third-party skill repositories as references first. Do not bulk-install agent skills into the project; install only a reviewed, task-specific skill when explicitly needed.
- When changing agent instruction files, run `npx @ctxlint/ctxlint check --severity warn` and `npx @ctxlint/ctxlint mcp --severity warn`.
- For architecture or release-readiness questions, evaluate changes through security, reliability, operational excellence, and performance lenses before proposing platform changes.
- Do not introduce Google Cloud, Gemini, Cloud Run, GKE, or Cloud SQL as part of normal feature work unless the task explicitly requires a GCP migration or a new AI capability.

## Tahaddi Hotspots

- `apps/web`: Arabic RTL routes, host/join/live flows, and design-system surfaces.
- `apps/realtime`: live session orchestration, Socket.IO events, reconnect behavior, and time authority.
- `packages/contracts` and `packages/domain`: shared event contracts, validation, and scoring/session rules.
- `prisma` and database config: migrations, schema constraints, and PostgreSQL alignment.

## Qurabia full-site pack

- Apply [the integrated full-site guide](docs/qurabia-codex-guide.md) when working on Qurabia product features. Existing project rules and the current user request take precedence.
- The user-approved pack is installed as 37 independent `qurabia-*` skills in `.agents/skills/`. Select and read only skills matching the current task; preserve the existing design skill precedence above.
- The pack guides requested work; it does not authorize implementing every listed feature, rewriting the product, or deploying it.

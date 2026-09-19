
## Tahaddi Skill Routing

- For UI, RTL, and design-system work, follow the project visual direction in `design.md` and `docs/design-system.md`. Use `frontend-design` principles: bold identity, no generic SaaS styling, and tokens over hard-coded colors.
- For code exploration, reviews, refactors, and debugging, prefer the local skills in `.claude/skills`:
  - `explore-codebase`
  - `review-changes`
  - `refactor-safely`
  - `debug-issue`
- For architecture or release-readiness questions, evaluate changes through security, reliability, operational excellence, and performance lenses before proposing platform changes.
- Do not introduce Google Cloud, Gemini, Cloud Run, GKE, or Cloud SQL as part of normal feature work unless the task explicitly requires a GCP migration or a new AI capability.

## Tahaddi Hotspots

- `apps/web`: Arabic RTL routes, host/join/live flows, and design-system surfaces.
- `apps/realtime`: live session orchestration, Socket.IO events, reconnect behavior, and time authority.
- `packages/contracts` and `packages/domain`: shared event contracts, validation, and scoring/session rules.
- `prisma` and database config: migrations, schema constraints, and PostgreSQL alignment.

# Local geographic campaign fixture

These tools are for an isolated local PostgreSQL database only. They never seed
production or create production accounts. The published reference atlas needs
neither this fixture nor a sign-in; private campaign data still requires an
authenticated, authorized player.

From the repository root in PowerShell, with Docker Desktop running:

```powershell
New-Item -ItemType Directory -Path '_mamluk' -Force | Out-Null
if (-not (Test-Path -LiteralPath '_mamluk/runtime.env')) {
  $mamlukDbPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  Set-Content -LiteralPath '_mamluk/runtime.env' -Value "MAMLUK_DB_PASSWORD=$mamlukDbPassword"
}
docker compose --env-file _mamluk/runtime.env -f tools/mamluk/compose.yaml up -d --wait
. ./tools/mamluk/host-environment.ps1
pnpm exec prisma migrate deploy --config tools/mamluk/prisma-local.config.ts
pnpm --filter @mamluk/world-map-core build
pnpm --filter @mamluk/maplibre-adapter build
node --conditions=react-server --import tsx tools/mamluk/seed-world-map.ts
pnpm --filter @tahaddi/web dev --hostname 127.0.0.1 --port 3000
```

The fixture's deliberately local account is `mamluk-map@example.test` with password
`MamlukMapTestOnly42!`. Preserve the private credential file and database volume
when restarting. `_mamluk`, generated files and runtime settings must remain
ignored. Stop the fixture without deleting its volume using `docker compose
--env-file _mamluk/runtime.env -f tools/mamluk/compose.yaml down`.

See [the host integration contract](../../docs/mamluk/world-map-host-integration.md)
for the endpoint, tests, attribution and limits.

# Dot-source this only for the local fixture. It never reads application credential files.
$mamlukRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$mamlukPasswordLine = Get-Content -LiteralPath (Join-Path $mamlukRoot '_mamluk/runtime.env') |
    Where-Object { $_ -match '^MAMLUK_DB_PASSWORD=[A-Fa-f0-9]{64}$' } | Select-Object -First 1
if (-not $mamlukPasswordLine) { throw 'Missing isolated local database credential.' }
$mamlukDatabaseUrl = 'postgresql://mamluk_local:' + $mamlukPasswordLine.Substring('MAMLUK_DB_PASSWORD='.Length) + '@127.0.0.1:55437/kingdoms_test_mamluk'
$env:KINGDOMS_TEST_DATABASE_URL = $mamlukDatabaseUrl
$env:DATABASE_URL = $mamlukDatabaseUrl
$env:DIRECT_URL = $mamlukDatabaseUrl
$env:NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3000'
$env:NEXTAUTH_URL = 'http://127.0.0.1:3000'
$env:AUTH_URL = 'http://127.0.0.1:3000'
$env:AUTH_SECRET = 'mamluk-map-local-fixture-session-secret-not-for-deployment'
$env:NEXTAUTH_SECRET = $env:AUTH_SECRET
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:MAMLUK_LOCAL_BUILD = '1'
$env:VERCEL = '0'
$env:UPSTASH_REDIS_REST_URL = ''
$env:UPSTASH_REDIS_REST_TOKEN = ''
$env:GOOGLE_CLIENT_ID = ''
$env:GOOGLE_CLIENT_SECRET = ''
$env:SENTRY_SOURCE_MAPS_AUTH_TOKEN = ''

/** Apply only the additive voice migration during an explicitly enabled production build. */
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { resolveMigrationUrl } from './deploy-migrations.mjs';

export const VOICE_MIGRATION = '20261018090000_voice_rooms';
export const VOICE_SOCIAL_MIGRATION = '20261019120000_voice_direct_messages';
const VOICE_TABLES = [
  'VoiceRoom',
  'VoicePreference',
  'VoiceReport',
  'VoiceCover',
  'VoiceDirectMessage',
];

export function voiceMigrationPlan(available, rows, tables) {
  if (rows.some((row) => !row.finished_at && !row.rolled_back_at))
    throw new Error('An unfinished database migration needs review before this release.');
  const applied = new Set(
    rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name),
  );
  const pending = available.filter((name) => !applied.has(name));
  const socialAvailable = available.includes(VOICE_SOCIAL_MIGRATION);
  const expected = socialAvailable ? tables : tables.slice(0, 4);
  if (pending.length === 0) {
    if (!expected.every(Boolean))
      throw new Error('Voice schema drift detected; refusing to repair it automatically.');
    return 'ready';
  }
  if (pending.some((name) => ![VOICE_MIGRATION, VOICE_SOCIAL_MIGRATION].includes(name)))
    throw new Error('Unrelated migrations are pending; this release will not apply them.');
  const basePresent = tables.slice(0, 4);
  if (pending.includes(VOICE_MIGRATION) ? basePresent.some(Boolean) : !basePresent.every(Boolean))
    throw new Error('Partial voice tables exist without a completed migration.');
  if (socialAvailable && (pending.includes(VOICE_SOCIAL_MIGRATION) ? tables[4] : !tables[4]))
    throw new Error('Voice schema drift detected; refusing to repair it automatically.');
  return 'apply';
}

async function main() {
  if (process.env.VERCEL_ENV !== 'production' || process.env.VOICE_SCHEMA_DEPLOY !== '1') {
    console.log('Voice schema deployment skipped outside the enabled production build.');
    return;
  }
  if (!process.env.DIRECT_URL && !process.env.DATABASE_URL)
    throw new Error('The production database is not configured.');
  const connectionString = resolveMigrationUrl(process.env);
  const migrationsPath = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
  const available = readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 12_000,
    statement_timeout: 15_000,
  });
  let plan;
  try {
    await client.connect();
    const schema = new URL(connectionString).searchParams.get('schema');
    if (schema)
      await client.query("SELECT set_config('search_path', quote_ident($1), false)", [schema]);
    // Metadata only: never read accounts, rooms, messages or credentials for deployment.
    const { rows } = await client.query(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"',
    );
    const result = await client.query(
      'SELECT to_regclass(quote_ident(name)) IS NOT NULL AS present FROM unnest($1::text[]) AS name',
      [VOICE_TABLES],
    );
    plan = voiceMigrationPlan(
      available,
      rows,
      result.rows.map((row) => row.present),
    );
  } finally {
    await client.end();
  }
  if (plan === 'ready') {
    console.log('Voice schema is already present.');
    return;
  }
  console.log('Applying the allowlisted additive voice migrations.');
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'prisma',
      'migrate',
      'deploy',
      '--config',
      'scripts/voice-production-prisma.config.ts',
    ],
    { stdio: 'inherit', env: { ...process.env, DIRECT_URL: connectionString } },
  );
  if (result.status !== 0) throw new Error('Voice schema migration did not complete.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch((error) => {
    // Do not include driver errors/connection strings in build output.
    const safe =
      error instanceof Error &&
      [
        'An unfinished database migration needs review before this release.',
        'Voice schema drift detected; refusing to repair it automatically.',
        'Unrelated migrations are pending; this release will not apply them.',
        'Partial voice tables exist without a completed migration.',
        'The production database is not configured.',
        'Voice schema migration did not complete.',
      ].includes(error.message);
    console.error(
      safe
        ? error.message
        : 'Production voice schema preflight failed; no automatic repair was attempted.',
    );
    process.exitCode = 1;
  });

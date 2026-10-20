/** Apply only allowlisted additive voice/profile/community migrations in the enabled production build. */
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { resolveMigrationUrl } from './deploy-migrations.mjs';

export const VOICE_MIGRATION = '20261018090000_voice_rooms';
export const VOICE_SOCIAL_MIGRATION = '20261019120000_voice_direct_messages';
export const PROFILE_IDENTITY_MIGRATION = '20261019160000_profile_identity';
export const ACCOUNT_NUMBERS_MIGRATION = '20261021220000_user_account_numbers';
export const COMMUNITY_IDENTITY_MIGRATION = '20261021230000_community_identity_voice';
const VOICE_TABLES = [
  'VoiceRoom',
  'VoicePreference',
  'VoiceReport',
  'VoiceCover',
  'VoiceDirectMessage',
];
const COMMUNITY_TABLES = [
  'CommunityBadge',
  'UserBadge',
  'ProfileCosmetic',
  'UserCosmetic',
  'CommunityVoiceRoom',
];
const COMMUNITY_PROFILE_COLUMNS = [
  'appearance',
  'coverUrl',
  'entranceEnabled',
  'entranceSound',
  'reduceEffects',
  'showCollection',
  'showRooms',
  'visibility',
  'xp',
];
const ALLOWLIST = [
  VOICE_MIGRATION,
  VOICE_SOCIAL_MIGRATION,
  PROFILE_IDENTITY_MIGRATION,
  ACCOUNT_NUMBERS_MIGRATION,
  COMMUNITY_IDENTITY_MIGRATION,
];

function verifyAdditiveMetadata(pending, name, actual, expectedLength, error) {
  if (
    actual.length !== expectedLength ||
    (pending.includes(name) ? actual.some(Boolean) : !actual.every(Boolean))
  )
    throw new Error(error);
}

export function voiceMigrationPlan(
  available,
  rows,
  tables,
  profileColumns = [],
  identitySchema = {},
) {
  if (rows.some((row) => !row.finished_at && !row.rolled_back_at))
    throw new Error('An unfinished database migration needs review before this release.');
  const applied = new Set(
    rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name),
  );
  const pending = available.filter((name) => !applied.has(name));
  if (pending.some((name) => !ALLOWLIST.includes(name)))
    throw new Error('Unrelated migrations are pending; this release will not apply them.');
  if (available.includes(PROFILE_IDENTITY_MIGRATION)) {
    const awaitingProfile = pending.includes(PROFILE_IDENTITY_MIGRATION);
    if (
      profileColumns.length !== 2 ||
      (awaitingProfile ? profileColumns.some(Boolean) : !profileColumns.every(Boolean))
    )
      throw new Error('Profile schema drift detected; refusing to repair it automatically.');
  }
  if (available.includes(ACCOUNT_NUMBERS_MIGRATION)) {
    verifyAdditiveMetadata(
      pending,
      ACCOUNT_NUMBERS_MIGRATION,
      identitySchema.accountNumber ?? [],
      5,
      'Account number schema drift detected; refusing to repair it automatically.',
    );
  }
  if (available.includes(COMMUNITY_IDENTITY_MIGRATION)) {
    verifyAdditiveMetadata(
      pending,
      COMMUNITY_IDENTITY_MIGRATION,
      identitySchema.communityTables ?? [],
      COMMUNITY_TABLES.length,
      'Community schema drift detected; refusing to repair it automatically.',
    );
    verifyAdditiveMetadata(
      pending,
      COMMUNITY_IDENTITY_MIGRATION,
      identitySchema.communityProfileColumns ?? [],
      COMMUNITY_PROFILE_COLUMNS.length,
      'Community profile schema drift detected; refusing to repair it automatically.',
    );
    if (
      !available.includes(ACCOUNT_NUMBERS_MIGRATION) ||
      !available.includes(PROFILE_IDENTITY_MIGRATION)
    )
      throw new Error('Community schema dependencies are missing from this release.');
  }
  const socialAvailable = available.includes(VOICE_SOCIAL_MIGRATION);
  const expected = socialAvailable ? tables : tables.slice(0, 4);
  if (pending.length === 0) {
    if (!expected.every(Boolean))
      throw new Error('Voice schema drift detected; refusing to repair it automatically.');
    return 'ready';
  }
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
    const profile = await client.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Profile' AND column_name = name) AS present FROM unnest($1::text[]) AS name`,
      [['username', 'avatarContent']],
    );
    const account = await client.query(`SELECT
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'User' AND column_name = 'accountNumber' AND data_type = 'integer') AS column_present,
      to_regclass('"User_accountNumber_key"') IS NOT NULL AS index_present,
      to_regclass('"User_accountNumber_seq"') IS NOT NULL AS sequence_present,
      EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema()
        AND c.relname = 'User' AND t.tgname = 'User_assign_account_number' AND NOT t.tgisinternal) AS trigger_present,
      EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema()
        AND c.relname = 'User' AND k.conname = 'User_accountNumber_range_check') AS constraint_present`);
    const community = await client.query(
      'SELECT to_regclass(quote_ident(name)) IS NOT NULL AS present FROM unnest($1::text[]) AS name',
      [COMMUNITY_TABLES],
    );
    const communityProfile = await client.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Profile' AND column_name = name) AS present FROM unnest($1::text[]) AS name`,
      [COMMUNITY_PROFILE_COLUMNS],
    );
    plan = voiceMigrationPlan(
      available,
      rows,
      result.rows.map((row) => row.present),
      profile.rows.map((row) => row.present),
      {
        accountNumber: Object.values(account.rows[0]),
        communityTables: community.rows.map((row) => row.present),
        communityProfileColumns: communityProfile.rows.map((row) => row.present),
      },
    );
  } finally {
    await client.end();
  }
  if (plan === 'ready') {
    console.log('Voice/profile/community schema is already present.');
    return;
  }
  console.log('Applying the allowlisted additive voice/profile/community migrations.');
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
        'Profile schema drift detected; refusing to repair it automatically.',
        'Account number schema drift detected; refusing to repair it automatically.',
        'Community schema drift detected; refusing to repair it automatically.',
        'Community profile schema drift detected; refusing to repair it automatically.',
        'Community schema dependencies are missing from this release.',
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

/** Apply only reviewed, allowlisted voice/profile/community migrations in the enabled production build. */
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
export const RESERVED_ACCOUNT_NUMBER_MIGRATION = '20261022010000_reserved_account_number';
export const EXCLUSIVE_FRAMES_MIGRATION = '20261022020000_exclusive_profile_frames';
export const EXCLUSIVE_ENTRANCES_MIGRATION = '20261022030000_exclusive_entrances';
export const VOICE_EMOJI_MIGRATION = '20261022040000_voice_emojis';
export const VOICE_MEDIA_RECONCILE_MIGRATION = '20261101230000_voice_media_reconcile';
export const ACCOUNT_VOICE_OUTBOX_MIGRATION = '20261103000000_account_voice_outbox';

const EXPECTED_TOKEN_VERSION_FUNCTION = `
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."role" IS DISTINCT FROM OLD."role"
    OR NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash"
  THEN
    NEW."tokenVersion" := OLD."tokenVersion" + 1;
  END IF;

  RETURN NEW;
END;`;
const normalizeFunctionBody = (body) => body.replace(/\r\n/g, '\n').trim();

export function assertTokenVersionGuard(metadata) {
  if (!metadata || metadata.token_version_column !== true || metadata.status_column !== true ||
      metadata.enabled_trigger !== true || typeof metadata.function_source !== 'string' ||
      normalizeFunctionBody(metadata.function_source) !== normalizeFunctionBody(EXPECTED_TOKEN_VERSION_FUNCTION)) {
    throw new Error('User token version guard is missing, disabled, or has unexpected behavior.');
  }
}

const EXPECTED_ACCOUNT_OUTBOX_FUNCTION = `
BEGIN
  INSERT INTO "AccountVoiceOutbox" ("userId") VALUES (NEW."id");
  RETURN NEW;
END;`;
const EXPECTED_OUTBOX_WHEN = ' WHEN (((old.status IS DISTINCT FROM new.status) OR (old."tokenVersion" IS DISTINCT FROM new."tokenVersion"))) EXECUTE FUNCTION ';

export function isAccountVoiceOutboxTriggerValid(metadata) {
  return Boolean(metadata && metadata.enabled_trigger === true &&
    typeof metadata.trigger_definition === 'string' &&
    metadata.trigger_definition.includes(EXPECTED_OUTBOX_WHEN) &&
    typeof metadata.function_source === 'string' &&
    normalizeFunctionBody(metadata.function_source) === normalizeFunctionBody(EXPECTED_ACCOUNT_OUTBOX_FUNCTION));
}
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
  RESERVED_ACCOUNT_NUMBER_MIGRATION,
  EXCLUSIVE_FRAMES_MIGRATION,
  EXCLUSIVE_ENTRANCES_MIGRATION,
  VOICE_EMOJI_MIGRATION,
  VOICE_MEDIA_RECONCILE_MIGRATION,
  ACCOUNT_VOICE_OUTBOX_MIGRATION,
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
  if (available.includes(RESERVED_ACCOUNT_NUMBER_MIGRATION)) {
    if (!available.includes(ACCOUNT_NUMBERS_MIGRATION))
      throw new Error('Reserved account number dependencies are missing from this release.');
    verifyAdditiveMetadata(
      pending,
      RESERVED_ACCOUNT_NUMBER_MIGRATION,
      identitySchema.reservedAccountNumber ?? [],
      2,
      'Reserved account number schema drift detected; refusing to repair it automatically.',
    );
  }
  const socialAvailable = available.includes(VOICE_SOCIAL_MIGRATION);
  if (available.includes(EXCLUSIVE_FRAMES_MIGRATION)) {
    if (
      !available.includes(RESERVED_ACCOUNT_NUMBER_MIGRATION) ||
      !available.includes(COMMUNITY_IDENTITY_MIGRATION)
    )
      throw new Error('Exclusive frame dependencies are missing from this release.');
    verifyAdditiveMetadata(
      pending,
      EXCLUSIVE_FRAMES_MIGRATION,
      identitySchema.exclusiveFrames ?? [],
      2,
      'Exclusive frame schema drift detected; refusing to repair it automatically.',
    );
  }
  if (available.includes(EXCLUSIVE_ENTRANCES_MIGRATION)) {
    if (!available.includes(EXCLUSIVE_FRAMES_MIGRATION))
      throw new Error('Exclusive entrance dependencies are missing from this release.');
    verifyAdditiveMetadata(
      pending,
      EXCLUSIVE_ENTRANCES_MIGRATION,
      identitySchema.exclusiveEntrances ?? [],
      2,
      'Exclusive entrance schema drift detected; refusing to repair it automatically.',
    );
  }
  if (available.includes(VOICE_EMOJI_MIGRATION)) {
    if (!available.includes(VOICE_MIGRATION))
      throw new Error('Voice emoji dependencies are missing from this release.');
    verifyAdditiveMetadata(
      pending,
      VOICE_EMOJI_MIGRATION,
      identitySchema.voiceEmojis ?? [],
      9,
      'Voice emoji schema drift detected; refusing to repair it automatically.',
    );
  }
  if (available.includes(VOICE_MEDIA_RECONCILE_MIGRATION)) {
    if (!available.includes(VOICE_MIGRATION))
      throw new Error('Voice media reconciliation dependencies are missing from this release.');
    verifyAdditiveMetadata(
      pending,
      VOICE_MEDIA_RECONCILE_MIGRATION,
      identitySchema.voiceMediaReconcile ?? [],
      6,
      'Voice media reconciliation schema drift detected; refusing to repair it automatically.',
    );
  }
  if (available.includes(ACCOUNT_VOICE_OUTBOX_MIGRATION)) {
    if (!available.includes(VOICE_MEDIA_RECONCILE_MIGRATION))
      throw new Error('Account voice outbox dependencies are missing from this release.');
    verifyAdditiveMetadata(pending, ACCOUNT_VOICE_OUTBOX_MIGRATION,
      identitySchema.accountVoiceOutbox ?? [], 10,
      'Account voice outbox schema drift detected; refusing to repair it automatically.');
  }
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
    const tokenVersionGuard = await client.query(`SELECT
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'User' AND column_name = 'tokenVersion' AND data_type = 'integer'
        AND is_nullable = 'NO') AS token_version_column,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'User' AND column_name = 'status' AND is_nullable = 'NO') AS status_column,
      EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE t.tgrelid = to_regclass('"User"') AND t.tgname = 'User_increment_token_version'
        AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A') AND t.tgtype = 19
        AND t.tgqual IS NULL AND t.tgnargs = 0 AND t.tgconstraint = 0
        AND t.tgattr::text = ''
        AND n.nspname = current_schema() AND p.proname = 'increment_user_token_version_on_sensitive_change'
        AND p.pronargs = 0 AND p.prorettype = 'pg_catalog.trigger'::regtype) AS enabled_trigger,
      (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = current_schema() AND p.proname = 'increment_user_token_version_on_sensitive_change'
        AND p.pronargs = 0 AND p.prorettype = 'pg_catalog.trigger'::regtype) AS function_source`);
    assertTokenVersionGuard(tokenVersionGuard.rows[0]);
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
    const reserved = await client.query(`SELECT
      EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema()
        AND c.relname = 'User' AND k.conname = 'User_accountNumber_range_check'
        AND position('cmrw9rfv9000204l72z55ai5b' IN pg_get_constraintdef(k.oid)) > 0
        AND position('cmupvygjx000204jq4bir1i4x' IN pg_get_constraintdef(k.oid)) > 0) AS constraint_present,
      EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = current_schema() AND p.proname = 'assign_user_account_number'
        AND position('cmrw9rfv9000204l72z55ai5b' IN pg_get_functiondef(p.oid)) > 0
        AND position('cmupvygjx000204jq4bir1i4x' IN pg_get_functiondef(p.oid)) > 0) AS function_present`);
    const exclusive = await client.query(`SELECT EXISTS(
      SELECT 1 FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema()
      AND c.relname = name AND k.conname = name || '_exclusive_frames_check'
    ) AS present FROM unnest(ARRAY['UserCosmetic', 'ProfileCosmetic']) AS name`);
    const entrances = await client.query(`SELECT EXISTS(
      SELECT 1 FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema()
      AND c.relname = name AND k.conname = name || '_exclusive_entrances_check'
    ) AS present FROM unnest(ARRAY['UserCosmetic', 'ProfileCosmetic']) AS name`);
    const community = await client.query(
      'SELECT to_regclass(quote_ident(name)) IS NOT NULL AS present FROM unnest($1::text[]) AS name',
      [COMMUNITY_TABLES],
    );
    const communityProfile = await client.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Profile' AND column_name = name) AS present FROM unnest($1::text[]) AS name`,
      [COMMUNITY_PROFILE_COLUMNS],
    );
    const emojis = await client.query(`SELECT
      to_regclass('"VoiceEmojiPack"') IS NOT NULL AS packs,
      to_regclass('"VoiceEmoji"') IS NOT NULL AS emojis,
      to_regclass('"VoiceChatCommand"') IS NOT NULL AS receipts,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'VoiceEmoji' AND column_name = 'content' AND data_type = 'bytea') AS content,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'VoiceEmoji' AND column_name = 'poster' AND data_type = 'bytea') AS poster,
      to_regclass('"VoiceEmoji_packId_idx"') IS NOT NULL AS pack_index,
      to_regclass('"VoiceChatCommand_pkey"') IS NOT NULL AS receipt_index,
      EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('"VoiceEmoji"')
        AND confrelid = to_regclass('"VoiceEmojiPack"') AND contype = 'f') AS pack_fk,
      EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('"VoiceChatCommand"')
        AND confrelid = to_regclass('"VoiceRoom"') AND contype = 'f') AS room_fk`);
    const mediaReconcile = await client.query(`SELECT
      to_regclass('"VoiceMediaReconcileJob"') IS NOT NULL AS table_present,
      (SELECT count(*) = 7 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'VoiceMediaReconcileJob' AND (column_name, data_type, is_nullable) IN (
          ('roomId', 'text', 'NO'), ('generation', 'text', 'NO'), ('attempts', 'integer', 'NO'),
          ('nextAttemptAt', 'timestamp without time zone', 'NO'),
          ('leaseToken', 'text', 'YES'), ('leaseExpiresAt', 'timestamp without time zone', 'YES'),
          ('updatedAt', 'timestamp without time zone', 'NO')
        )) AS columns_present,
      (to_regclass('"VoiceMediaReconcileJob_pkey"') IS NOT NULL AND
       to_regclass('"VoiceMediaReconcileJob_nextAttemptAt_leaseExpiresAt_idx"') IS NOT NULL) AS indexes_present,
      EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('"VoiceMediaReconcileJob"')
        AND confrelid = to_regclass('"VoiceRoom"') AND contype = 'f') AS room_fk,
      EXISTS(SELECT 1 FROM pg_class WHERE oid = to_regclass('"VoiceMediaReconcileJob"')
        AND relrowsecurity) AS rls_enabled,
      (to_regclass('"VoiceMediaReconcileJob"') IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM pg_policy WHERE polrelid = to_regclass('"VoiceMediaReconcileJob"')
      )) AS no_public_policies`);
    const accountOutbox = await client.query(`SELECT
      to_regclass('"AccountVoiceOutbox"') IS NOT NULL AS table_present,
      (SELECT count(*) = 7 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'AccountVoiceOutbox' AND (column_name, data_type, is_nullable) IN (
          ('id', 'bigint', 'NO'), ('userId', 'text', 'NO'), ('createdAt', 'timestamp without time zone', 'NO'),
          ('attempts', 'integer', 'NO'), ('nextAttemptAt', 'timestamp without time zone', 'NO'),
          ('cursorRoomId', 'text', 'YES'), ('hadBusyRoom', 'boolean', 'NO')
        )) AS columns_present,
      (to_regclass('"AccountVoiceOutbox_pkey"') IS NOT NULL AND to_regclass('"AccountVoiceOutbox_userId_idx"') IS NOT NULL AND to_regclass('"AccountVoiceOutbox_nextAttemptAt_id_idx"') IS NOT NULL) AS indexes_present,
      to_regclass('"AccountVoiceOutbox_id_seq"') IS NOT NULL AS sequence_present,
      EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE t.tgrelid = to_regclass('"User"') AND t.tgname = 'User_account_voice_outbox'
        AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A') AND t.tgtype = 17
        AND t.tgqual IS NOT NULL AND t.tgnargs = 0 AND t.tgconstraint = 0 AND t.tgattr::text = ''
        AND n.nspname = current_schema() AND p.proname = 'enqueue_account_voice_reconcile'
        AND p.pronargs = 0 AND p.prorettype = 'pg_catalog.trigger'::regtype) AS trigger_present,
      EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = current_schema() AND p.proname = 'enqueue_account_voice_reconcile') AS function_present,
      (SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE t.tgrelid = to_regclass('"User"') AND t.tgname = 'User_account_voice_outbox' AND NOT t.tgisinternal) AS trigger_definition,
      (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = current_schema() AND p.proname = 'enqueue_account_voice_reconcile' AND p.pronargs = 0 AND p.prorettype = 'pg_catalog.trigger'::regtype) AS function_source,
      (EXISTS(SELECT 1 FROM pg_class WHERE oid = to_regclass('"AccountVoiceOutbox"') AND relrowsecurity)
       AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid = to_regclass('"AccountVoiceOutbox"'))
       AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE((SELECT relacl FROM pg_class WHERE oid = to_regclass('"AccountVoiceOutbox"')), acldefault('r', (SELECT relowner FROM pg_class WHERE oid = to_regclass('"AccountVoiceOutbox"'))))) a WHERE a.grantee = 0)
       AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND has_table_privilege(r.oid, to_regclass('"AccountVoiceOutbox"'), 'SELECT,INSERT,UPDATE,DELETE'))) AS rls_private,
      to_regclass('"AccountVoiceOutboxRoom"') IS NOT NULL AS room_table,
      (to_regclass('"AccountVoiceOutboxRoom_pkey"') IS NOT NULL AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('"AccountVoiceOutboxRoom"') AND confrelid = to_regclass('"AccountVoiceOutbox"') AND contype = 'f' AND confdeltype = 'c')) AS room_constraints,
      (EXISTS(SELECT 1 FROM pg_class WHERE oid = to_regclass('"AccountVoiceOutboxRoom"') AND relrowsecurity)
       AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid = to_regclass('"AccountVoiceOutboxRoom"'))
       AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE((SELECT relacl FROM pg_class WHERE oid = to_regclass('"AccountVoiceOutboxRoom"')), acldefault('r', (SELECT relowner FROM pg_class WHERE oid = to_regclass('"AccountVoiceOutboxRoom"'))))) a WHERE a.grantee = 0)
       AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND has_table_privilege(r.oid, to_regclass('"AccountVoiceOutboxRoom"'), 'SELECT,INSERT,UPDATE,DELETE'))) AS room_private`);
    const { trigger_definition, function_source, ...accountOutboxFlags } = accountOutbox.rows[0];
    accountOutboxFlags.trigger_present = isAccountVoiceOutboxTriggerValid({
      enabled_trigger: accountOutboxFlags.trigger_present, trigger_definition, function_source,
    });
    plan = voiceMigrationPlan(
      available,
      rows,
      result.rows.map((row) => row.present),
      profile.rows.map((row) => row.present),
      {
        accountNumber: Object.values(account.rows[0]),
        reservedAccountNumber: Object.values(reserved.rows[0]),
        exclusiveFrames: exclusive.rows.map((row) => row.present),
        exclusiveEntrances: entrances.rows.map((row) => row.present),
        communityTables: community.rows.map((row) => row.present),
        communityProfileColumns: communityProfile.rows.map((row) => row.present),
        voiceEmojis: Object.values(emojis.rows[0]),
        voiceMediaReconcile: Object.values(mediaReconcile.rows[0]),
        accountVoiceOutbox: Object.values(accountOutboxFlags),
      },
    );
  } finally {
    await client.end();
  }
  if (plan === 'ready') {
    console.log('Voice/profile/community schema is already present.');
    return;
  }
  console.log('Applying the reviewed allowlisted voice/profile/community migrations.');
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
        'Reserved account number schema drift detected; refusing to repair it automatically.',
        'Reserved account number dependencies are missing from this release.',
        'Exclusive frame schema drift detected; refusing to repair it automatically.',
        'Exclusive frame dependencies are missing from this release.',
        'Exclusive entrance schema drift detected; refusing to repair it automatically.',
        'Exclusive entrance dependencies are missing from this release.',
        'Community schema drift detected; refusing to repair it automatically.',
        'Community profile schema drift detected; refusing to repair it automatically.',
        'Community schema dependencies are missing from this release.',
        'Unrelated migrations are pending; this release will not apply them.',
        'Partial voice tables exist without a completed migration.',
        'The production database is not configured.',
        'Voice schema migration did not complete.',
        'Voice emoji dependencies are missing from this release.',
        'Voice emoji schema drift detected; refusing to repair it automatically.',
        'Voice media reconciliation dependencies are missing from this release.',
        'Voice media reconciliation schema drift detected; refusing to repair it automatically.',
        'Account voice outbox dependencies are missing from this release.',
        'Account voice outbox schema drift detected; refusing to repair it automatically.',
        'User token version guard is missing, disabled, or has unexpected behavior.',
      ].includes(error.message);
    console.error(
      safe
        ? error.message
        : 'Production voice schema preflight failed; no automatic repair was attempted.',
    );
    process.exitCode = 1;
  });

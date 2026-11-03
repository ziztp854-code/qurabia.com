import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  voiceMigrationPlan,
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
  assertTokenVersionGuard,
  isAccountVoiceOutboxTriggerValid,
} from './voice-production-schema.mjs';

const old = '20260101000000_existing_schema';
const complete = (migration_name) => ({
  migration_name,
  finished_at: new Date(),
  rolled_back_at: null,
});

test('requires the precise normal-mode account outbox trigger and function', () => {
  const valid = {
    enabled_trigger: true,
    trigger_definition: 'CREATE TRIGGER "User_account_voice_outbox" AFTER UPDATE ON public."User" FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) OR (old."tokenVersion" IS DISTINCT FROM new."tokenVersion"))) EXECUTE FUNCTION enqueue_account_voice_reconcile()',
    function_source: `BEGIN
  INSERT INTO "AccountVoiceOutbox" ("userId") VALUES (NEW."id");
  RETURN NEW;
END;`,
  };
  assert.equal(isAccountVoiceOutboxTriggerValid(valid), true);
  assert.equal(isAccountVoiceOutboxTriggerValid({ ...valid, enabled_trigger: false }), false);
  assert.equal(isAccountVoiceOutboxTriggerValid({ ...valid, trigger_definition: valid.trigger_definition.replace(' OR ', ' AND ') }), false);
  assert.equal(isAccountVoiceOutboxTriggerValid({ ...valid, function_source: 'BEGIN RETURN NEW; END;' }), false);
  assert.equal(isAccountVoiceOutboxTriggerValid(null), false);
  const migration = readFileSync(new URL('../prisma/migrations/20261103000000_account_voice_outbox/migration.sql', import.meta.url), 'utf8');
  const body = migration.match(/CREATE FUNCTION enqueue_account_voice_reconcile\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)?.[1];
  assert.ok(body);
  assert.equal(isAccountVoiceOutboxTriggerValid({ ...valid, function_source: body }), true);
});

test('requires the enabled User status-change token version trigger and exact function', () => {
  const valid = {
    token_version_column: true,
    status_column: true,
    enabled_trigger: true,
    function_source: `BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."role" IS DISTINCT FROM OLD."role"
    OR NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash"
  THEN
    NEW."tokenVersion" := OLD."tokenVersion" + 1;
  END IF;

  RETURN NEW;
END;`,
  };
  assert.doesNotThrow(() => assertTokenVersionGuard(valid));
  const migration = readFileSync(new URL('../prisma/migrations/20260722090000_user_token_version/migration.sql', import.meta.url), 'utf8');
  const migrationBody = migration.match(/AS \$\$([\s\S]*?)\$\$;/)?.[1];
  assert.ok(migrationBody);
  assert.doesNotThrow(() => assertTokenVersionGuard({ ...valid, function_source: migrationBody }));
  for (const key of ['token_version_column', 'status_column', 'enabled_trigger']) {
    assert.throws(() => assertTokenVersionGuard({ ...valid, [key]: false }), /token version guard/);
  }
  assert.throws(() => assertTokenVersionGuard({ ...valid, function_source: 'BEGIN RETURN NEW; END;' }), /token version guard/);
  assert.throws(() => assertTokenVersionGuard({ ...valid, function_source: valid.function_source.replaceAll('"status"', '"Status"') }), /token version guard/);
  assert.throws(() => assertTokenVersionGuard({ ...valid, function_source: valid.function_source.replaceAll('"status"', '"sta tus"') }), /token version guard/);
  assert.throws(() => assertTokenVersionGuard(null), /token version guard/);
});

test('allows only absent additive profile columns; rejects partial or missing applied columns', () => {
  const available = [old, VOICE_MIGRATION, VOICE_SOCIAL_MIGRATION, PROFILE_IDENTITY_MIGRATION];
  const rows = [complete(old), complete(VOICE_MIGRATION), complete(VOICE_SOCIAL_MIGRATION)];
  assert.equal(voiceMigrationPlan(available, rows, [...present, true], [false, false]), 'apply');
  assert.equal(
    voiceMigrationPlan(
      available,
      [...rows, complete(PROFILE_IDENTITY_MIGRATION)],
      [...present, true],
      [true, true],
    ),
    'ready',
  );
  assert.throws(
    () => voiceMigrationPlan(available, rows, [...present, true], [true, false]),
    /Profile schema drift/,
  );
  assert.throws(
    () =>
      voiceMigrationPlan(
        available,
        [...rows, complete(PROFILE_IDENTITY_MIGRATION)],
        [...present, true],
        [false, false],
      ),
    /Profile schema drift/,
  );
  assert.throws(
    () => voiceMigrationPlan([...available, 'unrelated'], rows, [...present, true], [false, false]),
    /Unrelated migrations/,
  );
});
const absent = [false, false, false, false];
const present = [true, true, true, true];

test('checks all account outbox metadata before and after its migration', () => {
  const prior = [old, VOICE_MIGRATION, VOICE_MEDIA_RECONCILE_MIGRATION];
  const available = [...prior, ACCOUNT_VOICE_OUTBOX_MIGRATION];
  const plan = (applied, accountVoiceOutbox) => voiceMigrationPlan(available, applied.map(complete), present, [], {
    voiceMediaReconcile: Array(6).fill(true), accountVoiceOutbox,
  });
  assert.equal(plan(prior, Array(10).fill(false)), 'apply');
  assert.equal(plan(available, Array(10).fill(true)), 'ready');
  for (let i = 0; i < 10; i++) {
    const before = Array(10).fill(false); before[i] = true;
    const after = Array(10).fill(true); after[i] = false;
    assert.throws(() => plan(prior, before), /Account voice outbox schema drift/);
    assert.throws(() => plan(available, after), /Account voice outbox schema drift/);
  }
});

test('permits the reviewed media-reconciliation queue only when its metadata is complete', () => {
  const previous = [old, VOICE_MIGRATION];
  const available = [...previous, VOICE_MEDIA_RECONCILE_MIGRATION];
  const plan = (applied, voiceMediaReconcile) =>
    voiceMigrationPlan(available, applied.map(complete), present, [], { voiceMediaReconcile });
  assert.equal(plan(previous, Array(6).fill(false)), 'apply');
  assert.equal(plan(available, Array(6).fill(true)), 'ready');
  for (let i = 0; i < 6; i++) {
    const unexpected = Array(6).fill(false);
    unexpected[i] = true;
    const missing = Array(6).fill(true);
    missing[i] = false;
    assert.throws(() => plan(previous, unexpected), /Voice media reconciliation schema drift/);
    assert.throws(() => plan(available, missing), /Voice media reconciliation schema drift/);
  }
  assert.throws(() => plan(previous, []), /Voice media reconciliation schema drift/);
});

test('allows the reviewed emoji migration and refuses partial or missing emoji structures', () => {
  const previous = [old, VOICE_MIGRATION];
  const available = [...previous, VOICE_EMOJI_MIGRATION];
  const plan = (applied, voiceEmojis) =>
    voiceMigrationPlan(available, applied.map(complete), present, [], { voiceEmojis });
  assert.equal(plan(previous, Array(9).fill(false)), 'apply');
  assert.equal(plan(available, Array(9).fill(true)), 'ready');
  assert.throws(() => plan(previous, []), /Voice emoji schema drift/);
  for (let index = 0; index < 9; index++) {
    const before = Array(9).fill(false);
    before[index] = true;
    const after = Array(9).fill(true);
    after[index] = false;
    assert.throws(() => plan(previous, before), /Voice emoji schema drift/);
    assert.throws(() => plan(available, after), /Voice emoji schema drift/);
  }
  assert.throws(
    () =>
      voiceMigrationPlan([old, VOICE_EMOJI_MIGRATION], [complete(old)], present, [], {
        voiceEmojis: Array(9).fill(false),
      }),
    /Voice emoji dependencies/,
  );
  assert.throws(
    () =>
      voiceMigrationPlan(
        [...available, '20990101000000_unreviewed'],
        previous.map(complete),
        present,
        [],
        { voiceEmojis: Array(9).fill(false) },
      ),
    /Unrelated migrations/,
  );
});

test('permits only the single additive voice migration and recognizes an already-applied schema', () => {
  assert.equal(voiceMigrationPlan([old, VOICE_MIGRATION], [complete(old)], absent), 'apply');
  assert.equal(
    voiceMigrationPlan([old, VOICE_MIGRATION], [complete(old), complete(VOICE_MIGRATION)], present),
    'ready',
  );
});
test('refuses an empty or outdated production database instead of applying unrelated migrations', () => {
  assert.throws(
    () => voiceMigrationPlan([old, VOICE_MIGRATION], [], absent),
    /Unrelated migrations/,
  );
  assert.throws(
    () =>
      voiceMigrationPlan(
        [old, '20261019000000_other_change', VOICE_MIGRATION],
        [complete(old)],
        absent,
      ),
    /Unrelated migrations/,
  );
});
test('refuses incomplete migrations and schema drift without a reset or automatic repair', () => {
  assert.throws(
    () =>
      voiceMigrationPlan(
        [old, VOICE_MIGRATION],
        [
          complete(old),
          { migration_name: VOICE_MIGRATION, finished_at: null, rolled_back_at: null },
        ],
        absent,
      ),
    /unfinished/,
  );
  assert.throws(
    () => voiceMigrationPlan([old, VOICE_MIGRATION], [complete(old)], [true, false, false, false]),
    /Partial/,
  );
  assert.throws(
    () =>
      voiceMigrationPlan(
        [old, VOICE_MIGRATION],
        [complete(old), complete(VOICE_MIGRATION)],
        absent,
      ),
    /drift/,
  );
});

test('allows the additive private-message table only after checking the base schema', () => {
  const available = [old, VOICE_MIGRATION, VOICE_SOCIAL_MIGRATION];
  const base = [complete(old), complete(VOICE_MIGRATION)];
  assert.equal(voiceMigrationPlan(available, base, [...present, false]), 'apply');
  assert.equal(
    voiceMigrationPlan(available, [...base, complete(VOICE_SOCIAL_MIGRATION)], [...present, true]),
    'ready',
  );
  assert.throws(() => voiceMigrationPlan(available, base, [...present, true]), /drift/);
  assert.throws(() => voiceMigrationPlan(available, base, [...absent, false]), /Partial/);
});

const live = [old, VOICE_MIGRATION, VOICE_SOCIAL_MIGRATION, PROFILE_IDENTITY_MIGRATION];
const communityRelease = [...live, ACCOUNT_NUMBERS_MIGRATION, COMMUNITY_IDENTITY_MIGRATION];
const identityMetadata = (account, community) => ({
  accountNumber: Array(5).fill(account),
  communityTables: Array(5).fill(community),
  communityProfileColumns: Array(9).fill(community),
});

test('permits the two known community migrations over the intact live voice/profile schema', () => {
  assert.equal(
    voiceMigrationPlan(
      communityRelease,
      live.map(complete),
      [...present, true],
      [true, true],
      identityMetadata(false, false),
    ),
    'apply',
  );
  assert.equal(
    voiceMigrationPlan(
      communityRelease,
      [...live, ACCOUNT_NUMBERS_MIGRATION].map(complete),
      [...present, true],
      [true, true],
      identityMetadata(true, false),
    ),
    'apply',
  );
  assert.equal(
    voiceMigrationPlan(
      communityRelease,
      communityRelease.map(complete),
      [...present, true],
      [true, true],
      identityMetadata(true, true),
    ),
    'ready',
  );
});

test('refuses partial account-number columns, indexes, sequence, trigger or constraint', () => {
  for (let index = 0; index < 5; index += 1) {
    const before = identityMetadata(false, false);
    before.accountNumber[index] = true;
    assert.throws(
      () =>
        voiceMigrationPlan(
          communityRelease,
          live.map(complete),
          [...present, true],
          [true, true],
          before,
        ),
      /Account number schema drift/,
    );
    const after = identityMetadata(true, true);
    after.accountNumber[index] = false;
    assert.throws(
      () =>
        voiceMigrationPlan(
          communityRelease,
          communityRelease.map(complete),
          [...present, true],
          [true, true],
          after,
        ),
      /Account number schema drift/,
    );
  }
});

test('refuses any partial or missing community table instead of repairing live structures', () => {
  for (let index = 0; index < 5; index += 1) {
    const before = identityMetadata(false, false);
    before.communityTables[index] = true;
    assert.throws(
      () =>
        voiceMigrationPlan(
          communityRelease,
          live.map(complete),
          [...present, true],
          [true, true],
          before,
        ),
      /Community schema drift/,
    );
    const after = identityMetadata(true, true);
    after.communityTables[index] = false;
    assert.throws(
      () =>
        voiceMigrationPlan(
          communityRelease,
          communityRelease.map(complete),
          [...present, true],
          [true, true],
          after,
        ),
      /Community schema drift/,
    );
  }
});

test('refuses partial community profile fields and fails closed when metadata is unavailable', () => {
  for (let index = 0; index < 9; index += 1) {
    const metadata = identityMetadata(false, false);
    metadata.communityProfileColumns[index] = true;
    assert.throws(
      () =>
        voiceMigrationPlan(
          communityRelease,
          live.map(complete),
          [...present, true],
          [true, true],
          metadata,
        ),
      /Community profile schema drift/,
    );
  }
  assert.throws(
    () =>
      voiceMigrationPlan(communityRelease, live.map(complete), [...present, true], [true, true]),
    /Account number schema drift/,
  );
});

test('never automatically repairs a failed community migration or applies an unrelated pending migration', () => {
  assert.throws(
    () =>
      voiceMigrationPlan(
        communityRelease,
        [
          ...live.map(complete),
          { migration_name: ACCOUNT_NUMBERS_MIGRATION, finished_at: null, rolled_back_at: null },
        ],
        [...present, true],
        [true, true],
        identityMetadata(false, false),
      ),
    /unfinished/,
  );
  assert.throws(
    () =>
      voiceMigrationPlan(
        [...communityRelease, '20990101000000_unreviewed'],
        live.map(complete),
        [...present, true],
        [true, true],
        identityMetadata(false, false),
      ),
    /Unrelated migrations/,
  );
  assert.throws(
    () =>
      voiceMigrationPlan(
        communityRelease.filter((name) => name !== ACCOUNT_NUMBERS_MIGRATION),
        live.map(complete),
        [...present, true],
        [true, true],
        identityMetadata(false, false),
      ),
    /dependencies/,
  );
});

test('new community permission does not relax missing legacy voice or profile guards', () => {
  assert.throws(
    () =>
      voiceMigrationPlan(
        communityRelease,
        live.map(complete),
        [...absent, true],
        [true, true],
        identityMetadata(false, false),
      ),
    /Partial voice tables/,
  );
  assert.throws(
    () =>
      voiceMigrationPlan(
        communityRelease,
        live.map(complete),
        [...present, true],
        [false, true],
        identityMetadata(false, false),
      ),
    /Profile schema drift/,
  );
});

test('allows the reviewed reserved-ID migration only with intact identity metadata', () => {
  const available = [...communityRelease, RESERVED_ACCOUNT_NUMBER_MIGRATION];
  const plan = (applied, flags) =>
    voiceMigrationPlan(available, applied.map(complete), [...present, true], [true, true], {
      ...identityMetadata(true, true),
      reservedAccountNumber: flags,
    });
  assert.equal(plan(communityRelease, [false, false]), 'apply');
  assert.equal(plan(available, [true, true]), 'ready');
  for (const flags of [[], [true, false], [false, true]]) {
    assert.throws(() => plan(communityRelease, flags), /Reserved account number schema drift/);
    assert.throws(() => plan(available, flags), /Reserved account number schema drift/);
  }
  assert.throws(() => plan(communityRelease, [true, true]), /Reserved account number schema drift/);
  assert.throws(() => plan(available, [false, false]), /Reserved account number schema drift/);
  assert.throws(
    () =>
      voiceMigrationPlan(
        [...live, RESERVED_ACCOUNT_NUMBER_MIGRATION],
        live.map(complete),
        [...present, true],
        [true, true],
      ),
    /Reserved account number dependencies/,
  );
});

test('guards the exclusive-frame release against partial metadata and missing dependencies', () => {
  const previous = [...communityRelease, RESERVED_ACCOUNT_NUMBER_MIGRATION];
  const available = [...previous, EXCLUSIVE_FRAMES_MIGRATION];
  const plan = (applied, exclusiveFrames) =>
    voiceMigrationPlan(available, applied.map(complete), [...present, true], [true, true], {
      ...identityMetadata(true, true),
      reservedAccountNumber: [true, true],
      exclusiveFrames,
    });
  assert.equal(plan(previous, [false, false]), 'apply');
  assert.equal(plan(available, [true, true]), 'ready');
  for (const flags of [[], [true, false], [false, true]]) {
    assert.throws(() => plan(previous, flags), /Exclusive frame schema drift/);
    assert.throws(() => plan(available, flags), /Exclusive frame schema drift/);
  }
  assert.throws(
    () =>
      voiceMigrationPlan(
        [...communityRelease, EXCLUSIVE_FRAMES_MIGRATION],
        communityRelease.map(complete),
        [...present, true],
        [true, true],
        identityMetadata(true, true),
      ),
    /Exclusive frame dependencies/,
  );
});

test('checks exclusive entrance metadata independently of the frame migration', () => {
  const previous = [
    ...communityRelease,
    RESERVED_ACCOUNT_NUMBER_MIGRATION,
    EXCLUSIVE_FRAMES_MIGRATION,
  ];
  const available = [...previous, EXCLUSIVE_ENTRANCES_MIGRATION];
  const plan = (applied, exclusiveEntrances) =>
    voiceMigrationPlan(available, applied.map(complete), [...present, true], [true, true], {
      ...identityMetadata(true, true),
      reservedAccountNumber: [true, true],
      exclusiveFrames: [true, true],
      exclusiveEntrances,
    });
  assert.equal(plan(previous, [false, false]), 'apply');
  assert.equal(plan(available, [true, true]), 'ready');
  for (const flags of [[], [true, false], [false, true]]) {
    assert.throws(() => plan(previous, flags), /Exclusive entrance schema drift/);
    assert.throws(() => plan(available, flags), /Exclusive entrance schema drift/);
  }
  assert.throws(
    () =>
      voiceMigrationPlan(
        [...communityRelease, EXCLUSIVE_ENTRANCES_MIGRATION],
        communityRelease.map(complete),
        [...present, true],
        [true, true],
        identityMetadata(true, true),
      ),
    /Exclusive entrance dependencies/,
  );
});

test('preview and non-enabled builds skip without reading or migrating a database', () => {
  for (const flags of [
    { VERCEL_ENV: 'preview', VOICE_SCHEMA_DEPLOY: '1' },
    { VERCEL_ENV: 'production', VOICE_SCHEMA_DEPLOY: '0' },
  ]) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./voice-production-schema.mjs', import.meta.url))],
      {
        env: { ...process.env, ...flags, DIRECT_URL: '', DATABASE_URL: '' },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /skipped outside the enabled production build/);
  }
});

test('the generic migration wrapper still honors SKIP_DB_MIGRATE independently', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./db-migrate-deploy.mjs', import.meta.url))],
    {
      env: {
        ...process.env,
        SKIP_DB_MIGRATE: '1',
        VERCEL_ENV: 'production',
        DIRECT_URL: '',
        DATABASE_URL: '',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0);
  assert.match(result.stderr, /SKIP_DB_MIGRATE=1/);
});

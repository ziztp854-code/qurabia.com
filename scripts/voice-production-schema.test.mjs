import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  voiceMigrationPlan,
  VOICE_MIGRATION,
  VOICE_SOCIAL_MIGRATION,
  PROFILE_IDENTITY_MIGRATION,
  ACCOUNT_NUMBERS_MIGRATION,
  COMMUNITY_IDENTITY_MIGRATION,
} from './voice-production-schema.mjs';

const old = '20260101000000_existing_schema';
const complete = (migration_name) => ({
  migration_name,
  finished_at: new Date(),
  rolled_back_at: null,
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

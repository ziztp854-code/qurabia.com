import assert from 'node:assert/strict';
import test from 'node:test';
import {
  voiceMigrationPlan,
  VOICE_MIGRATION,
  VOICE_SOCIAL_MIGRATION,
} from './voice-production-schema.mjs';

const old = '20260101000000_existing_schema';
const complete = (migration_name) => ({
  migration_name,
  finished_at: new Date(),
  rolled_back_at: null,
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

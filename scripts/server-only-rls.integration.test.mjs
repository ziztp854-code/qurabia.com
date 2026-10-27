import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const targets = [
  'AuditLog',
  'Category',
  'CommunityBadge',
  'CommunityVoiceRoom',
  'KingdomReportEntry',
  'LadderQuestion',
  'LadderRoom',
  'LadderTeam',
  'LiveAnswer',
  'LiveParticipant',
  'LiveParticipantConnection',
  'LiveSession',
  'MafiaAction',
  'MafiaGame',
  'MafiaMessage',
  'MafiaParticipant',
  'MafiaVote',
  'ProfileCosmetic',
  'QuestionTag',
  'ScrambledWordsPuzzle',
  'SubscriptionStamp',
  'UsageCounter',
  'UserBadge',
  'UserCosmetic',
  'UserSubscription',
  'VoiceChatCommand',
  'VoiceCover',
  'VoiceDirectMessage',
  'VoiceEmoji',
  'VoiceEmojiPack',
  'VoicePreference',
  'VoiceReport',
  'VoiceRoom',
  '_AnalysisSnapshot',
  '_CurationReport',
  '_prisma_migrations',
];
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const migration = new URL(
  '../supabase/migrations/20261027020637_secure_server_only_application_tables.sql',
  import.meta.url,
);

test('server-only tables deny every client operation and preserve backend controls', async () => {
  const connectionString = process.env.RLS_TEST_DATABASE_URL;
  assert.ok(connectionString, 'RLS_TEST_DATABASE_URL is required');
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'local test database only');
  assert.equal(url.pathname, '/voice_test_rls_acl');
  assert.equal(url.search, '');
  const db = new pg.Client({ connectionString });
  await db.connect();
  try {
    await db.query('BEGIN');
    const occupied = await db.query(
      "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'",
    );
    assert.equal(occupied.rows[0].count, 0, 'requires disposable empty test database');
    for (const name of ['anon', 'authenticated', 'service_role']) {
      const role = await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name]);
      if (!role.rowCount)
        await db.query(
          'CREATE ROLE ' + quote(name) + ' NOLOGIN' + (name === 'service_role' ? ' BYPASSRLS' : ''),
        );
    }
    await db.query(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role',
    );
    for (const table of targets) {
      await db.query(
        'CREATE TABLE public.' + quote(table) + ' (id text PRIMARY KEY, note text NOT NULL)',
      );
      await db.query('INSERT INTO public.' + quote(table) + " VALUES ('control', 'backend')");
      // Exercise inherited PUBLIC privileges as well as direct grants.
      await db.query(
        'GRANT ALL ON public.' + quote(table) + ' TO PUBLIC, anon, authenticated, service_role',
      );
    }
    const sql = await readFile(migration, 'utf8');
    await db.query(sql);
    await db.query(sql); // Reapplying the repair is safe.
    for (const table of targets) {
      const flags = await db.query(
        'SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',
        ['public.' + quote(table)],
      );
      assert.deepEqual(flags.rows[0], { relrowsecurity: true, relforcerowsecurity: false }, table);
      for (const role of ['anon', 'authenticated']) {
        const privileges = await db.query(
          "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS any_table, has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') AS any_column",
          [role, 'public.' + quote(table)],
        );
        assert.deepEqual(
          privileges.rows[0],
          { any_table: false, any_column: false },
          role + ':' + table,
        );
        for (const command of [
          'SELECT id FROM public.' + quote(table) + ' WHERE false',
          'INSERT INTO public.' + quote(table) + " VALUES ('denied', 'denied')",
          'UPDATE public.' + quote(table) + ' SET note=note WHERE false',
          'DELETE FROM public.' + quote(table) + ' WHERE false',
          'TRUNCATE public.' + quote(table),
        ]) {
          await db.query('SAVEPOINT denied_operation');
          await db.query('SET LOCAL ROLE ' + quote(role));
          let sqlState;
          try {
            await db.query(command);
          } catch (error) {
            sqlState = error.code;
          }
          await db.query('ROLLBACK TO SAVEPOINT denied_operation');
          assert.equal(sqlState, '42501', role + ':' + command);
        }
      }
      // Owner controls read actual fixture data and perform a reversible write.
      const ownerWrite = await db.query(
        'UPDATE public.' +
          quote(table) +
          " SET note='owner-verified' WHERE id='control' RETURNING note",
      );
      assert.equal(ownerWrite.rows[0].note, 'owner-verified');
      await db.query('SET LOCAL ROLE service_role');
      const serviceWrite = await db.query(
        'UPDATE public.' +
          quote(table) +
          " SET note='service-verified' WHERE id='control' RETURNING note",
      );
      assert.equal(serviceWrite.rows[0].note, 'service-verified');
      await db.query('RESET ROLE');
    }
    await db.query('CREATE TABLE public.rls_future_table_probe (id int)');
    for (const role of ['anon', 'authenticated']) {
      const future = await db.query(
        "SELECT has_table_privilege($1,'public.rls_future_table_probe','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed",
        [role],
      );
      assert.equal(future.rows[0].allowed, false, role + ':future default');
    }
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});

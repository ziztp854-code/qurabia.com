import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMigrationUrl } from './deploy-migrations.mjs';

test('uses an explicit direct connection when available', () => {
  const direct = 'postgresql://user:password@db.example.com:5432/app';
  assert.equal(resolveMigrationUrl({ DIRECT_URL: direct, DATABASE_URL: 'invalid' }), direct);
});

test('uses the Supabase session pooler for migrations', () => {
  const connection = resolveMigrationUrl({
    DATABASE_URL:
      'postgresql://postgres.project:password@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require',
  });
  const parsed = new URL(connection);
  assert.equal(parsed.port, '5432');
  assert.equal(parsed.searchParams.has('pgbouncer'), false);
  assert.equal(parsed.searchParams.get('sslmode'), 'require');
});

test('rejects a missing database connection', () => {
  assert.throws(() => resolveMigrationUrl({}), /DIRECT_URL or DATABASE_URL/);
});

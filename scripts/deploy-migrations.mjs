import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveMigrationUrl(env) {
  const raw = env.DIRECT_URL || env.DATABASE_URL;
  if (!raw) throw new Error('DIRECT_URL or DATABASE_URL is required for migrations.');

  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('The migration connection must use PostgreSQL.');
  }
  if (!env.DIRECT_URL && url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543') {
    url.port = '5432';
    url.searchParams.delete('pgbouncer');
    return url.toString();
  }
  return raw;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const directUrl = resolveMigrationUrl(process.env);
  const result = spawnSync('corepack', ['pnpm', 'exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DIRECT_URL: directUrl },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

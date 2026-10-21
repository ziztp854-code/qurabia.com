/** Loopback-only Next server for the isolated approval load. Never deploy. */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'apps/web/package.json'));
const databaseUrl = process.env.VOICE_TEST_DATABASE_URL;
const database = new URL(databaseUrl || 'http://invalid');
if (
  process.env.VOICE_LOAD_RUN !== '1' ||
  !['postgres:', 'postgresql:'].includes(database.protocol) ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) ||
  !/^\/voice_test_load_approval_[a-zA-Z0-9_]+$/.test(database.pathname) ||
  database.search ||
  database.hash
)
  throw new Error('Requires an explicitly isolated loopback voice_test_load_approval_* database.');
const secret = process.env.VOICE_LOAD_AUTH_SECRET;
if (!secret || secret.length < 32) throw new Error('A temporary local auth secret is required.');
const origin = 'http://127.0.0.1:3117';
const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '-p', '3117'],
  {
    cwd: path.join(root, 'apps/web'),
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      MAMLUK_LOCAL_BUILD: '1', // Existing isolated distDir; also prevents root .env autoload.
      NEXT_TELEMETRY_DISABLED: '1',
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      NEXTAUTH_URL: origin,
      AUTH_URL: origin,
      NEXT_PUBLIC_SITE_URL: origin,
      AUTH_SECRET: secret,
      NEXTAUTH_SECRET: secret,
      RUN_AUTH_E2E: 'true',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      KV_REST_API_URL: '',
      KV_REST_API_TOKEN: '',
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: '',
      LIVEKIT_MODE: '',
      LIVEKIT_URL: '',
      LIVEKIT_INTERNAL_URL: '',
      LIVEKIT_API_KEY: '',
      LIVEKIT_API_SECRET: '',
      SENTRY_AUTH_TOKEN: '',
      SENTRY_SOURCE_MAPS_AUTH_TOKEN: '',
    },
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('Local load server could not start.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

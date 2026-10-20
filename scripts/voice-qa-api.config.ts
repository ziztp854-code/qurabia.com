// HTTP API tests only: this configuration never creates a browser/page fixture.
import path from 'node:path';

const databaseUrl = process.env.VOICE_TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error('Set VOICE_TEST_DATABASE_URL to an isolated local voice_test database.');
const target = new URL(databaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  !/^\/voice_test(?:_[a-zA-Z0-9_-]+)?$/.test(target.pathname) ||
  target.search ||
  target.hash
)
  throw new Error(
    'Voice API tests require an isolated loopback voice_test database without URL options.',
  );

const baseURL = 'http://127.0.0.1:3107';
export default {
  testDir: path.resolve(__dirname, '../apps/web/e2e'),
  testMatch: 'voice-api.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL },
  outputDir: path.resolve(__dirname, '../apps/web/test-results/voice-api'),
  webServer: {
    command: 'pnpm --filter @tahaddi/web exec next dev --hostname 127.0.0.1 -p 3107',
    cwd: path.resolve(__dirname, '..'),
    url: `${baseURL}/api/auth/csrf`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      NEXTAUTH_URL: baseURL,
      AUTH_URL: baseURL,
      NEXT_PUBLIC_SITE_URL: baseURL,
      AUTH_SECRET: 'voice-local-api-only-not-a-production-secret',
      NEXTAUTH_SECRET: 'voice-local-api-only-not-a-production-secret',
      RUN_AUTH_E2E: 'true',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      KV_REST_API_URL: '',
      KV_REST_API_TOKEN: '',
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: '',
      LIVEKIT_URL: '',
      LIVEKIT_API_KEY: '',
      LIVEKIT_API_SECRET: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
};

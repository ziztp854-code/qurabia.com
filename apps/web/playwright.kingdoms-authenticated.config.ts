import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error('Set KINGDOMS_TEST_DATABASE_URL to an isolated local kingdoms_test database.');
const target = new URL(databaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(target.pathname) ||
  target.search ||
  target.hash
) {
  throw new Error(
    'Authenticated Kingdoms tests require an isolated local kingdoms_test database without URL options.',
  );
}
const baseURL = 'http://127.0.0.1:3000';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'kingdoms-authenticated.spec.ts',
  fullyParallel: false,
  workers: 1,
  // The authenticated journey also recruits, assigns and returns a commander
  // using the real server clock; allow its round trip after the existing UI checks.
  timeout: 150000,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: './test-results/kingdoms-authenticated',
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 3000',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      NEXTAUTH_URL: baseURL,
      NEXT_PUBLIC_SITE_URL: baseURL,
      AUTH_URL: baseURL,
      AUTH_SECRET: 'kingdoms-isolated-e2e-only-not-a-production-secret',
      NEXTAUTH_SECRET: 'kingdoms-isolated-e2e-only-not-a-production-secret',
      RUN_AUTH_E2E: 'true',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      KV_REST_API_URL: '',
      KV_REST_API_TOKEN: '',
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});

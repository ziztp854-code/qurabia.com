import { defineConfig, devices } from '@playwright/test';
const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Explicit isolated local database required');
const target = new URL(databaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(target.pathname) ||
  target.search ||
  target.hash
)
  throw new Error('Refusing a non-isolated database');
const baseURL = 'http://localhost:3000';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'kingdoms-abandoned-production.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 20000 },
  outputDir: './test-results/abandoned-production',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--host-resolver-rules=MAP localhost 127.0.0.2',
      ],
    },
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.2 -p 3000',
    url: 'http://127.0.0.2:3000',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      NEXTAUTH_URL: baseURL,
      NEXT_PUBLIC_SITE_URL: baseURL,
      AUTH_URL: baseURL,
      AUTH_SECRET: 'kingdoms-abandoned-isolated-e2e-only',
      NEXTAUTH_SECRET: 'kingdoms-abandoned-isolated-e2e-only',
      RUN_AUTH_E2E: 'true',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      KV_REST_API_URL: '',
      KV_REST_API_TOKEN: '',
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: '',
      NEXT_TELEMETRY_DISABLED: '1',
      MAMLUK_LOCAL_BUILD: process.env.MAMLUK_LOCAL_BUILD ?? '0',
    },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } } },
    { name: 'android', use: { ...devices['Pixel 5'] } },
  ],
});

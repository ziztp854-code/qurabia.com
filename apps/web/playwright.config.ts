import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3000';
const webCommand = process.env.CI
  ? 'pnpm --filter @tahaddi/web start --hostname 127.0.0.1'
  : 'pnpm --filter @tahaddi/web dev --hostname 127.0.0.1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { baseURL, trace: 'on-first-retry' },
  webServer: [
    {
      command: 'pnpm --filter @tahaddi/realtime exec nest start --watch',
      url: 'http://127.0.0.1:3001/realtime/health',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/tahaddi',
        AUTH_SECRET: process.env.AUTH_SECRET ?? 'replace-with-a-random-value-for-testing',
        WEB_ORIGIN: process.env.WEB_ORIGIN ?? baseURL,
        NODE_ENV: process.env.NODE_ENV ?? 'test',
        REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
      },
    },
    {
      command: webCommand,
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/tahaddi',
        AUTH_SECRET: process.env.AUTH_SECRET ?? 'replace-with-a-random-value-for-testing',
        RUN_AUTH_E2E: process.env.RUN_AUTH_E2E ?? 'true',
        NEXTAUTH_URL: baseURL,
        NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://127.0.0.1:3001',
      },
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});

import { defineConfig, devices } from '@playwright/test';

// These anonymous boundary tests need only the built web application; no live
// database, account seed or realtime daemon is used.
const baseURL = 'http://127.0.0.1:3100';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'kingdoms.spec.ts',
  workers: 1,
  timeout: 30_000,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100',
    url: `${baseURL}/auth/sign-in`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: { NEXTAUTH_URL: baseURL },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});

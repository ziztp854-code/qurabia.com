import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'ladder-intro.spec.ts',
  workers: 1,
  timeout: 45000,
  retries: 0,
  reporter: 'list',
  outputDir: './test-results/ladder-intro',
  use: {
    baseURL: 'http://127.0.0.1:3427',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import tsx e2e/fixtures/ladder-intro-server.ts',
    url: 'http://127.0.0.1:3427',
    reuseExistingServer: true,
    env: { LADDER_INTRO_E2E: '1' },
  },
});

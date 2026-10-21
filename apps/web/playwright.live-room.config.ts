import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'live-room-responsive.spec.ts',
  workers: 1,
  timeout: 120_000,
  outputDir: './test-results/live-room',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3417',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'node --import tsx e2e/fixtures/live-room-server.ts',
    url: 'http://127.0.0.1:3417',
    reuseExistingServer: true,
    env: { LIVE_ROOM_E2E: '1' },
  },
});

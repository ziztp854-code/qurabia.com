import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'chat-typing-performance.spec.ts',
  workers: 1,
  timeout: 120_000,
  outputDir: './test-results/chat-typing-performance',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3418',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'node --import tsx e2e/fixtures/chat-typing-server.ts',
    url: 'http://127.0.0.1:3418',
    reuseExistingServer: false,
    env: { LIVE_ROOM_E2E: '1' },
  },
});

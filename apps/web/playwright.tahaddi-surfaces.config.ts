import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'tahaddi-surfaces.spec.ts',
  workers: 1,
  timeout: 90_000,
  outputDir: './test-results/tahaddi-surfaces',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3421',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'node --import tsx e2e/fixtures/tahaddi-surfaces-server.ts',
    url: 'http://127.0.0.1:3421',
    reuseExistingServer: true,
    env: { TAHADDI_SURFACES_E2E: '1' },
  },
});

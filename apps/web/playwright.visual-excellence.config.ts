import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'visual-excellence-market.spec.ts',
  workers: 1,
  timeout: 60000,
  outputDir: './test-results/visual-excellence',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3314',
    reducedMotion: 'reduce',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --import tsx e2e/fixtures/village-scene-server.ts',
    url: 'http://127.0.0.1:3314',
    reuseExistingServer: false,
    env: { VILLAGE_SCENE_E2E: '1', VILLAGE_SCENE_PORT: '3314' },
  },
});

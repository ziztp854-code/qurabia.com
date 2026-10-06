import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'kingdoms-city-scenes.spec.ts',
  workers: 1, // One local engine fixture: every test resets its owned world through the API.
  retries: 0,
  timeout: 60000,
  outputDir: './test-results/city-scenes',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/city-scenes', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3312',
    viewport: { width: 1920, height: 1080 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node --import tsx e2e/fixtures/village-scene-server.ts',
    url: 'http://127.0.0.1:3312',
    reuseExistingServer: false,
    timeout: 30000,
    env: { VILLAGE_SCENE_E2E: '1', VILLAGE_SCENE_PORT: '3312' },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

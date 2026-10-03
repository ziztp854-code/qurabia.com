import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'incoming-attack-ux.spec.ts',
  workers: 1,
  timeout: 60000,
  outputDir: './test-results/incoming-attack',
  use: {
    baseURL: 'http://127.0.0.1:3310',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import tsx e2e/fixtures/village-scene-server.ts',
    url: 'http://127.0.0.1:3310',
    reuseExistingServer: false,
    timeout: 30000,
    env: { VILLAGE_SCENE_E2E: '1' },
  },
  projects: [
    { name: 'desktop-1920', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});

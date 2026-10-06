import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'village-scene.spec.ts',
  workers: 1,
  timeout: 60000,
  outputDir: './test-results/village-scene',
  use: {
    baseURL: 'http://127.0.0.1:3310',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
    { name: 'laptop-1366', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'tablet', use: { ...devices['iPad Pro 11'], defaultBrowserType: 'chromium' } },
    { name: 'iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'android', use: { ...devices['Pixel 5'] } },
  ],
});

import { defineConfig, devices } from '@playwright/test';
const baseURL = 'http://127.0.0.1:3349';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'kingdoms-sultan-farm.spec.ts',
  workers: 1,
  timeout: 60000,
  outputDir: './test-results/sultan-farm',
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec tsx e2e/fixtures/village-scene-server.ts',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000,
    env: { VILLAGE_SCENE_E2E: '1', VILLAGE_SCENE_PORT: '3349' },
  },
  projects: [
    {
      name: 'farm-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    { name: 'farm-mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
  ],
});

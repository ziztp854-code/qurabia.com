import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'globe-scene.spec.ts',
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  outputDir: './test-results/globe-scene',
  use: {
    baseURL: 'http://127.0.0.1:3311',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'node --import tsx e2e/fixtures/globe-scene-server.ts',
    url: 'http://127.0.0.1:3311',
    reuseExistingServer: false,
    timeout: 30000,
    env: { GLOBE_SCENE_E2E: '1' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } } },
    { name: 'android', use: { ...devices['Pixel 5'] } },
  ],
});

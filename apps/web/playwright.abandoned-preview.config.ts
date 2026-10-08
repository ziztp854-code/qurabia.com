import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'abandoned-villages.spec.ts',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: './test-results/abandoned-preview',
  use: {
    baseURL: 'http://127.0.0.1:3348',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'node --import tsx e2e/fixtures/abandoned-village-server.ts',
    url: 'http://127.0.0.1:3348',
    reuseExistingServer: false,
    timeout: 60000,
    env: { ABANDONED_VILLAGE_PREVIEW: '1' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } } },
    { name: 'android', use: { ...devices['Pixel 5'] } },
  ],
});

import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const baseURL = process.env.LIVING_CITY_BASE_URL ?? 'http://127.0.0.1:3312';
const fixtureRoot = process.env.LIVING_CITY_FIXTURE_ROOT ?? process.cwd();

export default defineConfig({
  testDir: './e2e',
  testMatch: 'living-city-regression.spec.ts',
  workers: 1,
  retries: 0,
  updateSnapshots: 'none',
  timeout: 60000,
  outputDir: './test-results/living-city-regression',
  snapshotPathTemplate:
    '{testDir}/living-city-regression.spec.ts-snapshots/{projectName}/{arg}-{platform}{ext}',
  expect: { toHaveScreenshot: { animations: 'disabled', scale: 'css', maxDiffPixels: 200 } },
  use: {
    baseURL,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer:
    process.env.LIVING_CITY_EXTERNAL_SERVER === '1'
      ? undefined
      : {
          command: 'node --import tsx e2e/fixtures/village-scene-server.ts',
          cwd: path.resolve(fixtureRoot),
          url: baseURL,
          reuseExistingServer: false,
          timeout: 60000,
          env: { VILLAGE_SCENE_E2E: '1', VILLAGE_SCENE_PORT: new URL(baseURL).port },
        },
  projects: [
    {
      name: 'desktop-1920',
      use: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
    },
    {
      name: 'mobile-390',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        defaultBrowserType: 'chromium',
      },
    },
  ],
});

import { defineConfig } from '@playwright/test';
const baseURL = process.env.PALACE_PREVIEW_BASE_URL ?? 'http://127.0.0.1:3324';
export default defineConfig({
  testDir: './e2e', testMatch: ['palace-animation.spec.ts', 'palace-review.spec.ts'], workers: 1, retries: 0, timeout: 45000,
  outputDir: './test-results/animation-preview', reporter: [['list'], ['json', { outputFile: './test-results/animation-preview/report.json' }]],
  use: { baseURL, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', video: 'on', screenshot: 'only-on-failure' },
  webServer: process.env.PALACE_PREVIEW_EXTERNAL_SERVER === '1' ? undefined : {
    command: 'node --import tsx e2e/fixtures/village-scene-server.ts', url: baseURL,
    reuseExistingServer: false, timeout: 60000,
    env: { VILLAGE_SCENE_E2E: '1', VILLAGE_SCENE_PORT: new URL(baseURL).port },
  },
  projects: [{ name: 'desktop', use: { browserName: 'chromium' } }, { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }],
});

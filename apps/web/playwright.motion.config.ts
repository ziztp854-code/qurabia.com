import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3331';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'motion-integration.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 45_000,
  outputDir: './test-results/motion-integration',
  reporter: [['list'], ['json', { outputFile: './test-results/motion-integration/report.json' }]],
  use: {
    baseURL,
    launchOptions: {
      executablePath: process.env.MOTION_CHROMIUM_PATH || undefined,
      args: ['--no-proxy-server'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @tahaddi/web start --hostname 127.0.0.1 --port 3331',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      AUTH_SECRET: 'cloud-motion-verification-only-20261012',
      NEXTAUTH_SECRET: 'cloud-motion-verification-only-20261012',
      NEXTAUTH_URL: baseURL,
    },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});

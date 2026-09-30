import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// This suite uses the existing seeded local host; it never starts services or seeds data.
if (process.env.RUN_MAMLUK_MAP_E2E !== '1') {
  throw new Error('Set RUN_MAMLUK_MAP_E2E=1 to run the explicitly isolated Mamluk map checks.');
}
const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('KINGDOMS_TEST_DATABASE_URL is required; there is no fallback.');
const database = new URL(databaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(database.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
  !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(database.pathname) ||
  database.search ||
  database.hash
) {
  throw new Error('Mamluk map browser tests require an isolated local kingdoms_test database.');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'mamluk-world-map.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  outputDir: join(tmpdir(), 'qurabia-mamluk-map-e2e'),
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    contextOptions: { reducedMotion: 'reduce' },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    {
      name: 'mamluk-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mamluk-mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
});

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
if (process.env.RUN_MAMLUK_MAP_E2E !== '1')
  throw new Error('Explicit local map verification required.');
const db = new URL(process.env.KINGDOMS_TEST_DATABASE_URL ?? 'about:blank');
if (
  !['postgres:', 'postgresql:'].includes(db.protocol) ||
  !['127.0.0.1', 'localhost'].includes(db.hostname) ||
  !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(db.pathname) ||
  db.search ||
  db.hash
)
  throw new Error('Isolated local database required.');
export default defineConfig({
  testDir: './e2e',
  testMatch: 'mamluk-hd-world-map.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 30000 },
  outputDir: join(tmpdir(), 'qurabia-mamluk-hd-release-e2e'),
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    actionTimeout: 15000,
    navigationTimeout: 45000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    contextOptions: { reducedMotion: 'reduce' },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    {
      name: 'hd-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'hd-4k',
      use: { ...devices['Desktop Chrome'], viewport: { width: 3840, height: 2160 } },
    },
    { name: 'hd-mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
  ],
});

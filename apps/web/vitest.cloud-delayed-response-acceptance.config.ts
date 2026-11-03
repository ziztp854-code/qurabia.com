import path from 'node:path';
import { defineConfig } from 'vitest/config';

for (const name of ['VOICE_TEST_DATABASE_URL', 'VOICE_TEST_CLOUD_URL', 'VOICE_TEST_CLOUD_KEY', 'VOICE_TEST_CLOUD_SECRET']) {
  if (!process.env[name]) throw new Error(`Cloud race acceptance requires ${name}`);
}

export default defineConfig({
  resolve: { alias: {
    '@': path.resolve(__dirname, './src'),
    'server-only': path.resolve(__dirname, './node_modules/next/dist/compiled/server-only/empty.js'),
  } },
  test: {
    environment: 'node', setupFiles: [], maxWorkers: 1,
    include: ['src/lib/voice/cloud-delayed-response-acceptance.integration.test.ts'],
    testTimeout: 120_000, hookTimeout: 30_000,
  },
});

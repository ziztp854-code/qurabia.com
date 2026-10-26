import path from 'node:path';
import { defineConfig } from 'vitest/config';

// This dedicated runner must never report success by skipping its entire suite.
// The normal unit-test runner still supports an absent integration database.
if (!process.env.VOICE_TEST_DATABASE_URL) {
  throw new Error(
    'VOICE_TEST_DATABASE_URL is required for the voice PostgreSQL integration runner',
  );
}
const database = new URL(process.env.VOICE_TEST_DATABASE_URL);
if (
  !['postgres:', 'postgresql:'].includes(database.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
  !/^\/voice_test_[a-z0-9_]+$/.test(database.pathname) ||
  database.search ||
  database.hash
)
  throw new Error('VOICE_TEST_DATABASE_URL must target a localhost voice_test_* database');

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(
        __dirname,
        './node_modules/next/dist/compiled/server-only/empty.js',
      ),
    },
  },
  test: {
    environment: 'node',
    setupFiles: [],
    maxWorkers: 1,
    include: [
      'src/lib/voice/repository-quota.integration.test.ts',
      'src/lib/voice/repository-message-latency.integration.test.ts',
      'src/lib/voice/repository-gift-latency.integration.test.ts',
    ],
  },
});

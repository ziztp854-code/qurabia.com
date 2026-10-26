import path from 'node:path';
import { defineConfig } from 'vitest/config';

if (!process.env.VOICE_TEST_DATABASE_URL || !process.env.VOICE_TEST_SFU_RUNTIME) {
  throw new Error('Explicit local database and SFU runtime required for voice media acceptance');
}
const database = new URL(process.env.VOICE_TEST_DATABASE_URL);
if (
  !['postgres:', 'postgresql:'].includes(database.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
  !/^\/voice_test_[a-z0-9_]+$/.test(database.pathname) ||
  database.search ||
  database.hash
)
  throw new Error('Voice media acceptance requires a localhost voice_test_* database');

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
    include: ['src/lib/voice/livekit-control-plane.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 20_000,
  },
});

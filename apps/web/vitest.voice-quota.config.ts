import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './node_modules/next/dist/compiled/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: [],
    maxWorkers: 1,
    include: ['src/lib/voice/repository-quota.integration.test.ts'],
  },
});

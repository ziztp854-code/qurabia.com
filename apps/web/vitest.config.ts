import path from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: {
    '@': path.resolve(__dirname, './src'),
    'server-only': path.resolve(__dirname, './node_modules/next/dist/compiled/server-only/empty.js'),
  } },
  test: {
    maxWorkers: 4,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Cloud acceptance uses separate fail-closed configs and an isolated test project.
    exclude: [
      ...configDefaults.exclude,
      'src/lib/voice/cloud-race-acceptance.integration.test.ts',
      'src/lib/voice/cloud-delayed-response-acceptance.integration.test.ts',
    ],
  },
});

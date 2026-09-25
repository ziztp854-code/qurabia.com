import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: {
    '@': path.resolve(__dirname, './src'),
    'server-only': path.resolve(__dirname, './node_modules/next/dist/compiled/server-only/empty.js'),
  } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}'] },
});

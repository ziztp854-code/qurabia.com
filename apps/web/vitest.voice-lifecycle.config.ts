import path from 'node:path';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
const dependency = (name: string) => require.resolve(name);

// Separate opt-in acceptance workload: never collected by the normal src suite.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      {
        find: /^vitest$/,
        replacement: path.resolve(__dirname, 'node_modules/vitest/dist/index.js'),
      },
      { find: /^react$/, replacement: dependency('react') },
      { find: /^react\/jsx-runtime$/, replacement: dependency('react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: dependency('react/jsx-dev-runtime') },
      { find: /^livekit-client$/, replacement: dependency('livekit-client') },
      { find: /^next\/navigation$/, replacement: dependency('next/navigation') },
      { find: /^next\/dynamic$/, replacement: dependency('next/dynamic') },
      { find: /^next\/image$/, replacement: dependency('next/image') },
      { find: /^@testing-library\/react$/, replacement: dependency('@testing-library/react') },
      { find: 'server-only', replacement: dependency('next/dist/compiled/server-only/empty.js') },
    ],
  },
  test: {
    env: {
      VOICE_LIFECYCLE_EVIDENCE: path.resolve(
        __dirname,
        '../../docs/visual-evidence/live-room-responsive/approval-lifecycle.json',
      ),
    },
    maxWorkers: 1,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['../../tests/voice-acceptance/lifecycle-stress.test.tsx'],
  },
});

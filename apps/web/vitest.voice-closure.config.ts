import path from 'node:path';
import { defineConfig } from 'vitest/config';
import lifecycle from './vitest.voice-lifecycle.config';

// Additional final coverage; the ordinary src suite runs fresh in the workspace invocation.
export default defineConfig({
  ...lifecycle,
  test: {
    ...lifecycle.test,
    maxWorkers: 1,
    env: {
      VOICE_LIFECYCLE_EVIDENCE: path.resolve(
        __dirname,
        '../../docs/visual-evidence/live-room-responsive/closure-lifecycle.json',
      ),
    },
    include: [
      '../../tests/voice-acceptance/heartbeat-cleanup.test.tsx',
      '../../tests/voice-acceptance/lifecycle-stress.test.tsx',
    ],
  },
});

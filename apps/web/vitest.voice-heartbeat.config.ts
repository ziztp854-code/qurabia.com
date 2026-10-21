import base from './vitest.voice-lifecycle.config';
import { defineConfig } from 'vitest/config';

// Opt-in cleanup regression coverage; no additional workload in the normal suite.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['../../tests/voice-acceptance/heartbeat-cleanup.test.tsx'],
  },
});

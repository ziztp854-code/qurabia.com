import { defineConfig } from '@playwright/test';
import base from './playwright.live-room.config';

export default defineConfig({
  ...base,
  testMatch: 'voice-effects.spec.ts',
  outputDir: './test-results/voice-effects',
  use: { ...base.use, baseURL: 'http://127.0.0.1:3418' },
  webServer: {
    command: 'node --import tsx e2e/fixtures/live-room-server.ts',
    url: 'http://127.0.0.1:3418',
    reuseExistingServer: true,
    env: { LIVE_ROOM_E2E: '1', VOICE_EFFECTS_PREVIEW: '1' },
  },
});

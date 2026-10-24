import base from './playwright.live-room.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  testMatch: 'voice-polish.spec.ts',
  outputDir: './test-results/voice-polish',
});

import { defineConfig } from '@playwright/test';
import liveRoom from './playwright.live-room.config';

export default defineConfig({
  ...liveRoom,
  testMatch: 'tahaddi-reference.spec.ts',
  outputDir: './test-results/tahaddi-reference',
});

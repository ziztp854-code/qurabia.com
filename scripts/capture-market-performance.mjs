// Local fixture measurement. rAF pacing is not a physical-device or game-render FPS certification.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const { chromium, expect } = requireWeb('@playwright/test');
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw new Error('Use before or after with the matching local source revision.');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
const results = [];
try {
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.request.post('http://127.0.0.1:3310/__village_test/reset');
    await page.goto('http://127.0.0.1:3310');
    await expect(page.locator('[data-village-scene]')).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
    await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click();
    await page.getByLabel('اختر مبنى من الخريطة', { exact: true }).selectOption('market');
    await expect(page.locator('[data-city-scene="market"]')).toHaveAttribute('data-phase', 'active');
    await page.locator('[data-city-scene="market"] picture img').evaluate(img => img.decode());
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(async () => {
      const intervals = [];
      await new Promise(resolve => {
        let previous;
        const frame = now => {
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          if (intervals.length >= 120) resolve(); else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const sorted = [...intervals].sort((a,b) => a-b);
      const gl = document.createElement('canvas').getContext('webgl');
      const extension = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        medianFrameMs: sorted[60], p95FrameMs: sorted[114],
        rafPacingHz: 1000 / (intervals.reduce((a,b) => a+b,0) / intervals.length),
        gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        images: performance.getEntriesByType('resource').filter(e => e.name.includes('/city-scenes/market')).map(e => ({ file: new URL(e.name).pathname, localLoadMs: e.duration, encodedBytes: e.encodedBodySize })),
      };
    });
    results.push({ name, viewport: [width,height], dpr: 1, ...metrics });
    await context.close();
  }
  await writeFile(path.join(root, `docs/visual-evidence/market/${phase}-performance.json`), JSON.stringify({ phase, browser: browser.version(), context: 'Headless local Chromium; warm fixture server; fresh browser context per viewport; normal motion; 120 rAF intervals on static market. No network throttling. Does not measure physical-device game FPS.', results }, null, 2) + '\n');
  console.log(`${phase}: captured ${results.length} local performance samples`);
} finally { await browser.close(); }

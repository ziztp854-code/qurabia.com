import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext();
const page = await context.newPage();
let calls = 0;
page.on('request', (r) => {
  if (new URL(r.url()).pathname === '/api/kingdoms/reports') calls++;
});
await page.route('**/api/kingdoms/reports?**', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  await route.continue();
});
await page.goto('http://127.0.0.1:3315', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.royalSignals === 'ready');
await page.getByRole('status').first().waitFor();
await page.evaluate(async () => {
  for (let n = 1; n <= 20; n++) {
    window.dispatchEvent(new CustomEvent('royal-reports-test-revision', { detail: n }));
    await new Promise((r) => setTimeout(r, 30));
  }
});
await page.locator('[data-report-id]').first().waitFor({ timeout: 10000 });
await page.waitForTimeout(3500);
assert.equal(
  calls,
  2,
  'initial load plus one coalesced reload, without canceling the initial read',
);
assert.equal(await page.locator('[data-report-id]').count(), 25);
console.log(
  `PASS: 20 revision hints produced ${calls} archive requests; delayed initial read completed; 25 real DB summaries restored`,
);
await browser.close();

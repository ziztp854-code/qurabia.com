import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const folder = '/workspace/qurabia.com/.reports/royal-reports';
await page.route('**/api/kingdoms/reports?**', async (route) => {
  await new Promise((r) => setTimeout(r, 2000));
  await route.continue();
});
await page.goto('http://127.0.0.1:3315', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.getByRole('status').first().waitFor({ timeout: 120000 });
await page.screenshot({ path: `${folder}/mobile-loading.png` });
await page.locator('[data-report-id]').first().waitFor();
await page.screenshot({ path: `${folder}/mobile-list-viewport.png` });
await page.unroute('**/api/kingdoms/reports?**');
await page.route('**/api/kingdoms/reports/r*', async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  payload.data.title = 'رسالة تفصيلية عن نتائج المواجهة والتطوير والموارد في المملكة العربية';
  payload.data.detail =
    'تقرير طويل لفحص وضوح القراءة والتفاف الحروف العربية والإحداثيات والتفاصيل. '.repeat(25) +
    ' https://example.test/' +
    'LongUnbrokenText'.repeat(30);
  await route.fulfill({ response, json: payload });
});
await page.locator('[data-report-id]').first().click();
await page.locator('table').waitFor();
await page.screenshot({ path: `${folder}/mobile-long-text.png`, fullPage: true });
await page.setViewportSize({ width: 320, height: 740 });
await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
const controls = await page
  .locator('button')
  .evaluateAll((nodes) =>
    nodes
      .filter((n) => n.getClientRects().length)
      .map((n) => ({
        text: n.textContent,
        left: n.getBoundingClientRect().left,
        right: n.getBoundingClientRect().right,
      })),
  );
assert.equal(
  controls.some((c) => c.left < 0 || c.right > 320),
  false,
  JSON.stringify(controls),
);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
await page.screenshot({ path: `${folder}/mobile-long-200pct.png`, fullPage: true });
console.log(
  'PASS: delayed loading, viewport evidence, long Arabic/unbroken text, visible controls within 320px at 200%',
);
await browser.close();

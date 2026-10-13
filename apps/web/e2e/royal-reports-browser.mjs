import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const folder = '/workspace/qurabia.com/.reports/royal-reports';
await page.goto('http://127.0.0.1:3315', { waitUntil: 'networkidle', timeout: 120000 });
await page.locator('[data-report-id]').first().waitFor({ timeout: 120000 });
await page.evaluate(() => document.fonts.ready);
const snapshot = async (name) => page.screenshot({ path: `${folder}/${name}.png`, fullPage: true });
await snapshot('desktop-list');
const first = page.locator('[data-report-id]').first();
const id = await first.getAttribute('data-report-id');
await first.click();
await page.locator('table').waitFor();
await snapshot('desktop-detail');
if (await page.getByRole('button', { name: 'تعليم كمقروء', exact: true }).count())
  await page.getByRole('button', { name: 'تعليم كمقروء', exact: true }).click();
await page.getByRole('button', { name: 'مقروء', exact: true }).waitFor();
await page.reload({ waitUntil: 'networkidle' });
await page.locator(`[data-report-id="${id}"]`).click();
await page.getByRole('button', { name: 'مقروء', exact: true }).waitFor();
await page.setViewportSize({ width: 390, height: 844 });
await snapshot('mobile-detail');
assert.equal(await page.locator('thead').isVisible(), true, 'mobile battle headers visible');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
assert.equal(
  await page
    .locator('img')
    .evaluateAll((imgs) => imgs.some((i) => !i.complete || i.naturalWidth === 0)),
  false,
  'assets loaded',
);
await page.getByRole('button', { name: 'العودة إلى التقارير' }).click();
await snapshot('mobile-list');
await page.getByRole('button', { name: /المباني/ }).click();
await page.locator('[data-report-id]').first().waitFor();
await page.getByRole('button', { name: 'الصفحة التالية' }).click();
await page.waitForTimeout(500);
assert.notEqual(await page.locator('[data-report-id]').first().getAttribute('data-report-id'), id);
await Promise.all([
  page.waitForResponse(
    (r) => new URL(r.url()).searchParams.get('q') === 'NO_MATCH_987654' && r.status() === 200,
  ),
  page.getByRole('searchbox').fill('NO_MATCH_987654'),
]);
await page.waitForFunction(() => document.querySelectorAll('[data-report-id]').length === 0);
assert.equal(await page.locator('[data-report-id]').count(), 0);
await snapshot('mobile-empty');
await page.getByRole('searchbox').fill('');
await page.getByRole('button', { name: /كل التقارير/ }).click();
await page.locator('[data-report-id]').first().waitFor();
await page.route('**/api/kingdoms/reports/r*', (route) =>
  route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, error: { message: 'خطأ اختبار مؤقت' } }),
  }),
);
await page.locator('[data-report-id]').first().click();
await page.getByRole('alert').waitFor();
await snapshot('mobile-error');
await page.unroute('**/api/kingdoms/reports/r*');
await page.getByRole('button', { name: 'إعادة المحاولة' }).click();
await page.locator('table').waitFor();
await page.setViewportSize({ width: 320, height: 740 });
await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
  '320px 200% no page overflow',
);
await snapshot('mobile-320-200pct');
assert.deepEqual(errors, []);
console.log(
  'PASS: desktop/mobile RTL, read persistence, pagination, filters, empty/error/retry, assets, combat headers, 320px 200% overflow; no JS errors',
);
await browser.close();

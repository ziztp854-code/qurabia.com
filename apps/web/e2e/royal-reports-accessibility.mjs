import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 834, height: 1112 } });
const page = await context.newPage();
const folder = '/workspace/qurabia.com/.reports/royal-reports';
await page.goto('http://127.0.0.1:3315', { waitUntil: 'networkidle', timeout: 120000 });
await page.locator('[data-report-id]').first().waitFor();
const id = await page.locator('[data-report-id]').first().getAttribute('data-report-id');
await page.locator('[data-report-id]').first().focus();
await page.keyboard.press('Enter');
await page.locator('table').waitFor();
await page.waitForFunction(
  () => document.activeElement?.getAttribute('aria-label') === 'تفاصيل التقرير',
);
await page.getByRole('button', { name: 'العودة إلى التقارير' }).click();
await page.waitForFunction(
  (id) => document.activeElement?.getAttribute('data-report-id') === id,
  id,
);
await page.keyboard.press('Enter');
await page.locator('table').waitFor();
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
await page.screenshot({
  path: `folder/tablet-detail.png`.replace('folder', folder),
  fullPage: true,
});
const results = [];
const check = async (state) => {
  const r = await new AxeBuilder({ page }).include('[data-royal-reports]').analyze();
  results.push({
    state,
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  });
};
await check('tablet military RTL');
for (const [category, title] of [
  ['economy', 'اكتملت التجارة'],
  ['buildings', 'اكتمل البناء'],
  ['diplomacy', 'عهد التحالف'],
]) {
  const label = { economy: 'الاقتصاد', buildings: 'المباني', diplomacy: 'الدبلوماسية' }[category];
  await Promise.all([
    page.waitForResponse((r) => r.url().includes(`category=${category}`) && r.status() === 200),
    page.getByRole('button', { name: new RegExp(label) }).click(),
  ]);
  await page.locator('[data-report-id]').filter({ hasText: title }).first().click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  await check(`tablet ${category} RTL`);
  await page.screenshot({ path: `${folder}/tablet-${category}.png`, fullPage: true });
}
await page.goto('http://127.0.0.1:3315/?locale=en', { waitUntil: 'networkidle' });
await page.locator('[data-report-id]').first().click();
await page.locator('table').waitFor();
await check('desktop military LTR');
const values=await page.locator('tbody tr').first().locator('td').first().locator('[data-stat]').evaluateAll(nodes=>nodes.map(n=>({label:n.getAttribute('data-stat'),value:n.getAttribute('data-value'),text:n.textContent,left:n.getBoundingClientRect().left})));assert.deepEqual(values.map(v=>[v.label,v.value]),[['before','120'],['after','90'],['losses','30']]);assert.ok(values[0].left<values[1].left&&values[1].left<values[2].left,'LTR numeric order matches headers');
assert.equal(await page.locator('[data-royal-reports]').getAttribute('dir'), 'ltr');
await page.screenshot({ path: `${folder}/english-detail.png`, fullPage: true });
console.log(JSON.stringify(results, null, 2));
assert.equal(
  results.some((r) => r.violations.length),
  false,
  'scoped axe violations',
);
console.log(
  'PASS: tablet, keyboard Enter/detail focus/back focus return, four report categories, LTR, scoped axe with no disabled rules',
);
await browser.close();

import { test, expect } from '@playwright/test';
import type {} from './fixtures/abandoned-map-probe';
const headers = { Origin: 'http://127.0.0.1:3348' };
test.beforeEach(async ({ request }) => {
  await request.post('/__preview_test/reset', { headers, data: {} });
});
test('shows 48 stable sites, shared ordinary stocks and a complete expedition on desktop and mobile', async ({
  page,
}, info) => {
  const request = page.request;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const map = page.getByTestId('abandoned-map');
  await expect(map).toHaveAttribute('data-ready', 'true');
  await expect(map).toHaveAttribute('data-count', '48');
  await expect.poll(() => page.evaluate(() => window.__abandonedMap?.snapshot().count)).toBe(48);
  expect(new Set(await page.evaluate(() => window.__abandonedMap!.snapshot().ids)).size).toBe(48);
  const legend = await page.getByText('● قرية مهجورة · 48 موقعًا', { exact: true }).boundingBox();
  const zoom = await map.locator('.maplibregl-ctrl-zoom-in').boundingBox();
  expect(legend).not.toBeNull();
  expect(zoom).not.toBeNull();
  expect(legend!.x).toBeGreaterThanOrEqual(zoom!.x + zoom!.width);
  expect(zoom!.width).toBeGreaterThanOrEqual(44);
  expect(zoom!.height).toBeGreaterThanOrEqual(44);
  const before = await (await request.get('/api/abandoned-preview/world')).json();
  const villageButtons = page
    .getByRole('region', { name: 'قائمة القرى المهجورة' })
    .getByRole('button');
  await expect(villageButtons).toHaveCount(48);
  await page.screenshot({ path: info.outputPath('initial-map.png'), fullPage: true });
  const point = await page.evaluate(() => window.__abandonedMap!.point());
  expect(point).not.toBeNull();
  await map.click({ position: point! });
  await expect
    .poll(() => page.evaluate(() => window.__abandonedMap!.snapshot().selectedIds.length))
    .toBe(1);
  await expect(
    page.getByRole('complementary', { name: 'تفاصيل البعثة' }).getByRole('heading', { level: 2 }),
  ).toContainText('قرية مهجورة');
  for (const resource of ['wood', 'stone', 'iron', 'food', 'gold'])
    await expect(page.getByTestId(`stock-${resource}`)).toHaveText('3000');
  await expect(page.getByTestId('army-carry')).toHaveText('400');
  await page.screenshot({ path: info.outputPath('selected-inventory.png'), fullPage: true });
  await page.getByRole('button', { name: 'إرسال بعثة جمع', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('البعثة في طريقها');
  const outgoing = await (await request.get('/api/abandoned-preview/world')).json();
  const movement = outgoing.movements[0];
  await request.post('/__preview_test/advance', {
    headers,
    data: { milliseconds: movement.arrivesAt - outgoing.serverTime },
  });
  await page.getByRole('button', { name: 'تحديث المخزون' }).click();
  await expect(page.getByTestId('stock-gold')).toHaveText('2920');
  await expect(page.getByRole('status')).toContainText('القوات في طريق العودة');
  await request.post('/__preview_test/advance', {
    headers,
    data: { milliseconds: movement.travelMs },
  });
  await page.getByRole('button', { name: 'تحديث المخزون' }).click();
  await expect(page.getByText('عودة بعثة القرية المهجورة', { exact: true })).toBeVisible();
  const returned = await (await request.get('/api/abandoned-preview/world')).json();
  expect(returned.origin.resources).toEqual({ wood: 80, stone: 80, iron: 80, food: 80, gold: 80 });
  expect(returned.origin.troops.guard).toBe(500);
  expect(
    returned.sites.map((s: { id: string; longitude: number; latitude: number }) => [
      s.id,
      s.longitude,
      s.latitude,
    ]),
  ).toEqual(
    before.sites.map((s: { id: string; longitude: number; latitude: number }) => [
      s.id,
      s.longitude,
      s.latitude,
    ]),
  );
  await page.screenshot({ path: info.outputPath('returned-expedition.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
test('enforces world membership and prevents a stale world view after selection', async ({
  page,
  request: anonymous,
}) => {
  const request = page.request;
  expect((await anonymous.get('/api/abandoned-preview/world')).status()).toBe(401);
  await page.goto('/');
  await expect(page.getByTestId('abandoned-map')).toHaveAttribute('data-count', '48');
  expect(
    (await request.get('/api/abandoned-preview/world?worldId=preview_abandoned_beta')).status(),
  ).toBe(404);
  await page
    .getByRole('combobox', { name: 'عالم الاختبار' })
    .selectOption('preview_abandoned_beta');
  await expect(page.getByRole('alert')).toContainText('العالم غير متاح');
  await expect(page.getByTestId('abandoned-map')).toHaveCount(0);
  await request.post('/__preview_test/session', { headers, data: { actor: 'bob' } });
  await page.reload();
  await page
    .getByRole('combobox', { name: 'عالم الاختبار' })
    .selectOption('preview_abandoned_beta');
  await expect(page.getByTestId('abandoned-map')).toHaveAttribute('data-count', '48');
});

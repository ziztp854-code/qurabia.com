import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

async function openGarden(page: Page, request: APIRequestContext) {
  expect((await request.post('/__village_test/farm-scenario')).ok()).toBe(true);
  await page.goto('/');
  const stage = page.locator('[data-village-scene]');
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  const entrance = page.getByRole('button', { name: /افتح حديقة السلطان/ });
  await expect(entrance).toBeVisible();
  return { stage, entrance };
}

test('garden: visible courtyard entry, free planting, cosmetic collection, persistence and independent food farm', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { stage, entrance } = await openGarden(page, request);
  const out = process.env.FARM_OUTPUT_DIR ?? path.resolve('test-results/sultan-farm/previews');
  await mkdir(out, { recursive: true });
  const prefix = info.project.name;
  const camera = () =>
    stage.evaluate((el: HTMLElement) => ({
      x: el.dataset.cameraX,
      y: el.dataset.cameraY,
      zoom: el.dataset.zoom,
    }));
  const before = await camera();
  const target = await entrance.boundingBox();
  expect(target!.width).toBeGreaterThanOrEqual(44);
  expect(target!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: path.join(out, `${prefix}-village-entry.png`), fullPage: true });
  await entrance.click();
  const scene = page.locator('[data-city-scene="sultan-garden"]');
  const farm = page.getByRole('region', { name: 'مزرعة السلطان', exact: true });
  await expect(scene).toHaveAttribute('data-phase', 'active');
  await expect(farm).toHaveAttribute('dir', 'rtl');
  await expect(scene.locator('[data-sultan-farm]')).toHaveAttribute('data-pixi-farm', 'true');
  await expect(scene.locator('[data-farm-bed]')).toHaveCount(12);
  await expect(scene.locator('[data-city-resources]')).toHaveCount(0);
  await expect(farm.getByRole('group', { name: 'أحواض المزرعة' }).getByRole('button')).toHaveCount(
    12,
  );
  await expect(farm).toHaveAttribute('data-farm-motion', 'quiet');
  await page.screenshot({ path: path.join(out, `${prefix}-garden-scene.png`), fullPage: true });
  if (prefix.includes('mobile')) {
    await scene.getByRole('button', { name: 'إدارة المرفق' }).click();
    await expect(scene).toHaveAttribute('data-farm-managing', 'true');
  }
  await farm.getByRole('button', { name: 'الحوض 5، الورد الجوري، ناضج' }).click();
  const beforeHarvest = (await (await request.get('/api/kingdoms')).json()).data;
  await farm.getByRole('button', { name: /اجمع الحوض/ }).click();
  await expect(farm.getByRole('button', { name: 'الحوض 5، فارغ' })).toBeVisible();
  const afterHarvest = (await (await request.get('/api/kingdoms')).json()).data;
  const stripGarden = (village: Record<string, unknown>) => {
    const rest = { ...village };
    delete rest.sultanFarm;
    return rest;
  };
  expect(afterHarvest.villages.map(stripGarden)).toEqual(beforeHarvest.villages.map(stripGarden));
  const current = afterHarvest.villages.find(
    (v: { ownerId: string }) => v.ownerId === 'browser-player',
  );
  expect(current.sultanFarm.garden.harvests).toBe(13);
  expect(new Set(afterHarvest.player.achievements).size).toBe(
    afterHarvest.player.achievements.length,
  );
  await farm.getByRole('button', { name: /السوسن.*متاح مجانًا/ }).click();
  await expect(farm.getByText('مجانية بعد كل جمع')).toBeVisible();
  await farm.getByRole('button', { name: 'ازرع السوسن' }).click();
  await expect(farm.getByRole('button', { name: 'الحوض 5، السوسن، بذرة' })).toBeVisible();
  await farm.getByText('أوسمة الحديقة — المكتسب والأهداف').click();
  await page.screenshot({
    path: path.join(out, `${prefix}-garden-management.png`),
    fullPage: true,
  });
  await page.reload();
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  await page.getByRole('button', { name: /افتح حديقة السلطان/ }).click();
  if (prefix.includes('mobile')) await scene.getByRole('button', { name: 'إدارة المرفق' }).click();
  await expect(farm.getByRole('button', { name: 'الحوض 5، السوسن، بذرة' })).toBeVisible();
  expect((await request.post('/__village_test/advance-farm')).ok()).toBe(true);
  await page.reload();
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  await page.getByRole('button', { name: /افتح حديقة السلطان/ }).click();
  if (prefix.includes('mobile')) await scene.getByRole('button', { name: 'إدارة المرفق' }).click();
  await expect(farm.getByRole('button', { name: 'الحوض 5، السوسن، ناضج' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(scene).toHaveCount(0);
  expect(await camera()).toEqual(before);
  const city = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  await city
    .locator('summary')
    .filter({ hasText: /^إعدادات القرية$/ })
    .click();
  await city.getByLabel('اختر مبنى من الخريطة').selectOption('farm');
  const food = page.locator('[data-city-scene="farm"]');
  await expect(food).toBeVisible();
  await expect(food.locator('[data-sultan-farm]')).toHaveCount(0);
  await expect(food.locator('picture img')).toHaveAttribute(
    'src',
    '/game-art/kingdoms/city-scenes/farm.webp',
  );
  expect(errors).toEqual([]);
});

test('garden: reduced motion and visibility stop animation without sending garden commands', async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const { entrance } = await openGarden(page, request);
  await entrance.click();
  const scene = page.locator('[data-city-scene="sultan-garden"]');
  const canvas = scene.locator('canvas');
  await expect(scene.locator('[data-sultan-farm]')).toHaveAttribute('data-pixi-farm', 'true');
  const commands: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/kingdoms')
      commands.push(req.postData() ?? '');
  });
  await scene.getByRole('button', { name: 'إيقاف الحركة', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-farm-running', 'false');
  await scene.getByRole('button', { name: 'تشغيل الحركة', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(canvas).toHaveAttribute('data-farm-running', 'false');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(canvas).toHaveAttribute('data-farm-running', 'false');
  expect(commands).toEqual([]);
});

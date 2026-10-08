import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test('farm: enter, select, plant, offline growth, harvest, reload and return with preserved camera', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await request.post('/__village_test/farm-scenario')).ok()).toBe(true);
  await page.goto('/');
  const stage = page.locator('[data-village-scene]');
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  const city = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const before = await stage.evaluate((el: HTMLElement) => ({
    x: el.dataset.cameraX,
    y: el.dataset.cameraY,
    zoom: el.dataset.zoom,
  }));
  const settings = city.locator('summary').filter({ hasText: /^إعدادات القرية$/ });
  await settings.click();
  await city.getByLabel('اختر مبنى من الخريطة').selectOption('farm');
  const scene = page.locator('[data-city-scene="farm"]');
  await expect(scene).toHaveAttribute('data-phase', 'active');
  const farm = page.getByRole('region', { name: 'أحواض مزرعة السلطان' });
  await expect(farm).toBeVisible();
  await expect(farm).toHaveAttribute('dir', 'rtl');
  await expect(farm).toHaveAttribute('data-farm-motion', 'quiet');
  await expect(farm.getByRole('group', { name: 'اختيار الحوض' }).getByRole('button')).toHaveCount(
    12,
  );
  await scene.locator('picture img').evaluate((img: HTMLImageElement) => img.decode());
  await expect(scene.locator('[data-sultan-farm]')).toHaveAttribute('data-pixi-farm', 'true');
  await expect(scene.locator('[data-farm-bed]')).toHaveCount(12);
  const out = process.env.FARM_OUTPUT_DIR ?? path.resolve('test-results/sultan-farm/previews');
  await mkdir(out, { recursive: true });
  const prefix = info.project.name;
  await page.screenshot({ path: path.join(out, `${prefix}-scene.png`), fullPage: true });
  const bed = await scene.locator('[data-farm-bed="5"] polygon').boundingBox();
  expect(bed).not.toBeNull();
  await page.mouse.click(bed!.x + bed!.width / 2, bed!.y + bed!.height / 2);
  await expect(farm.getByRole('button', { name: 'الحوض 6، فاصوليا، ناضج' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await scene.getByRole('button', { name: 'تقريب الحوض 6' }).click();
  await expect
    .poll(() => scene.locator('[data-farm-zoom]').getAttribute('data-farm-zoom'))
    .not.toBe('1');
  await page.screenshot({ path: path.join(out, `${prefix}-focus.png`), fullPage: true });
  await scene.getByRole('button', { name: 'المزرعة كاملة', exact: true }).click();

  if (prefix.includes('mobile')) {
    await scene.getByRole('button', { name: 'إدارة المرفق' }).click();
    await expect(scene).toHaveAttribute('data-farm-managing', 'true');
    await expect(scene.locator('picture')).toBeHidden();
    await page.screenshot({ path: path.join(out, `${prefix}-management.png`), fullPage: true });
  }
  await farm.getByRole('button', { name: 'الحوض 6، فاصوليا، ناضج' }).click();
  const harvest = farm.getByRole('button', { name: 'حصاد الحوض ٦' });
  await harvest.scrollIntoViewIfNeeded();
  await expect(harvest).toBeEnabled();
  await page.screenshot({ path: path.join(out, `${prefix}-harvest.png`), fullPage: true });
  await harvest.click();
  await expect(farm.getByRole('button', { name: 'الحوض 6، فارغ' })).toBeVisible();
  await farm.getByRole('button', { name: 'قمح متاح' }).click();
  await expect(farm.getByText(/اختيار عائلة مختلفة/)).toBeVisible();
  await farm.getByRole('button', { name: 'زرع قمح' }).click();
  await expect(farm.getByRole('button', { name: 'الحوض 6، قمح، بذرة' })).toBeVisible();
  await page.reload();
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  await city
    .locator('summary')
    .filter({ hasText: /^إعدادات القرية$/ })
    .click();
  await city.getByLabel('اختر مبنى من الخريطة').selectOption('farm');
  await expect(farm.getByRole('button', { name: 'الحوض 6، قمح، بذرة' })).toBeVisible();
  expect((await request.post('/__village_test/advance-farm')).ok()).toBe(true);
  await page.reload();
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  await city
    .locator('summary')
    .filter({ hasText: /^إعدادات القرية$/ })
    .click();
  await city.getByLabel('اختر مبنى من الخريطة').selectOption('farm');
  await expect(farm.getByRole('button', { name: 'الحوض 6، قمح، ناضج' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await scene.getByRole('button', { name: 'العودة إلى المدينة', exact: true }).click();
  await expect(scene).toHaveCount(0);
  await expect(city).toBeVisible();
  const after = await stage.evaluate((el: HTMLElement) => ({
    x: el.dataset.cameraX,
    y: el.dataset.cameraY,
    zoom: el.dataset.zoom,
  }));
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

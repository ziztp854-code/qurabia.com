import { expect, test } from '@playwright/test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

async function clickGardenEntrance(page: Page, hasTouch: boolean) {
  const entrance = page.locator('[data-sultan-garden-entrance]');
  const box = (await entrance.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.tagName, point)).toBe('CANVAS');
  if (hasTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await page.getByRole('button', { name: 'حديقة القصر' }).click();
}

async function openGarden(page: Page, request: APIRequestContext) {
  expect((await request.post('/__village_test/farm-scenario')).ok()).toBe(true);
  await page.goto('/');
  const stage = page.locator('[data-village-scene]');
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  const entrance = page.getByRole('button', { name: /افتح حديقة السلطان/ });
  await expect(entrance).toBeVisible();
  return { stage, entrance };
}

async function openGardenManagement(scene: Locator, mobile: boolean) {
  if (!mobile) return;
  await scene.getByRole('button', { name: 'إدارة الحديقة' }).click();
  await expect(scene).toHaveAttribute('data-farm-sheet', 'half');
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
  await clickGardenEntrance(page, Boolean(info.project.use.hasTouch));
  const scene = page.locator('[data-city-scene="sultan-garden"]');
  const farm = page.getByRole('region', { name: 'مزرعة السلطان', exact: true });
  const mobile = prefix.includes('mobile');
  await expect(scene).toHaveAttribute('data-phase', 'active');
  await expect(scene.locator('[data-sultan-farm]')).toHaveAttribute('data-pixi-farm', 'true');
  await expect(scene.locator('[data-farm-bed]')).toHaveCount(12);
  await expect(scene.locator('[data-city-resources]')).toHaveCount(0);
  await page.screenshot({ path: path.join(out, `${prefix}-garden-scene.png`), fullPage: true });
  const viewport = scene.getByRole('application');
  const beforeSceneSelection = await viewport.getAttribute('data-farm-zoom');
  const sceneBed = scene.locator('[data-farm-bed="6"] circle');
  const sceneBedBox = (await sceneBed.boundingBox())!;
  await page.mouse.click(sceneBedBox.x + sceneBedBox.width / 2, sceneBedBox.y + sceneBedBox.height / 2);
  await openGardenManagement(scene, mobile);
  await expect(farm).toHaveAttribute('dir', 'rtl');
  await page.screenshot({ path: path.join(out, `${prefix}-garden-sheet.png`), fullPage: true });
  await expect(farm.getByRole('group', { name: 'أحواض المزرعة' }).getByRole('button')).toHaveCount(
    12,
  );
  await expect(farm).toHaveAttribute('data-farm-motion', 'quiet');
  const plotButtons = farm.getByRole('group', { name: 'أحواض المزرعة' }).getByRole('button');
  await expect(plotButtons.nth(6)).toHaveAttribute('aria-pressed', 'true');
  await expect(viewport).toHaveAttribute('data-farm-zoom', beforeSceneSelection!);
  if (mobile) {
    await scene.getByRole('button', { name: 'توسيع لوحة الحديقة' }).click();
    await expect(scene).toHaveAttribute('data-farm-sheet', 'full');
  }
  await farm.getByRole('button', { name: 'الحوض 5، الورد الجوري، ناضج' }).click();
  await expect(viewport).toHaveAttribute('data-farm-zoom', '3');
  if (mobile) await expect(scene).toHaveAttribute('data-farm-sheet', 'half');
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
  await expect(farm.getByRole('button', { name: /إطار ذهبي/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: path.join(out, `${prefix}-garden-management.png`),
    fullPage: true,
  });
  await page.reload();
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  await clickGardenEntrance(page, Boolean(info.project.use.hasTouch));
  await openGardenManagement(scene, mobile);
  await expect(farm.getByRole('button', { name: 'الحوض 5، السوسن، بذرة' })).toBeVisible();
  expect((await request.post('/__village_test/advance-farm')).ok()).toBe(true);
  await page.reload();
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  await clickGardenEntrance(page, Boolean(info.project.use.hasTouch));
  await openGardenManagement(scene, mobile);
  await expect(farm.getByRole('button', { name: 'الحوض 5، السوسن، ناضج' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  if (mobile) {
    await expect(scene).toHaveAttribute('data-farm-sheet', 'closed');
    await expect(scene.getByRole('button', { name: 'إدارة الحديقة' })).toBeFocused();
    await page.keyboard.press('Escape');
  }
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

test('garden: a delayed command cannot replace a newer plot draft and rapid activation sends once', async ({
  page,
  request,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGarden(page, request);
  await clickGardenEntrance(page, Boolean(info.project.use.hasTouch));
  const scene = page.locator('[data-city-scene="sultan-garden"]');
  const farm = page.getByRole('region', { name: 'مزرعة السلطان', exact: true });
  await expect(scene).toHaveAttribute('data-phase', 'active');
  await openGardenManagement(scene, info.project.name.includes('mobile'));

  let release!: () => void;
  let started!: () => void;
  const releaseRequest = new Promise<void>((resolve) => { release = resolve; });
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  let farmPosts = 0;
  await page.route('**/api/kingdoms', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    farmPosts += 1;
    started();
    await releaseRequest;
    await route.continue();
  });

  const plots = farm.getByRole('group', { name: 'أحواض المزرعة' }).getByRole('button');
  await plots.nth(0).click();
  const plant = farm.getByRole('button', { name: 'ازرع القمح' });
  await plant.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await requestStarted;
  await plots.nth(11).click();
  await farm.getByRole('button', { name: /الفاصوليا.*متاح مجانًا/ }).click();
  await expect(plots.nth(11)).toHaveAttribute('aria-pressed', 'true');
  release();
  await expect(farm.getByRole('button', { name: 'ازرع الفاصوليا' })).toBeEnabled();
  expect(farmPosts).toBe(1);
  await page.unroute('**/api/kingdoms');
});

test('garden: offline planting keeps the authoritative plot and recovers after reconnect', async ({
  page,
  request,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGarden(page, request);
  await clickGardenEntrance(page, Boolean(info.project.use.hasTouch));
  const scene = page.locator('[data-city-scene="sultan-garden"]');
  const farm = page.getByRole('region', { name: 'مزرعة السلطان', exact: true });
  await expect(scene).toHaveAttribute('data-phase', 'active');
  await openGardenManagement(scene, info.project.name.includes('mobile'));
  const empty = farm.getByRole('button', { name: 'الحوض 1، فارغ' });
  await empty.click();
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await farm.getByRole('button', { name: 'ازرع القمح' }).click();
  await expect(scene.locator('[data-city-feedback="error"]')).toBeVisible();
  await expect(empty).toBeVisible();
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.reload();
  await expect(page.locator('[data-village-scene]')).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  await clickGardenEntrance(page, Boolean(info.project.use.hasTouch));
  await openGardenManagement(scene, info.project.name.includes('mobile'));
  await expect(farm.getByRole('button', { name: 'الحوض 1، فارغ' })).toBeVisible();
});

test('garden: reduced motion and visibility stop animation without sending garden commands', async ({
  page,
  request,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openGarden(page, request);
  await clickGardenEntrance(page, Boolean(info.project.use.hasTouch));
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

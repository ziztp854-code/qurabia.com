import { expect, test, type Page } from '@playwright/test';
import { getVillageRect, rectCenter, VILLAGE_WORLD } from '../src/lib/kingdoms/village/coordinates';
async function expectOverview(page: Page) {
  const viewport = page.locator('[data-village-scene]');
  const expected = await viewport.evaluate((element, world) => {
    const fit = Math.min(element.clientWidth / world.width, element.clientHeight / world.height);
    const cover = Math.max(element.clientWidth / world.width, element.clientHeight / world.height);
    return innerWidth <= 700 && element.clientHeight > element.clientWidth ? Math.min(3.5, cover / fit) : 1;
  }, VILLAGE_WORLD);
  await expect.poll(async () => Number(await viewport.getAttribute('data-zoom'))).toBeCloseTo(expected, 2);
  await expect.poll(async () => Number(await viewport.getAttribute('data-camera-x'))).toBeCloseTo(VILLAGE_WORLD.width / 2, 2);
  await expect.poll(async () => Number(await viewport.getAttribute('data-camera-y'))).toBeCloseTo(VILLAGE_WORLD.height / 2, 2);
  if (expected > 1) {
    const [stage, art] = await Promise.all([viewport.boundingBox(), viewport.locator('picture img:not([data-resource-art])').first().boundingBox()]);
    expect(art!.y).toBeLessThanOrEqual(stage!.y + 20);
    expect(art!.y + art!.height).toBeGreaterThanOrEqual(stage!.y + stage!.height - 20);
  }
  return expected;
}

async function revealBuilding(page: Page, id: string) {
  const viewport = page.locator('[data-village-scene]');
  const point = await viewport.evaluate((element, center) => {
    const bounds = element.getBoundingClientRect();
    const zoom = Number((element as HTMLElement).dataset.zoom);
    const scale = Math.min(element.clientWidth / 1600, element.clientHeight / 900) * zoom;
    return { x: bounds.x, y: bounds.y + bounds.height * .6, width: bounds.width, height: bounds.height,
      dx: (Number((element as HTMLElement).dataset.cameraX) - center.x) * scale,
      dy: (Number((element as HTMLElement).dataset.cameraY) - center.y) * scale };
  }, rectCenter(getVillageRect(id as Parameters<typeof getVillageRect>[0])));
  const count = Math.max(1, Math.ceil(Math.abs(point.dx) / (point.width * .6)), Math.ceil(Math.abs(point.dy) / (point.height * .2)));
  for (let index = 0; index < count; index++) {
    const dx = point.dx / count;
    const dy = point.dy / count;
    const startX = point.x + point.width * (dx > 0 ? .2 : .8);
    await page.mouse.move(startX, point.y);
    await page.mouse.down();
    await page.mouse.move(startX + dx, point.y + dy, { steps: 10 });
    await page.mouse.up();
  }
}
async function clickBuilding(page: Page, id: string) {
  const building = page.locator(`[data-building="${id}"]`);
  const findPoint = () => building.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (const y of [.5, .25, .75, .1, .9]) {
      for (const x of [.5, .25, .75, .1, .9]) {
        const point = { x: rect.left + rect.width * x, y: rect.top + rect.height * y };
        const hit = document.elementFromPoint(point.x, point.y);
        if (hit && element.contains(hit)) return point;
      }
    }
    return null;
  });
  let point = await findPoint();
  await expect.poll(async () => {
    point = await findPoint();
    return point;
  }, { message: `${id} has an unobscured playable hotspot` }).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}
async function setVillageSettings(page: Page, open = true) {
  const summary = page.locator('summary').filter({ hasText: /^إعدادات القرية$/ });
  await summary.scrollIntoViewIfNeeded();
  const isOpen = await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open);
  if (isOpen !== open) await summary.click();
  await expect(summary.locator('..')).toHaveJSProperty('open', open);
}

async function setQueues(page: Page, open = true) {
  const summary = page.locator('summary').filter({ hasText: 'البناء والتدريب' });
  await summary.scrollIntoViewIfNeeded();
  const isOpen = await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open);
  if (isOpen !== open) await summary.click();
  await expect(summary.locator('..')).toHaveJSProperty('open', open);
}

async function refreshWorld(page: Page) {
  const settings = page.getByRole('button', { name: 'إعدادات العالم والقرية', exact: true });
  const opened = await settings.getAttribute('aria-expanded') === 'true';
  if (!opened) await settings.click();
  await page.getByRole('button', { name: 'تحديث', exact: true }).click();
  if (!opened) await settings.click();
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/__village_test/reset')).ok()).toBeTruthy();
});

const mobileViewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
] as const;

for (const size of mobileViewports) {
  test(`mobile village controls and sheet at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'Run the device size matrix once with touch emulation.');
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
    await expect(page.getByRole('region', { name: 'موارد القرية', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const navigation = page.getByRole('navigation', { name: 'تنقل المملكة', exact: true });
    if (size.width <= 1000) {
      await expect(navigation).toBeVisible();
      for (const control of await navigation.locator('button, a').all()) {
        const bounds = await control.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height);
      }
      await expect(navigation.getByRole('button', { name: 'انتقل إلى القرية' })).toHaveAttribute('aria-current', 'page');
      await navigation.getByRole('button', { name: 'انتقل إلى التقارير' }).click();
      await expect(navigation.getByRole('button', { name: 'انتقل إلى التقارير' })).toHaveAttribute('aria-current', 'page');
      await navigation.getByRole('button', { name: 'انتقل إلى القرية' }).click();
    }
    const scene = village.locator('[data-village-scene]');
    await village.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
    await expectOverview(page);
    await revealBuilding(page, 'hall');
    await clickBuilding(page, 'hall');
    const sheet = page.locator('aside[aria-label="إدارة مباني القرية"]');
    await expect(page.getByRole('region', { name: 'تفاصيل دار الحكم', exact: true })).toBeVisible();
    if (size.width <= 1000) {
      await expect(sheet).toHaveAttribute('data-sheet-snap', 'compact');
      const handle = sheet.getByRole('button', { name: 'تغيير ارتفاع تفاصيل المبنى', exact: true });
      await handle.click();
      await expect(sheet).toHaveAttribute('data-sheet-snap', 'expanded');
      await expect.poll(async () => {
        const [building, panel, nav] = await Promise.all([
          village.locator('[data-building="hall"]').boundingBox(), sheet.boundingBox(), navigation.boundingBox(),
        ]);
        if (!building || !panel || !nav) return false;
        const center = building.y + building.height / 2;
        return center > 0 && center < panel.y - 8 && panel.y + panel.height <= nav.y;
      }).toBe(true);
      if ([320, 768, 844].includes(size.width)) await page.screenshot({ path: testInfo.outputPath(`mobile-${size.width}-expanded.png`), scale: 'css' });
      await handle.click();
      await expect(sheet).toHaveAttribute('data-sheet-snap', 'compact');
      if ([320, 768, 844].includes(size.width)) await page.screenshot({ path: testInfo.outputPath(`mobile-${size.width}-compact.png`), scale: 'css' });
      const bounds = await handle.boundingBox();
      expect(bounds).not.toBeNull();
      const x = bounds!.x + bounds!.width / 2;
      const y = bounds!.y + bounds!.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 125, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(sheet).toHaveCount(0);
    } else {
      await page.screenshot({ path: testInfo.outputPath(`mobile-${size.width}-selected.png`), scale: 'css' });
      await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
    }
    const cameraX = Number(await scene.getAttribute('data-camera-x'));
    const cameraY = Number(await scene.getAttribute('data-camera-y'));
    expect(cameraX).toBeGreaterThanOrEqual(0);
    expect(cameraX).toBeLessThanOrEqual(VILLAGE_WORLD.width);
    expect(cameraY).toBeGreaterThanOrEqual(0);
    expect(cameraY).toBeLessThanOrEqual(VILLAGE_WORLD.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('level twelve village finishes its real queue after five hours offline', async ({ page, context, request }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seeded = await request.post('/__village_test/offline-scenario');
  expect(seeded.ok()).toBe(true);
  const before = (await seeded.json()).data.villages[0];
  expect(before.progression.level).toBe(12);
  await page.goto('/');
  await setVillageSettings(page);
  await expect(page.getByLabel('مستوى القرية', { exact: true })).toContainText('١٢');
  for (const [building, label] of [['hall', 'دار الحكم'], ['wall', 'السور'], ['warehouse', 'المخزن']]) {
    const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
    await setVillageSettings(page);
    await village.getByLabel('اختر مبنى من الخريطة').selectOption(building);
    const panel = page.getByRole('region', { name: `تفاصيل ${label}`, exact: true });
    await panel.getByRole('button', { name: building === 'hall' ? 'طوّر المبنى' : 'أضف إلى قائمة البناء', exact: true }).click();
    await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  }
  const queued = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  expect(queued.constructionQueue.filter((item: { status: string }) => ['BUILDING', 'QUEUED'].includes(item.status))).toHaveLength(3);
  await expect(page.getByRole('status').filter({ hasText: 'تم تنفيذ أمرك.' })).toBeVisible();
  await setQueues(page);
  await page.getByRole('list', { name: 'مشاريع البناء' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('offline-queue.png'), fullPage: true });
  await page.close();
  expect((await request.post('/__village_test/advance-five-hours')).ok()).toBe(true);
  const returned = await context.newPage();
  await returned.emulateMedia({ reducedMotion: 'reduce' });
  await returned.goto('/');
  await setQueues(returned);
  await expect(returned.getByRole('region', { name: 'قوائم التنفيذ', exact: true }).getByText('لا بناء قيد التنفيذ', { exact: true })).toBeVisible();
  const after = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  expect(after.buildings).toMatchObject({ hall: 8, wall: 6, warehouse: 9 });
  expect(after.training).toBeUndefined();
  expect(after.troops.guard).toBe(5);
  expect(after.resources.wood).toBeGreaterThan(queued.resources.wood);
  expect(after.progression.xp).toBeGreaterThan(before.progression.xp);
  expect(after.progression.power.total).toBeGreaterThan(before.progression.power.total);
  expect(after.progression.level).toBeGreaterThan(12);
  expect((await (await request.get('/api/kingdoms')).json()).data.villages[0].progression.xp).toBe(after.progression.xp);
  await setVillageSettings(returned);
  await expect(returned.getByLabel('مستوى القرية', { exact: true })).toContainText(new Intl.NumberFormat('ar-SA').format(after.progression.level));
  await expect(returned.getByRole('region', { name: 'تقدم القرية' })).toHaveAttribute('data-visual-tier', String(after.progression.visualTier));
  await returned.getByRole('region', { name: 'خريطة القرية', exact: true }).scrollIntoViewIfNeeded();
  await expect(returned.locator('[data-village-scene]')).toHaveAttribute('data-pixi-ready', 'true');
  expect(await returned.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await returned.screenshot({ path: testInfo.outputPath('offline-return.png'), fullPage: true });
});

test('stable calibration preserves the clean master and confirmed gameplay state', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requested: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const filename = new URL(request.url()).pathname.split('/').pop() ?? '';
    if (/^stable-l[1-5]\.webp$/.test(filename)) requested.push(filename);
  });
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const viewport = village.locator('[data-village-scene]');
  await expect(viewport).toHaveAttribute('data-pixi-ready', 'true');
  await village.locator('[data-building-region="stable"]').click();
  const panel = page.getByRole('region', { name: 'تفاصيل الإسطبل', exact: true });
  await expect(panel).toContainText('مستوى الإسطبل ٠');
  const terrain = viewport.locator('picture img:not([data-resource-art])');
  const master = await terrain.getAttribute('src');
  expect(master).toContain('mamluk-capital');
  await panel.getByRole('button', { name: 'أغلق تفاصيل المبنى', exact: true }).click();
  await setVillageSettings(page);
  const calibration = village.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^معايرة مشهد القرية — وضع التطوير$/ }) }).last();
  await calibration.locator('summary').click();
  await calibration.getByLabel('المبنى للمعايرة').selectOption('stable');
  for (const level of [5, 1, 2, 3, 4]) {
    await calibration.getByLabel('المستوى المرئي التجريبي').fill(String(level));
    await expect(terrain).toHaveAttribute('src', master!);
    const confirmed = (await (await page.request.get('/api/kingdoms')).json()).data.villages[0];
    expect(confirmed.buildings.barracks).toBe(0);
  }
  await calibration.locator('summary').click();
  await setVillageSettings(page, false);
  await village.locator('[data-building-region="stable"]').click();
  await expect(panel).toContainText('مستوى الإسطبل ٠');
  expect(requested).toEqual([]);
  await expect(panel.getByRole('button', { name: 'درّب الفرسان', exact: true })).toBeDisabled();
  const state = (await (await page.request.get('/api/kingdoms')).json()).data.villages[0];
  expect(state.buildings.barracks).toBe(0);
  expect(state.buildings.stable).toBe(0);
  expect(state.troops.rider).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('clean-master-stable.png'), scale: 'css' });
  expect(errors).toEqual([]);
});

test('independent stable upgrades and cavalry training use the real queues above the mobile sheet', async ({ page, request }, testInfo) => {
  expect((await request.post('/__village_test/offline-scenario')).ok()).toBe(true);
  expect((await request.post('/__village_test/advance-five-hours')).ok()).toBe(true);
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const stable = village.locator('[data-building-region="stable"]');
  await stable.click();
  const panel = page.getByRole('region', { name: 'تفاصيل الإسطبل', exact: true });
  await expect(panel).toContainText('مستوى الإسطبل ٠');
  await expect(panel.getByRole('button', { name: 'درّب الفرسان', exact: true })).toBeDisabled();
  const buildRequest = page.waitForRequest((request) => request.method() === 'POST' &&
    new URL(request.url()).pathname === '/api/kingdoms');
  await panel.getByRole('button', { name: 'طوّر الإسطبل', exact: true }).click();
  expect((await buildRequest).postDataJSON().command).toMatchObject({ type: 'build', building: 'stable' });
  await expect.poll(async () => (await (await request.get('/api/kingdoms')).json()).data.villages[0].build?.building).toBe('stable');
  expect((await request.post('/__village_test/advance-five-hours')).ok()).toBe(true);
  await refreshWorld(page);
  await expect(panel).toContainText('مستوى الإسطبل ١');
  const state = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  expect(state.buildings).toMatchObject({ stable: 1, barracks: 1 });
  const trainRequest = page.waitForRequest((request) => request.method() === 'POST' &&
    new URL(request.url()).pathname === '/api/kingdoms');
  await panel.getByRole('button', { name: 'درّب الفرسان', exact: true }).click();
  expect((await trainRequest).postDataJSON().command).toMatchObject({ type: 'train', unit: 'rider', count: 1 });
  await expect(panel.getByLabel('قائمة تدريب القرية')).toContainText('خيّال');
  await expect(panel.getByRole('button', { name: 'درّب الفرسان', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  const sheet = page.locator('aside[aria-label="إدارة مباني القرية"]');
  await expect.poll(async () => {
    const [rect, sheetRect] = await Promise.all([stable.boundingBox(), sheet.boundingBox()]);
    return !!rect && !!sheetRect && rect.y + rect.height / 2 < sheetRect.y - 8 &&
      rect.y + rect.height / 2 > 0 && rect.width >= 43.9 && rect.height >= 43.9;
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('stable-mobile-sheet.png'), scale: 'css' });
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await village.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  await expectOverview(page);
  await revealBuilding(page, 'barracks');
  await clickBuilding(page, 'barracks');
  await expect(page.getByRole('region', { name: 'تفاصيل الثكنة', exact: true })).toBeVisible();
  await expect(panel).toHaveCount(0);
});

test('new master artwork, camera, real build lifecycle, and world navigation', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  await expect(village).toBeVisible();
  const viewport = village.locator('[data-zoom]').first();
  await village.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  await expectOverview(page);
  await expect
    .poll(() =>
      village
        .locator('img')
        .first()
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0 && image.currentSrc.includes('mamluk-capital')),
    )
    .toBe(true);
  await expect(village.locator('canvas')).toBeVisible();
  await expect(viewport).toHaveAttribute('data-pixi-ready', 'true');
  await village.getByRole('button', { name: 'تكبير القرية', exact: true }).click();
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-zoom')))
    .toBeGreaterThan(1);
  await village.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  await expectOverview(page);
  await village.getByRole('button', { name: /دار الحكم.*المستوى/ }).click();
  await expect(page.getByRole('heading', { name: 'دار الحكم', exact: true })).toBeVisible();
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-zoom')))
    .toBeGreaterThan(1.5);
  await expect
    .poll(() =>
      viewport.evaluate(async (element) => {
        const snapshot = () =>
          ['data-camera-x', 'data-camera-y', 'data-zoom']
            .map((key) => element.getAttribute(key))
            .join();
        const before = snapshot();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return snapshot() === before;
      }),
    )
    .toBe(true);
  if ((page.viewportSize()?.width ?? 1920) <= 1000) {
    const sheet = page.locator('aside[aria-label="إدارة مباني القرية"]');
    await expect(sheet).toBeVisible();
    await expect
      .poll(async () => {
        const [buildingBounds, sheetBounds] = await Promise.all([
          village.locator('[data-building="hall"]').boundingBox(),
          sheet.boundingBox(),
        ]);
        if (!buildingBounds || !sheetBounds) return false;
        const buildingCenter = buildingBounds.y + buildingBounds.height / 2;
        const height = page.viewportSize()!.height;
        return (
          sheetBounds.y + sheetBounds.height <= height &&
          sheetBounds.height <= height * 0.44 + 1 &&
          buildingCenter > 0 &&
          buildingCenter < sheetBounds.y - 8
        );
      })
      .toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath('selected-building.png'),
    scale: 'css',
  });
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await village.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  await revealBuilding(page, 'farm');
  await village.getByRole('button', { name: /مزارع الغذاء.*المستوى/ }).click();
  const panel = page.getByRole('region', { name: 'تفاصيل مزارع الغذاء' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'طوّر المبنى' }).click();
  // Mobile keeps the closed queue drawer out of the focused building viewport.
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await setQueues(page);
  await expect(page.getByRole('region', { name: 'قوائم التنفيذ' })).toContainText('مزارع الغذاء');
  await expect
    .poll(async () =>
      (await page.request.get('/api/kingdoms'))
        .json()
        .then((body) => body.data.villages[0].buildings.farm),
    )
    .toBe(2);
  await refreshWorld(page);
  await setQueues(page, false);
  await revealBuilding(page, 'farm');
  await village.getByRole('button', { name: /مزارع الغذاء.*المستوى/ }).click();
  await expect(panel).toContainText('٢');
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await village.getByRole('button', { name: 'إظهار أسماء المباني' }).click();
  await expect(village.getByRole('button', { name: 'إظهار أسماء المباني' })).toHaveAttribute('aria-pressed', 'false');
  await village.getByRole('button', { name: 'إظهار أسماء المباني' }).click();
  await expect(village.getByRole('button', { name: 'إظهار أسماء المباني' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await setVillageSettings(page);
  await village.getByLabel('جودة المشهد').selectOption('low');
  await village.getByRole('button', { name: 'إيقاف الحركة' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await setVillageSettings(page, false);
  await setQueues(page, false);
  await page.screenshot({ path: testInfo.outputPath('interactive-village.png'), fullPage: true });
  if ((page.viewportSize()?.width ?? 1920) <= 1000) {
    await page.getByRole('navigation', { name: 'تنقل المملكة', exact: true })
      .getByRole('link', { name: 'انتقل إلى العالم', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'انتقل إلى خريطة العالم' }).click();
  }
  await expect(page).toHaveURL((url) =>
    url.pathname.replace(/\/$/, '') === '/games/kingdoms/world-map' &&
    url.searchParams.get('worldId') === 'browser-world' &&
    url.searchParams.get('villageId') === 'v1',
  );
  // Production navigates to the separate geographic route; this fixture renders the village route.
  await page.goBack();
  await expect(village).toBeVisible();
  expect(errors).toEqual([]);
});

test('selected building stays above the sheet after a viewport resize', async ({ page }) => {
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  await village.getByRole('button', { name: /دار الحكم.*المستوى/ }).click();
  await expect(page.getByRole('region', { name: 'تفاصيل دار الحكم' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const sheet = page.locator('aside[aria-label="إدارة مباني القرية"]');
  await expect(sheet).toBeVisible();
  await expect
    .poll(async () => {
      const [buildingBounds, sheetBounds] = await Promise.all([
        village.locator('[data-building="hall"]').boundingBox(),
        sheet.boundingBox(),
      ]);
      if (!buildingBounds || !sheetBounds) return false;
      const buildingCenter = buildingBounds.y + buildingBounds.height / 2;
      const height = page.viewportSize()!.height;
      return (
        sheetBounds.y + sheetBounds.height <= height &&
        sheetBounds.height <= height * 0.44 + 1 &&
        buildingCenter > 0 &&
        buildingCenter < sheetBounds.y - 8
      );
    })
    .toBe(true);
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await expect(sheet).toHaveCount(0);
});

test('reduced motion leaves every important scene command available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  await village.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  await expectOverview(page);
  await village.getByRole('button', { name: /دار الحكم.*المستوى/ }).click();
  await expect(page.getByRole('region', { name: 'تفاصيل دار الحكم' })).toBeVisible();
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await village.getByRole('button', { name: 'عرض القرية بالكامل' }).click();
  await expectOverview(page);
  await setVillageSettings(page);
  await village.getByLabel('جودة المشهد').selectOption('high');
  await expect(village.locator('canvas')).toBeVisible();
});

test('keyboard, drag and pinch preserve bounded world coordinates', async ({ page, isMobile }) => {
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const viewport = village.locator('[data-zoom]').first();
  await village.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  const overviewZoom = await expectOverview(page);
  await viewport.focus();
  await page.keyboard.press('+');
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-zoom')))
    .toBeCloseTo(Math.min(3.5, overviewZoom * 1.25), 2);
  await page.keyboard.press('0');
  await expectOverview(page);
  await village.getByRole('button', { name: 'تكبير القرية', exact: true }).click();
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-zoom')))
    .toBeCloseTo(Math.min(3.5, overviewZoom * 1.25), 2);
  // Leave room for an actual pinch gesture when the portrait overview is already near max zoom.
  if (isMobile) {
    await viewport.focus();
    await page.keyboard.press('-');
    await expect.poll(async () => Number(await viewport.getAttribute('data-zoom'))).toBeLessThan(3.4);
  }
  await viewport.scrollIntoViewIfNeeded();
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2;
  const y = bounds!.y + bounds!.height / 2;
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: x - 25, y, id: 1 },
        { x: x + 25, y, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 70, y, id: 1 },
        { x: x + 70, y, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -300);
  }
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-zoom')))
    .toBeGreaterThan(1.25);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 1000, y + 1000, { steps: 5 });
  await page.mouse.up();
  const zoom = Number(await viewport.getAttribute('data-zoom'));
  expect(zoom).toBeLessThanOrEqual(3.5);
  expect(Number(await viewport.getAttribute('data-camera-x'))).toBeGreaterThanOrEqual(0);
  expect(Number(await viewport.getAttribute('data-camera-x'))).toBeLessThanOrEqual(VILLAGE_WORLD.width);
  expect(Number(await viewport.getAttribute('data-camera-y'))).toBeGreaterThanOrEqual(0);
  expect(Number(await viewport.getAttribute('data-camera-y'))).toBeLessThanOrEqual(VILLAGE_WORLD.height);
  await village.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  await expectOverview(page);
});

test('main wall, embassy and mine clicks remain separate from gate and auxiliary regions', async ({
  page,
}) => {
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  await village.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  await expectOverview(page);
  const read = await page.request.get('/api/kingdoms');
  const config = (await read.json()).data.config;
  for (const building of ['wall', 'embassy', 'mine']) {
    await revealBuilding(page, building);
    await clickBuilding(page, building);
    await expect(
      page.getByRole('region', { name: `تفاصيل ${config.buildings[building].name}`, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
    await village.getByRole('button', { name: 'عرض القرية بالكامل' }).click();
    await expectOverview(page);
  }
});

test('rally point opens the existing campaign flow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920' && testInfo.project.name !== 'iphone');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const viewport = village.locator('[data-village-scene]');
  await expect(viewport).toHaveAttribute('data-pixi-ready', 'true');
  const openRally = async () => {
    const hotspot = village.getByRole('button', { name: 'نقطة تجمع الجيوش، مركز القيادة العسكرية' });
    await expect(hotspot).toBeVisible();
    const sceneBox = await viewport.boundingBox();
    const hotspotBox = await hotspot.boundingBox();
    expect(sceneBox && hotspotBox).toBeTruthy();
    expect(hotspotBox!.x).toBeGreaterThanOrEqual(sceneBox!.x - 1);
    expect(hotspotBox!.y).toBeGreaterThanOrEqual(sceneBox!.y - 1);
    expect(hotspotBox!.x + hotspotBox!.width).toBeLessThanOrEqual(sceneBox!.x + sceneBox!.width + 1);
    await hotspot.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('region', { name: 'نقطة تجمع الجيوش' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'نقطة تجمع الجيوش' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    return panel;
  };
  if (testInfo.project.name === 'iphone') {
    const panel = await openRally();
    await expect(panel.getByRole('button', { name: 'إرسال جيش' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('rally-mobile.png'), scale: 'css' });
    await panel.getByRole('button', { name: 'إرسال جيش' }).click();
    await expect(page.getByLabel('نوع الحملة')).toHaveValue('attack');
    return;
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openRally();
  await page.screenshot({ path: testInfo.outputPath('rally-1080.png'), scale: 'css' });
  await page.getByRole('button', { name: 'أغلق نقطة التجمع' }).click();
  await page.setViewportSize({ width: 3840, height: 2160 });
  const panel = await openRally();
  await page.screenshot({ path: testInfo.outputPath('rally-4k.png'), scale: 'css' });
  await panel.getByRole('button', { name: 'استطلاع' }).click();
  await expect(page.getByLabel('نوع الحملة')).toHaveValue('scout');
});

test('responsive quality and incoming threat indicators preserve production presentation', async ({ page, request }, testInfo) => {
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const viewport = village.locator('[data-village-scene]');
  await setVillageSettings(page);
  for (const [quality, fidelity, width] of [['low', 'standard', 960], ['high', 'hidpi', 1280], ['ultra', 'ultra', 1672]] as const) {
    await village.getByLabel('جودة المشهد').selectOption(quality);
    await expect(viewport).toHaveAttribute('data-terrain-fidelity', fidelity);
    await expect.poll(() => viewport.locator('picture img:not([data-resource-art])').evaluate((image: HTMLImageElement) => image.complete ? image.naturalWidth : 0)).toBe(width);
  }
  await setVillageSettings(page, false);
  await page.screenshot({ path: testInfo.outputPath('ultra-responsive-master.png'), scale: 'css' });
  expect((await request.post('/__village_test/incoming-attack')).ok()).toBe(true);
  await refreshWorld(page);
  await expect(page.getByRole('alert', { name: 'هجوم قادم' })).toBeVisible();
  await expect(page.getByLabel('مؤشر تهديد عسكري عند البوابة')).toBeVisible();
  await expect(viewport).toHaveAttribute('data-threat-severity', /WARNING|DANGER|CRITICAL/);
  await page.screenshot({ path: testInfo.outputPath('incoming-threat.png'), scale: 'css' });
});

test('readable resource cards and independent alpha production buildings use confirmed tiers', async ({ page, request }, testInfo) => {
  expect((await request.post('/__village_test/resource-scenario')).ok()).toBe(true);
  const loaded = new Set<string>();
  page.on('response', (response) => {
    if (response.ok()) loaded.add(new URL(response.url()).pathname);
  });
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const viewport = village.locator('[data-village-scene]');
  await expect(viewport).toHaveAttribute('data-pixi-ready', 'true');
  const resources = page.getByRole('region', { name: 'موارد القرية', exact: true });
  await expect(resources.locator('[data-resource]')).toHaveCount(5);
  const readableCards = await resources.evaluate((element) => {
    const transparent = (node: Element) => {
      const style = getComputedStyle(node);
      return style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none' &&
        ['borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth'].every((key) => style[key as keyof CSSStyleDeclaration] === '0px');
    };
    const opaqueCard = (node: Element) => {
      const style = getComputedStyle(node);
      const color = style.backgroundColor.match(/^rgba?\(([^)]+)\)$/)?.[1].split(',').map(Number);
      return color && (color.length === 3 || color[3] === 1) && Number.parseFloat(style.borderTopWidth) > 0;
    };
    return transparent(element.parentElement!) && Array.from(element.querySelectorAll('[data-resource]')).every(opaqueCard);
  });
  expect(readableCards).toBe(true);
  for (const resource of ['wood', 'stone', 'iron', 'food', 'gold']) {
    const icon = resources.locator(`[data-resource="${resource}"] img`);
    // The mobile resource row scrolls horizontally; bring each lazy image into view.
    await icon.scrollIntoViewIfNeeded();
    await expect(icon).toBeVisible();
    await expect.poll(() => icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
  const cardRow = await resources.boundingBox();
  const queueHeader = await page.locator('summary').filter({ hasText: 'البناء والتدريب' }).boundingBox();
  expect(queueHeader!.y).toBeGreaterThanOrEqual(cardRow!.y + cardRow!.height + 8);
  await page.getByRole('button', { name: 'إعدادات العالم والقرية', exact: true }).click();
  await expect(page.getByRole('button', { name: 'تحديث', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'إعدادات العالم والقرية', exact: true }).click();
  await page.getByRole('button', { name: 'إدارة المملكة', exact: true }).click();
  await expect(page.getByRole('button', { name: 'لوحة المملكة', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'إدارة المملكة', exact: true }).click();
  await setVillageSettings(page);
  await village.getByLabel('جودة المشهد').selectOption('high');
  await setVillageSettings(page, false);
  const buildings = ['lumber', 'quarry', 'mine', 'farm', 'treasury'];
  await expect.poll(() => buildings.every((id) => loaded.has(`/game-art/kingdoms/village/buildings/${id}-l3-hidpi.webp`))).toBe(true);
  expect(await viewport.locator('[data-resource-art]').count()).toBe(0);
  const state = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  for (const id of buildings) expect(state.buildings[id]).toBe(3);
  await village.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  await expectOverview(page);
  await page.screenshot({ path: testInfo.outputPath('transparent-resources-overview.png'), scale: 'css' });
  await revealBuilding(page, 'lumber');
  await clickBuilding(page, 'lumber');
  await expect(page.getByRole('region', { name: 'تفاصيل حطّاب المملكة', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('transparent-resource-selected.png'), scale: 'css' });
  if (testInfo.project.name === 'iphone') {
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(page.getByRole('region', { name: 'موارد القرية', exact: true })).toBeVisible();
    expect(await resources.evaluate((element) => Array.from(element.querySelectorAll('[data-resource]')).every((card) => card.scrollWidth <= card.clientWidth + 1))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('resource-cards-mobile-320.png'), scale: 'css' });
  }
});

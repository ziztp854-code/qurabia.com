import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';

const testRuntime = createRequire(__filename);
const imageRuntime = createRequire(testRuntime.resolve('next/package.json'));
const decodeImage = imageRuntime('sharp') as (input: Buffer | string) => {
  extract: (rect: { left: number; top: number; width: number; height: number }) => {
    toBuffer: () => Promise<Buffer>;
  };
  stats: () => Promise<{ channels: { mean: number }[] }>;
};

test.beforeEach(async ({ request }) => {
  expect((await request.post('/__village_test/reset')).ok()).toBeTruthy();
});

test('village command view expands the scene and keeps building choices and actual activity clear', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const viewport = village.locator('[data-village-scene]');
  await expect(viewport).toHaveAttribute('data-pixi-ready', 'true');
  const before = (await (await page.request.get('/api/kingdoms')).json()).data.villages[0];
  const directory = village.getByRole('navigation', { name: 'دليل مباني القرية' });
  await expect(directory).toBeVisible({ timeout: 3000 });
  await expect(directory.getByRole('button')).toHaveCount(15);
  await expect(directory.getByRole('region', { name: 'العسكر' })).toBeVisible();
  await expect(directory.getByRole('region', { name: 'الدفاع' })).toBeVisible();
  await expect(village.getByRole('region', { name: 'نشاط القرية' })).toBeVisible();
  await expect.poll(() => page.getByRole('region', { name: 'موارد القرية' }).locator('img').evaluateAll(
    (images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  if ((page.viewportSize()?.width ?? 0) > 1100) {
    const originalSize = page.viewportSize()!;
    await page.setViewportSize({ width: 1366, height: 900 });
    await expect.poll(async () => {
      const [sceneBox, directoryBox] = await Promise.all([viewport.boundingBox(), directory.boundingBox()]);
      return Math.abs(sceneBox!.height - directoryBox!.height);
    }).toBeLessThan(1);
    await viewport.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('village-command-laptop.png'), scale: 'css' });
    await page.setViewportSize(originalSize);
  }
  const navigation = page.getByLabel('إدارة المملكة');
  await navigation.getByRole('button', { name: 'لوحة المملكة', exact: true }).click();
  await expect(page.getByRole('region', { name: 'ملخص المملكة' })).toBeVisible();
  await expect(viewport).toHaveAttribute('data-pixi-ready', 'true');
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('village-command-overview.png'), scale: 'css' });
  await navigation.getByRole('button', { name: 'القرية', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-pixi-ready', 'true');
  const initialHeight = (await viewport.boundingBox())!.height;
  await village.getByRole('button', { name: 'توسيع المشهد', exact: true }).click();
  await expect(village).toHaveAttribute('data-expanded', 'true');
  await expect.poll(async () => (await viewport.boundingBox())!.height).toBeGreaterThan(initialHeight);
  await viewport.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('village-command-expanded.png'), scale: 'css' });
  await village.getByRole('button', { name: 'العرض العادي', exact: true }).click();
  await expect(village).toHaveAttribute('data-expanded', 'false');
  await directory.getByRole('button', { name: 'اختيار مزارع الغذاء', exact: true }).click();
  await expect(page.getByRole('region', { name: 'تفاصيل مزارع الغذاء', exact: true })).toBeVisible();
  await expect(directory.getByRole('button', { name: 'اختيار مزارع الغذاء', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  await viewport.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('village-command-desktop.png'), scale: 'css' });
  await page.setViewportSize({ width: 390, height: 844 });
  await viewport.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await directory.getByRole('button', { name: 'اختيار الإسطبل', exact: true }).click();
  await expect(page.getByRole('region', { name: 'تفاصيل الإسطبل', exact: true })).toBeVisible();
  await expect.poll(async () => {
    const [building, sheet] = await Promise.all([
      village.locator('[data-building-region="stable"]').boundingBox(),
      page.locator('[data-village-building-sheet]').boundingBox(),
    ]);
    return !!building && !!sheet && building.y + building.height / 2 > 0 &&
      building.y + building.height / 2 < sheet.y - 8;
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('village-command-mobile.png'), scale: 'css' });
  const after = (await (await page.request.get('/api/kingdoms')).json()).data.villages[0];
  expect(after.buildings).toEqual(before.buildings);
  expect(after.troops).toEqual(before.troops);
  expect(errors).toEqual([]);
});

test('stable L1–L5 calibration renders separate local cutouts without changing confirmed state', async ({ page }, testInfo) => {
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
  expect(requested).toEqual([]);
  await village.locator('[data-building-region="stable"]').click();
  const panel = page.getByRole('region', { name: 'تفاصيل الإسطبل', exact: true });
  await expect(panel).toContainText('مستوى الإسطبل ٠');
  const calibration = village.locator('details').filter({ hasText: 'معايرة مشهد القرية — وضع التطوير' });
  await calibration.locator('summary').click();
  await calibration.getByLabel('المبنى للمعايرة').selectOption('stable');
  await calibration.locator('summary').click();
  const stablePixels = async () => {
    // Editing calibration controls below the scene may scroll it off-screen on mobile.
    await viewport.scrollIntoViewIfNeeded();
    const clip = await viewport.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const data = (element as HTMLElement).dataset;
      const scale = Math.min(element.clientWidth / 1536, element.clientHeight / 1024) * Number(data.zoom);
      return {
        x: rect.x + element.clientWidth / 2 + (454 - Number(data.cameraX)) * scale,
        y: rect.y + element.clientHeight / 2 + (516 - Number(data.cameraY)) * scale,
        width: 111 * scale,
        height: 67 * scale,
      };
    });
    return (await page.screenshot({ clip, scale: 'css' })).toString('base64');
  };
  let previous = await stablePixels();
  // The initial field displays 1 before an override exists; start with a changed value.
  const previewOrder = [5, 1, 2, 3, 4];
  for (const [index, level] of previewOrder.entries()) {
    await calibration.locator('summary').click();
    const loaded = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(`/stable-l${level}.webp`));
    await calibration.getByLabel('المستوى المرئي التجريبي').fill(String(level));
    expect((await loaded).ok()).toBe(true);
    await calibration.locator('summary').click();
    await expect.poll(stablePixels).not.toBe(previous);
    previous = await stablePixels();
    expect(requested).toEqual(previewOrder.slice(0, index + 1).map((tier) => `stable-l${tier}.webp`));
    await page.screenshot({ path: testInfo.outputPath(`stable-l${level}-${testInfo.project.name}.png`), scale: 'css' });
  }
  // Revisiting a level uses the existing Pixi texture cache.
  await calibration.locator('summary').click();
  await calibration.getByLabel('المستوى المرئي التجريبي').fill('1');
  await calibration.locator('summary').click();
  await expect.poll(stablePixels).not.toBe(previous);
  expect(requested).toHaveLength(5);
  await expect(panel).toContainText('مستوى الإسطبل ٠');
  await expect(panel.getByRole('button', { name: 'درّب الفرسان', exact: true })).toBeDisabled();
  const state = (await (await page.request.get('/api/kingdoms')).json()).data.villages[0];
  expect(state.buildings.barracks).toBe(0);
  expect(state.buildings.stable).toBe(0);
  expect(state.troops.rider).toBe(0);
  expect(errors).toEqual([]);
});

test('stable uses confirmed barracks and the genuine cavalry queue, with safe mobile focus', async ({ page }, testInfo) => {
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const stable = village.locator('[data-building-region="stable"]');
  await stable.click();
  const panel = page.getByRole('region', { name: 'تفاصيل الإسطبل', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('مستوى الإسطبل ٠');
  await expect(panel.getByRole('button', { name: 'درّب الفرسان', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await village.locator('[data-building="barracks"]').click();
  const barracks = page.getByRole('region', { name: 'تفاصيل الثكنة', exact: true });
  await expect(barracks).toBeVisible();
  await barracks.getByRole('button', { name: 'طوّر المبنى' }).click();
  await expect(barracks).toContainText('مستوى ٠');
  await expect.poll(async () => (await (await page.request.get('/api/kingdoms')).json()).data.villages[0].buildings.barracks).toBe(1);
  await page.getByRole('button', { name: 'تحديث', exact: true }).click();
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await stable.click();
  await expect(panel).toContainText('مستوى الإسطبل ٠');
  await expect(panel.getByRole('button', { name: 'درّب الفرسان', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  const sheet = page.locator('[data-village-building-sheet]');
  const directoryStable = village.getByRole('button', { name: 'اختيار الإسطبل', exact: true });
  await expect.poll(async () => {
    const [rect, barracks, rally, sheetRect, listTarget] = await Promise.all([
      stable.boundingBox(),
      village.locator('[data-building="barracks"]').boundingBox(),
      village.locator('[data-rally-point]').boundingBox(),
      sheet.boundingBox(),
      directoryStable.boundingBox(),
    ]);
    if (!rect || !barracks || !rally || !sheetRect || !listTarget) return false;
    const separated = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1;
    return separated(rect, barracks) && separated(rect, rally) && separated(barracks, rally)
      && listTarget.height >= 44 && listTarget.width >= 44 && sheetRect.height > 0 && rect.width > 8;
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('stable-mobile-sheet.png'), scale: 'css' });
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  const viewport = village.locator('[data-village-scene]');
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  await viewport.scrollIntoViewIfNeeded();
  // Hit test the artwork's actual barracks center, not the expanded DOM button center.
  const point = await viewport.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const camera = (element as HTMLElement).dataset;
    const scale = Math.min(element.clientWidth / 1536, element.clientHeight / 1024) * Number(camera.zoom);
    return { x: rect.x + element.clientWidth / 2 + (469 - Number(camera.cameraX)) * scale,
      y: rect.y + element.clientHeight / 2 + (504 - Number(camera.cameraY)) * scale };
  });
  await page.mouse.click(point.x, point.y);
  await expect(barracks).toBeVisible();
  await expect(panel).toHaveCount(0);
});

test('original artwork, camera, real build lifecycle, and world navigation', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  await expect(village).toBeVisible();
  const viewport = village.locator('[data-zoom]').first();
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  await expect
    .poll(() =>
      village
        .locator('img')
        .first()
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 1536),
    )
    .toBe(true);
  await expect(village.locator('canvas')).toBeVisible();
  await expect(viewport).toHaveAttribute('data-pixi-ready', 'true');
  await expect(village.getByRole('button', { name: 'تكبير القرية' })).toHaveCount(0);
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  await village.getByRole('button', { name: /دار الحكم.*المستوى/ }).click();
  await expect(page.getByRole('heading', { name: 'دار الحكم', exact: true })).toBeVisible();
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
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
    const sheet = page.locator('[data-village-building-sheet]');
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
          sheetBounds.height <= height * 0.38 + 1 &&
          buildingCenter > 0 &&
          buildingCenter < sheetBounds.y - 8
        );
      })
      .toBe(true);
  }
  const selectedScreenshot = await page.screenshot({
    path: testInfo.outputPath('selected-building.png'),
    scale: 'css',
  });
  if (testInfo.project.name === 'tablet') {
    const camera = await viewport.evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
      x: Number((element as HTMLElement).dataset.cameraX),
      y: Number((element as HTMLElement).dataset.cameraY),
      zoom: Number((element as HTMLElement).dataset.zoom),
    }));
    const scale = Math.min(camera.width / 1536, camera.height / 1024) * camera.zoom;
    const bounds = (await viewport.boundingBox())!;
    const actualPixels = await decodeImage(selectedScreenshot)
      .extract({
        left: Math.round(bounds.x + camera.width / 2 + (540 - camera.x) * scale),
        top: Math.round(bounds.y + camera.height / 2 + (265 - camera.y) * scale),
        width: Math.round(16 * scale),
        height: Math.round(16 * scale),
      })
      .toBuffer();
    const terrainUrl = await viewport.locator('img').evaluate((img: HTMLImageElement) => img.currentSrc);
    const plate = terrainUrl.includes('village-oasis-ultra.webp')
      ? 'public/game-art/kingdoms/village-oasis-ultra.webp'
      : terrainUrl.includes('village-oasis-hidpi.webp')
        ? 'public/game-art/kingdoms/village-oasis-hidpi.webp'
        : 'public/game-art/kingdoms/village-oasis.webp';
    const plateScale = plate.includes('ultra') ? 5 : plate.includes('hidpi') ? 3840 / 1536 : 1;
    const originalPixels = await decodeImage(plate)
      .extract({
        left: Math.round(540 * plateScale),
        top: Math.round(265 * plateScale),
        width: Math.max(1, Math.round(16 * plateScale)),
        height: Math.max(1, Math.round(16 * plateScale)),
      })
      .toBuffer();
    const [actual, original] = await Promise.all([
      decodeImage(actualPixels).stats(),
      decodeImage(originalPixels).stats(),
    ]);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs(actual.channels[channel].mean - original.channels[channel].mean),
      ).toBeLessThan(50);
    }
  }
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await village.getByRole('button', { name: /مزارع الغذاء.*المستوى/ }).click();
  const panel = page.getByRole('region', { name: 'تفاصيل مزارع الغذاء' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'طوّر المبنى' }).click();
  await expect(page.getByRole('region', { name: 'قوائم التنفيذ' })).toContainText('مزارع الغذاء');
  await expect
    .poll(async () =>
      (await page.request.get('/api/kingdoms'))
        .json()
        .then((body) => body.data.villages[0].buildings.farm),
    )
    .toBe(2);
  await page.getByRole('button', { name: 'تحديث', exact: true }).click();
  await expect(panel).toContainText('٢');
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await expect(village.getByRole('button', { name: 'إظهار أسماء المباني' })).toHaveCount(0);
  await expect(viewport).toHaveAttribute('data-labels', 'false');
  const terrainFidelity = await viewport.getAttribute('data-terrain-fidelity');
  const terrainSrc = await viewport.locator('img').evaluate((img: HTMLImageElement) => img.currentSrc);
  if (testInfo.project.name === 'iphone' || testInfo.project.name === 'android') {
    expect(terrainFidelity).toBe('standard');
    expect(terrainSrc).not.toContain('village-oasis-ultra');
    expect(terrainSrc).not.toContain('village-oasis-hidpi');
  }
  if (testInfo.project.name === 'desktop-1920') {
    expect(terrainFidelity).not.toBe('ultra');
    expect(terrainSrc).not.toContain('village-oasis-ultra');
  }
  await village.getByLabel('جودة المشهد').selectOption('low');
  await village.getByRole('button', { name: 'إيقاف الحركة' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('interactive-village.png'), fullPage: true });
  await page.getByRole('button', { name: 'انتقل إلى خريطة العالم' }).click();
  await expect(page).toHaveURL(/\/games\/kingdoms\/world-map\/?\?worldId=browser-world&villageId=v1$/);
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
  const sheet = page.locator('[data-village-building-sheet]');
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
        sheetBounds.height <= height * 0.38 + 1 &&
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
  const viewport = village.locator('[data-zoom]').first();
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  await village.getByRole('button', { name: /دار الحكم.*المستوى/ }).click();
  await expect(page.getByRole('region', { name: 'تفاصيل دار الحكم' })).toBeVisible();
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  await village.getByLabel('جودة المشهد').selectOption('high');
  await expect(village.locator('canvas')).toBeVisible();
});

test('keyboard, wheel and pinch leave the fitted village fixed', async ({ page, isMobile }) => {
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const viewport = village.locator('[data-zoom]').first();
  await expect(viewport).toHaveAttribute('data-fixed-view', 'true');
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  await viewport.focus();
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowLeft');
  await expect(village.getByRole('button', { name: 'تكبير القرية' })).toHaveCount(0);
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
    await page.mouse.dblclick(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 180, y + 80, { steps: 4 });
    await page.mouse.up();
  }
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
});

test('main wall, embassy and mine clicks remain separate from gate and auxiliary regions', async ({
  page,
}) => {
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const viewport = village.locator('[data-zoom]').first();
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  const read = await page.request.get('/api/kingdoms');
  const config = (await read.json()).data.config;
  for (const building of ['wall', 'embassy', 'mine']) {
    await village.locator(`[data-building="${building}"]`).click();
    await expect(
      page.getByRole('region', { name: `تفاصيل ${config.buildings[building].name}`, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
    await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  }
});

test('level twelve village finishes its real queue after five hours offline', async ({ page, context, request }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seeded = await request.post('/__village_test/offline-scenario');
  expect(seeded.ok()).toBe(true);
  const before = (await seeded.json()).data.villages[0];
  expect(before.progression.level).toBe(12);
  await page.goto('/');
  await expect(page.getByLabel('مستوى القرية', { exact: true })).toContainText('١٢');
  for (const [building, label] of [['hall', 'دار الحكم'], ['wall', 'السور'], ['warehouse', 'المخزن']]) {
    const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
    await village.getByLabel('اختر مبنى من الخريطة').selectOption(building);
    const panel = page.getByRole('region', { name: `تفاصيل ${label}`, exact: true });
    await panel.getByRole('button', { name: building === 'hall' ? 'طوّر المبنى' : 'أضف إلى قائمة البناء', exact: true }).click();
    await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  }
  const queued = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  expect(queued.constructionQueue.filter((item: { status: string }) => ['BUILDING', 'QUEUED'].includes(item.status))).toHaveLength(3);
  await page.getByRole('list', { name: 'مشاريع البناء' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('offline-queue.png'), fullPage: true });
  await page.close();
  expect((await request.post('/__village_test/advance-five-hours')).ok()).toBe(true);
  const returned = await context.newPage();
  await returned.emulateMedia({ reducedMotion: 'reduce' });
  await returned.goto('/');
  await expect(returned.getByRole('region', { name: 'قوائم التنفيذ', exact: true })).toHaveCount(0);
  const after = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  expect(after.buildings).toMatchObject({ hall: 8, wall: 6, warehouse: 9 });
  expect(after.training).toBeUndefined();
  expect(after.troops.guard).toBe(5);
  expect(after.resources.wood).toBeGreaterThan(queued.resources.wood);
  expect(after.progression.xp).toBeGreaterThan(before.progression.xp);
  expect(after.progression.power.total).toBeGreaterThan(before.progression.power.total);
  expect(after.progression.level).toBeGreaterThan(12);
  expect((await (await request.get('/api/kingdoms')).json()).data.villages[0].progression.xp).toBe(after.progression.xp);
  await expect(returned.getByLabel('مستوى القرية', { exact: true })).toContainText(new Intl.NumberFormat('ar-SA').format(after.progression.level));
  await expect(returned.getByRole('region', { name: 'تقدم القرية' })).toHaveAttribute('data-visual-tier', String(after.progression.visualTier));
  await returned.getByRole('region', { name: 'خريطة القرية', exact: true }).scrollIntoViewIfNeeded();
  await expect(returned.locator('[data-village-scene]')).toHaveAttribute('data-pixi-ready', 'true');
  expect(await returned.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await returned.screenshot({ path: testInfo.outputPath('offline-return.png'), fullPage: true });
});

test('HiDPI and 4K viewports keep the existing village camera and hotspots', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920' && testInfo.project.name !== 'iphone');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const village = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const viewport = village.locator('[data-village-scene]');
  await expect(viewport).toHaveAttribute('data-pixi-ready', 'true');
  await expect(village.getByRole('region', { name: 'تقدم القرية' })).toBeVisible();
  if (testInfo.project.name === 'iphone') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await village.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('village-mobile-overview.png'), scale: 'css' });
    return;
  }
  await page.setViewportSize({ width: 3440, height: 1440 });
  await viewport.scrollIntoViewIfNeeded();
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const ultrawide = await viewport.evaluate((element) => {
    const terrain = element.querySelector('img');
    if (!terrain) return false;
    const stage = element.getBoundingClientRect();
    const plate = terrain.getBoundingClientRect();
    const centered = Math.abs(plate.x + plate.width / 2 - (stage.x + stage.width / 2)) < 3;
    return plate.width <= stage.width + 1 && plate.height <= stage.height + 1 && centered && plate.width > 8;
  });
  expect(ultrawide).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('village-ultrawide-overview.png'), scale: 'css' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await viewport.scrollIntoViewIfNeeded();
  await expect.poll(() => viewport.getAttribute('data-terrain-fidelity')).not.toBe('ultra');
  await page.screenshot({ path: testInfo.outputPath('village-1080-overview.png'), scale: 'css' });
  await village.getByLabel('جودة المشهد').selectOption('high');
  await expect(viewport).toHaveAttribute('data-terrain-fidelity', 'hidpi');
  await expect(viewport).toHaveAttribute('data-terrain-src', '/game-art/kingdoms/village-oasis-hidpi.webp');
  await expect.poll(() => viewport.locator('img').evaluate((img: HTMLImageElement) => img.complete ? img.naturalWidth : 0)).toBe(3840);
  await viewport.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath('village-hidpi-overview.png'), scale: 'css' });
  await village.getByLabel('جودة المشهد').selectOption('auto');
  await page.setViewportSize({ width: 3840, height: 2160 });
  await expect(viewport).toHaveAttribute('data-pixi-ready', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await viewport.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('village-4k-overview.png'), scale: 'css' });
  await village.getByLabel('جودة المشهد').selectOption('ultra');
  await expect(viewport).toHaveAttribute('data-terrain-fidelity', 'ultra');
  await expect(viewport).toHaveAttribute('data-terrain-src', '/game-art/kingdoms/village-oasis-ultra.webp');
  await expect.poll(() => viewport.locator('img').evaluate((img: HTMLImageElement) => img.complete ? img.naturalWidth : 0)).toBe(7680);
  await page.screenshot({ path: testInfo.outputPath('village-4k-ultra-overview.png'), scale: 'css' });
  await expect(viewport).toHaveAttribute('data-zoom', /^1(?:\.0+)?$/);
  await expect(village.getByRole('button', { name: 'تكبير القرية' })).toHaveCount(0);
  await village.locator('[data-building="barracks"]').click();
  await expect(page.getByRole('region', { name: 'تفاصيل الثكنة', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('village-4k-selected-barracks.png'), scale: 'css' });
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await village.locator('[data-building-region="stable"]').click();
  await expect(page.getByRole('region', { name: 'تفاصيل الإسطبل', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('village-4k-selected-stable.png'), scale: 'css' });
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await village.getByRole('button', { name: /دار الحكم.*المستوى/ }).click();
  await expect(page.getByRole('region', { name: 'تفاصيل دار الحكم' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('village-4k-selected-building.png'), scale: 'css' });
  await page.getByRole('button', { name: 'أغلق تفاصيل المبنى' }).click();
  await village.getByRole('button', { name: /مزارع الغذاء.*المستوى/ }).click();
  await page.getByRole('region', { name: 'تفاصيل مزارع الغذاء' }).getByRole('button', { name: 'طوّر المبنى' }).click();
  await expect(page.getByRole('region', { name: 'قوائم التنفيذ' })).toContainText('مزارع الغذاء');
  await page.screenshot({ path: testInfo.outputPath('village-4k-construction.png'), scale: 'css' });
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

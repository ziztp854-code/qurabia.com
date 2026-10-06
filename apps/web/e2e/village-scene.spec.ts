import { expect, test as base, type Page } from '@playwright/test';

const test = base.extend<{ diagnostics: void }>({
  diagnostics: [
    async ({ page }, use, testInfo) => {
      const consoleLog: string[] = [],
        networkLog: string[] = [];
      page.on('console', (message) => consoleLog.push(`${message.type()}: ${message.text()}`));
      page.on('pageerror', (error) => consoleLog.push(`pageerror: ${error.message}`));
      page.on('response', (response) =>
        networkLog.push(
          `${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`,
        ),
      );
      page.on('requestfailed', (request) =>
        networkLog.push(
          `failed ${new URL(request.url()).pathname} ${request.failure()?.errorText}`,
        ),
      );
      await use();
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('console', {
          body: consoleLog.join('\n'),
          contentType: 'text/plain',
        });
        await testInfo.attach('network', {
          body: networkLog.join('\n'),
          contentType: 'text/plain',
        });
      }
    },
    { auto: true },
  ],
});

async function readyCity(page: Page) {
  const stage = page.locator('[data-village-scene]');
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  await expect(stage).toHaveAttribute('aria-busy', 'false');
  await expect(stage).toHaveAttribute('data-city-composition', /desktop|portrait/);
  await page.evaluate(() => document.fonts.ready);
  return stage;
}

async function expectOverview(page: Page) {
  const stage = await readyCity(page);
  await expect(stage).toHaveAttribute('data-camera-state', 'CITY_OVERVIEW');
  await expect(stage).toHaveAttribute('data-zoom', '1.000');
  await expect
    .poll(() =>
      stage.evaluate(
        (element: HTMLElement) =>
          Number(element.dataset.cameraX) === Number(element.dataset.worldWidth) / 2 &&
          Number(element.dataset.cameraY) === Number(element.dataset.worldHeight) / 2,
      ),
    )
    .toBe(true);
}

async function setDetails(page: Page, name: string | RegExp, open = true) {
  const summary = page.locator('summary').filter({ hasText: name });
  await summary.scrollIntoViewIfNeeded();
  const details = summary.locator('..');
  if ((await details.evaluate((element: HTMLDetailsElement) => element.open)) !== open)
    await summary.click();
  await expect(details).toHaveJSProperty('open', open);
}
const setVillageSettings = (page: Page, open = true) => setDetails(page, /^إعدادات القرية$/, open);
const setQueues = (page: Page, open = true) => setDetails(page, 'البناء والتدريب', open);
const sceneKey = (building: string) =>
  building === 'hall' ? 'palace' : building === 'rally' ? 'war-council' : building;

async function enterBuilding(page: Page, building: string) {
  await readyCity(page);
  await setVillageSettings(page);
  await page.getByLabel('اختر مبنى من الخريطة', { exact: true }).selectOption(building);
  // Do not carry the overview settings hover onto a newly mounted facility control.
  await page.mouse.move(0, 0);
  const scene = page.locator(`[data-city-scene="${sceneKey(building)}"]`);
  await expect(scene).toHaveAttribute('data-phase', 'active');
  await scene.locator('picture img').evaluate((image: HTMLImageElement) => image.decode());
  return scene;
}

async function back(page: Page) {
  await page.getByRole('button', { name: 'العودة إلى المدينة', exact: true }).click();
  await expect(page.locator('[data-city-scene]')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'خريطة القرية', exact: true })).toBeVisible();
}

async function clickBuilding(page: Page, building: string, touch = false) {
  const stage = await readyCity(page);
  const hotspot = stage.locator(
    building === 'stable' ? '[data-building-region="stable"]' : `[data-building="${building}"]`,
  );
  const bounds = await hotspot.boundingBox();
  expect(bounds).not.toBeNull();
  const point = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
  expect(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point),
    `${building} has an unobscured canvas interaction`,
  ).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(page.locator(`[data-city-scene="${sceneKey(building)}"]`)).toHaveAttribute(
    'data-phase',
    'active',
  );
}

async function refreshWorld(page: Page) {
  const settings = page.getByRole('button', { name: 'إعدادات العالم والقرية', exact: true });
  const opened = (await settings.getAttribute('aria-expanded')) === 'true';
  if (!opened) await settings.click();
  await page.getByRole('button', { name: 'تحديث', exact: true }).click();
  if (!opened) await settings.click();
}

async function expectBoundedCamera(page: Page) {
  expect(
    await page.locator('[data-village-scene]').evaluate((element: HTMLElement) => {
      const width = Number(element.dataset.worldWidth),
        height = Number(element.dataset.worldHeight);
      const x = Number(element.dataset.cameraX),
        y = Number(element.dataset.cameraY),
        zoom = Number(element.dataset.zoom);
      const scale = Math.min(element.clientWidth / width, element.clientHeight / height) * zoom;
      const halfX = Math.min(width / 2, element.clientWidth / scale / 2);
      const halfY = Math.min(height / 2, element.clientHeight / scale / 2);
      return (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        zoom >= 1 &&
        zoom <= 3.5 &&
        x >= halfX - 0.02 &&
        x <= width - halfX + 0.02 &&
        y >= halfY - 0.02 &&
        y <= height - halfY + 0.02
      );
    }),
  ).toBe(true);
}

test.beforeEach(async ({ request, page }) => {
  expect((await request.post('/__village_test/reset')).ok()).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
  test(`mobile city controls and dedicated scene at ${size.width}x${size.height}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'Run the touch size matrix once.');
    await page.setViewportSize(size);
    await page.goto('/');
    const stage = await readyCity(page);
    const navigation = page.getByRole('navigation', { name: 'تنقل المملكة', exact: true });
    await expect(navigation).toBeVisible();
    for (const control of await navigation.locator('button, a').all()) {
      const bounds = await control.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height);
    }
    await navigation.getByRole('button', { name: 'انتقل إلى التقارير' }).click();
    await expect(navigation.getByRole('button', { name: 'انتقل إلى التقارير' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await navigation.getByRole('button', { name: 'انتقل إلى القرية' }).click();
    await readyCity(page);
    await page.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
    await expectOverview(page);
    for (const name of [
      'تكبير القرية',
      'تصغير القرية',
      'عرض القرية بالكامل',
      'إظهار أسماء المباني',
    ]) {
      const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await clickBuilding(page, 'hall', true);
    const scene = page.locator('[data-city-scene="palace"]');
    await expect(
      scene.getByRole('button', { name: 'العودة إلى المدينة', exact: true }),
    ).toBeInViewport();
    await expect(
      scene.getByRole('region', { name: 'تفاصيل دار الحكم', exact: true }),
    ).toBeVisible();
    await expect(page.locator('aside[aria-label="إدارة مباني القرية"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`city-${size.width}-palace.png`),
      scale: 'css',
    });
    await back(page);
    await expect(stage).toBeVisible();
    await expectBoundedCamera(page);
  });
}

test('level twelve village finishes its real queue after five hours offline', async ({
  page,
  context,
  request,
}, testInfo) => {
  const seeded = await request.post('/__village_test/offline-scenario');
  expect(seeded.ok()).toBe(true);
  const before = (await seeded.json()).data.villages[0];
  expect(before.progression.level).toBe(12);
  await page.goto('/');
  await readyCity(page);
  await setVillageSettings(page);
  await expect(page.getByLabel('مستوى القرية', { exact: true })).toContainText('١٢');
  for (const [building, label] of [
    ['hall', 'دار الحكم'],
    ['wall', 'السور'],
    ['warehouse', 'المخزن'],
  ]) {
    const scene = await enterBuilding(page, building);
    const panel = scene.getByRole('region', { name: `تفاصيل ${label}`, exact: true });
    await expect(panel).toBeVisible();
    await panel
      .getByRole('button', {
        name: building === 'hall' ? 'طوّر المبنى' : 'أضف إلى قائمة البناء',
        exact: true,
      })
      .click();
    await expect(scene.locator('[data-city-feedback="notice"]')).toBeVisible();
    await back(page);
  }
  const queued = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  expect(
    queued.constructionQueue.filter((item: { status: string }) =>
      ['BUILDING', 'QUEUED'].includes(item.status),
    ),
  ).toHaveLength(3);
  await setVillageSettings(page, false);
  await setQueues(page);
  await expect(page.getByRole('list', { name: 'مشاريع البناء' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('offline-queue.png') });
  await page.close();
  expect((await request.post('/__village_test/advance-five-hours')).ok()).toBe(true);
  const returned = await context.newPage();
  await returned.emulateMedia({ reducedMotion: 'reduce' });
  await returned.goto('/');
  await readyCity(returned);
  await setQueues(returned);
  await expect(
    returned
      .getByRole('region', { name: 'قوائم التنفيذ', exact: true })
      .getByText('لا بناء قيد التنفيذ', { exact: true }),
  ).toBeVisible();
  const after = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  expect(after.buildings).toMatchObject({ hall: 8, wall: 6, warehouse: 9 });
  expect(after.training).toBeUndefined();
  expect(after.troops.guard).toBe(5);
  expect(after.resources.wood).toBeGreaterThan(queued.resources.wood);
  expect(after.progression.xp).toBeGreaterThan(before.progression.xp);
  expect(after.progression.power.total).toBeGreaterThan(before.progression.power.total);
  expect(after.progression.level).toBeGreaterThan(12);
  expect((await (await request.get('/api/kingdoms')).json()).data.villages[0].progression.xp).toBe(
    after.progression.xp,
  );
  await setQueues(returned, false);
  await setVillageSettings(returned);
  await expect(returned.getByLabel('مستوى القرية', { exact: true })).toContainText(
    new Intl.NumberFormat('ar-SA').format(after.progression.level),
  );
  await expect(returned.getByRole('region', { name: 'تقدم القرية' })).toHaveAttribute(
    'data-visual-tier',
    String(after.progression.visualTier),
  );
  await returned.screenshot({ path: testInfo.outputPath('offline-return.png') });
});

test('stable calibration preserves Living City artwork and confirmed gameplay state', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const stage = await readyCity(page);
  const master = await stage.locator('picture img').getAttribute('src');
  expect(master).toContain('/city-hub/overview-');
  const scene = await enterBuilding(page, 'stable');
  await expect(scene.getByText('مستوى الإسطبل ٠', { exact: true })).toBeVisible();
  await expect(scene.getByRole('button', { name: 'درّب الفرسان', exact: true })).toBeDisabled();
  await back(page);
  await setVillageSettings(page);
  const calibration = page
    .locator('details')
    .filter({
      has: page.locator('summary').filter({ hasText: /^معايرة مشهد القرية — وضع التطوير$/ }),
    })
    .last();
  await calibration.locator('summary').click();
  await calibration.getByLabel('المبنى للمعايرة').selectOption('stable');
  for (const level of [5, 1, 2, 3, 4]) {
    await calibration.getByLabel('المستوى المرئي التجريبي').fill(String(level));
    await expect(stage.locator('picture img')).toHaveAttribute('src', master!);
    const confirmed = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
    expect(confirmed.buildings).toMatchObject({ stable: 0, barracks: 0 });
    expect(confirmed.troops.rider).toBe(0);
  }
  await calibration.locator('summary').click();
  await setVillageSettings(page, false);
});

test('independent stable upgrades and cavalry training use real queues in the dedicated scene', async ({
  page,
  request,
}) => {
  expect((await request.post('/__village_test/offline-scenario')).ok()).toBe(true);
  expect((await request.post('/__village_test/advance-five-hours')).ok()).toBe(true);
  await page.goto('/');
  let scene = await enterBuilding(page, 'stable');
  await expect(scene.getByRole('button', { name: 'درّب الفرسان', exact: true })).toBeDisabled();
  for (const level of [1, 2]) {
    const posted = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && new URL(request.url()).pathname === '/api/kingdoms',
    );
    await scene.getByRole('button', { name: 'طوّر الإسطبل', exact: true }).click();
    expect((await posted).postDataJSON().command).toMatchObject({
      type: 'build',
      building: 'stable',
    });
    await expect
      .poll(
        async () =>
          (await (await request.get('/api/kingdoms')).json()).data.villages[0].build?.building,
      )
      .toBe('stable');
    expect((await request.post('/__village_test/advance-five-hours')).ok()).toBe(true);
    await page.reload();
    scene = await enterBuilding(page, 'stable');
    await expect(
      scene.getByText(`مستوى الإسطبل ${new Intl.NumberFormat('ar-SA').format(level)}`, {
        exact: true,
      }),
    ).toBeVisible();
  }
  const posted = page.waitForRequest(
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/kingdoms',
  );
  await scene.getByRole('button', { name: 'درّب الفرسان', exact: true }).click();
  expect((await posted).postDataJSON().command).toMatchObject({
    type: 'train',
    unit: 'rider',
    count: 1,
  });
  await expect(scene.getByLabel('قائمة تدريب القرية')).toContainText('خيّال');
  await expect(scene.getByRole('button', { name: 'درّب الفرسان', exact: true })).toBeDisabled();
  const state = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  expect(state.buildings).toMatchObject({ stable: 2, barracks: 1 });
  expect(state.training.unit).toBe('rider');
  await back(page);
  await enterBuilding(page, 'barracks');
  await expect(page.getByRole('region', { name: 'تجنيد الثكنة', exact: true })).toContainText(
    'يتدرب الآن',
  );
});

test('Living City artwork, real build lifecycle and world navigation', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const stage = await readyCity(page);
  expect(
    await stage.locator('picture img').evaluate((image: HTMLImageElement) => image.currentSrc),
  ).toContain('/city-hub/overview-');
  const scene = await enterBuilding(page, 'farm');
  const panel = scene.getByRole('region', { name: 'تفاصيل مزارع الغذاء', exact: true });
  await panel.getByRole('button', { name: 'طوّر المبنى', exact: true }).click();
  await expect(scene.locator('[data-city-feedback="notice"]')).toBeVisible();
  await back(page);
  await setVillageSettings(page, false);
  await setQueues(page);
  await expect(page.getByRole('region', { name: 'قوائم التنفيذ' })).toContainText('مزارع الغذاء');
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/kingdoms')).json()).data.villages[0].buildings.farm,
    )
    .toBe(2);
  await setQueues(page, false);
  await refreshWorld(page);
  const confirmed = await enterBuilding(page, 'farm');
  await expect(
    confirmed.getByRole('region', { name: 'تفاصيل مزارع الغذاء', exact: true }),
  ).toContainText('٢');
  await back(page);
  await setVillageSettings(page, false);
  const labels = page.getByRole('button', { name: 'إظهار أسماء المباني', exact: true });
  await expect(labels).toHaveAttribute('aria-pressed', 'false');
  await labels.click();
  await expect(labels).toHaveAttribute('aria-pressed', 'true');
  await labels.click();
  await expect(labels).toHaveAttribute('aria-pressed', 'false');
  if ((page.viewportSize()?.width ?? 1920) <= 1000)
    await page
      .getByRole('navigation', { name: 'تنقل المملكة', exact: true })
      .getByRole('link', { name: 'انتقل إلى العالم', exact: true })
      .click();
  else await page.getByRole('button', { name: 'انتقل إلى خريطة العالم', exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.replace(/\/$/, '') === '/games/kingdoms/world-map' &&
      url.searchParams.get('worldId') === 'browser-world' &&
      url.searchParams.get('villageId') === 'v1',
  );
  await page.goBack();
  await readyCity(page);
});

test('selected building artwork and return control remain reachable after viewport resize', async ({
  page,
}) => {
  await page.goto('/');
  const scene = await enterBuilding(page, 'hall');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    scene.getByRole('button', { name: 'العودة إلى المدينة', exact: true }),
  ).toBeInViewport();
  await expect(scene.locator('picture img')).toBeInViewport();
  await expect(page.locator('aside[aria-label="إدارة مباني القرية"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await back(page);
  await expectBoundedCamera(page);
});

test('reduced motion leaves every important scene command available', async ({ page }) => {
  await page.goto('/');
  await readyCity(page);
  await page.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  await expectOverview(page);
  const scene = await enterBuilding(page, 'hall');
  await expect(scene.getByRole('button', { name: 'طوّر المبنى', exact: true })).toBeVisible();
  await expect(
    scene.getByRole('button', { name: 'العودة إلى المدينة', exact: true }),
  ).toBeVisible();
  await back(page);
  await setVillageSettings(page);
  await page.getByLabel('جودة المشهد').selectOption('high');
  await expect(page.locator('[data-village-scene] canvas')).toBeVisible();
});

test('keyboard, drag and pinch preserve bounded city coordinates', async ({ page, isMobile }) => {
  await page.goto('/');
  const stage = await readyCity(page);
  await page.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click();
  await expectOverview(page);
  await stage.focus();
  await page.keyboard.press('+');
  await expect(stage).toHaveAttribute('data-zoom', '1.250');
  await page.keyboard.press('0');
  await expectOverview(page);
  await page.getByRole('button', { name: 'تكبير القرية', exact: true }).click();
  await expect(stage).toHaveAttribute('data-zoom', '1.250');
  const bounds = await stage.boundingBox();
  const x = bounds!.x + bounds!.width / 2,
    y = bounds!.y + bounds!.height / 2;
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
    .poll(async () => Number(await stage.getAttribute('data-zoom')))
    .toBeGreaterThan(1.25);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + bounds!.width / 3, y + bounds!.height / 3, { steps: 10 });
  await page.mouse.up();
  await expectBoundedCamera(page);
  await stage.focus();
  await page.keyboard.press('0');
  await expectOverview(page);
});

test('main wall, embassy and mine clicks remain separate from gate and auxiliary regions', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  await readyCity(page);
  for (const building of ['wall', 'embassy', 'mine']) {
    await setVillageSettings(page, false);
    await clickBuilding(page, building, isMobile);
    await expect(page.locator(`[data-city-scene="${building}"]`)).toBeVisible();
    await back(page);
    await expectOverview(page);
  }
});

test('war council opens the existing campaign flow', async ({ page }) => {
  await page.goto('/');
  const scene = await enterBuilding(page, 'rally');
  await expect(scene.getByRole('heading', { name: 'نقطة تجمع الجيوش', exact: true })).toBeVisible();
  await scene.getByRole('button', { name: 'إرسال جيش', exact: true }).click();
  await expect(page.getByLabel('نوع الحملة')).toHaveValue('attack');
});

test('responsive quality and incoming threat indicators preserve Living City presentation', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const stage = await readyCity(page);
  const source = await stage.locator('picture img').getAttribute('src');
  await setVillageSettings(page);
  for (const quality of ['low', 'high', 'ultra']) {
    await page.getByLabel('جودة المشهد').selectOption(quality);
    await expect(page.getByLabel('جودة المشهد')).toHaveValue(quality);
    await expect(stage.locator('picture img')).toHaveAttribute('src', source!);
    expect(
      await stage
        .locator('picture img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    ).toBe(true);
  }
  await setVillageSettings(page, false);
  expect((await request.post('/__village_test/incoming-attack')).ok()).toBe(true);
  await refreshWorld(page);
  await expect(page.getByRole('alert', { name: 'هجوم قادم' })).toBeVisible();
  await expect(page.getByLabel('مؤشر تهديد عسكري عند البوابة')).toBeVisible();
  await expect(stage).toHaveAttribute('data-threat-severity', /WARNING|DANGER|CRITICAL/);
});

test('readable resources and production buildings retain confirmed tiers in Living City', async ({
  page,
  request,
}) => {
  expect((await request.post('/__village_test/resource-scenario')).ok()).toBe(true);
  await page.goto('/');
  const stage = await readyCity(page);
  const resources = page.getByRole('region', { name: 'موارد القرية', exact: true });
  await expect(resources.locator('[data-resource]')).toHaveCount(5);
  for (const resource of ['wood', 'stone', 'iron', 'food', 'gold']) {
    const icon = resources.locator(`[data-resource="${resource}"] img`);
    await icon.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
  }
  const source = await stage.locator('picture img').getAttribute('src');
  expect(source).toContain('/city-hub/overview-');
  const state = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  for (const building of ['lumber', 'quarry', 'mine', 'farm', 'treasury']) {
    expect(state.buildings[building]).toBe(3);
    const scene = await enterBuilding(page, building);
    await expect(scene.getByRole('region', { name: 'موارد المشهد', exact: true })).toBeVisible();
    await expect(scene.locator('[aria-label^="تفاصيل"]')).toContainText('٣');
    await back(page);
    await expect(stage.locator('picture img')).toHaveAttribute('src', source!);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

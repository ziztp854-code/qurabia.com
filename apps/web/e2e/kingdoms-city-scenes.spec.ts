import { expect, test as base, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const test = base.extend<{ diagnostics: void }>({
  diagnostics: [async ({ page }, use, testInfo) => {
    const consoleLog: string[] = [], networkLog: string[] = [];
    page.on('console', (message) => consoleLog.push(`${message.type()}: ${message.text()}`));
    page.on('pageerror', (error) => consoleLog.push(`pageerror: ${error.message}`));
    page.on('response', (response) => networkLog.push(`${response.status()} ${response.request().method()} ${response.url()}`));
    page.on('requestfailed', (request) => networkLog.push(`failed ${request.method()} ${request.url()} ${request.failure()?.errorText}`));
    await use();
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('console', { body: consoleLog.join('\n'), contentType: 'text/plain' });
      await testInfo.attach('network', { body: networkLog.join('\n'), contentType: 'text/plain' });
    }
  }, { auto: true }],
});

const scenes = ['palace', 'barracks', 'market', 'stable', 'war-council', 'siege-workshop', 'farm', 'mine'] as const;
type Scene = typeof scenes[number];
const viewports = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440], [3840, 2160], [320, 568], [360, 800], [375, 812], [390, 844], [393, 852], [412, 915], [414, 896], [430, 932], [768, 1024], [844, 390], [834, 1194], [1024, 768]] as const;

async function readyHub(page: Page, requireActors = true) {
  const stage = page.locator('[data-village-scene]');
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  await expect(stage).toHaveAttribute('aria-busy', 'false');
  await stage.locator('picture img').evaluate((image: HTMLImageElement) => image.decode());
  if (requireActors) await expect.poll(async () => Number(await stage.locator('canvas').getAttribute('data-city-actors'))).toBeGreaterThan(0);
  return stage;
}

const hitNames: Record<Scene, RegExp> = {
  palace: /^دار الحكم،/, barracks: /^الثكنة،/, market: /^السوق،/, stable: /^الإسطبل،/,
  'war-council': /^(مجلس الحرب|نقطة تجمع الجيوش)(?:،|$)/, 'siege-workshop': /^ورشة الحصار$/, farm: /^مزارع الغذاء،/, mine: /^منجم الحديد،/,
};

async function enterPhysical(page: Page, scene: Scene, touch = false) {
  const stage = await readyHub(page);
  const button = stage.getByRole('button', { name: hitNames[scene] });
  const area = await button.boundingBox();
  expect(area).not.toBeNull();
  const point = { x: area!.x + area!.width / 2, y: area!.y + area!.height / 2 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point)).toBe('CANVAS');
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  const active = page.locator(`[data-city-scene="${scene}"]`);
  await expect(active).toHaveAttribute('data-phase', 'active');
  await expect(stage).toHaveAttribute('data-camera-state', 'BUILDING_SCENE');
  await active.locator('picture img').evaluate((image: HTMLImageElement) => image.decode());
  await expect.poll(() => active.locator('picture img').evaluate((image) => getComputedStyle(image).opacity)).toBe('1');
  return active;
}

const pixelFrame = async (page: Page) => {
  // Capture the full canvas bounds without repeated locator stability/scroll work.
  const clip = await page.evaluate(() => {
    const canvas = document.querySelector('[data-village-scene] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Village canvas is unavailable');
    const rect = canvas.getBoundingClientRect();
    // Enclose every canvas pixel on an integer grid; fractional clips resample static colours.
    const x = Math.floor(rect.x), y = Math.floor(rect.y);
    return { x, y, width: Math.ceil(rect.right) - x, height: Math.ceil(rect.bottom) - y };
  });
  return page.screenshot({ clip });
};
const frameHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const pixelHash = async (page: Page) => frameHash(await pixelFrame(page));
async function frameBarrier(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    let frames = 0;
    const next = () => { if (++frames === 16) resolve(); else requestAnimationFrame(next); };
    requestAnimationFrame(next);
  }));
}

async function enter(page: Page, scene: Scene) {
  await readyHub(page);
  const city = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  const settings = city.locator('summary').filter({ hasText: /^إعدادات القرية$/ });
  if (!await settings.evaluate((element) => (element.parentElement as HTMLDetailsElement).open)) await settings.click();
  if (scene === 'siege-workshop') {
    await settings.locator('..').getByRole('button', { name: 'ورشة الحصار', exact: true }).click();
  } else await city.getByLabel('اختر مبنى من الخريطة').selectOption(scene === 'palace' ? 'hall' : scene === 'war-council' ? 'rally' : scene);
  // Do not carry the overview settings hover onto a newly mounted facility control.
  await page.mouse.move(0, 0);
  const active = page.locator(`[data-city-scene="${scene}"]`);
  await expect(active).toHaveAttribute('data-phase', 'active');
  await expect.poll(() => active.locator('picture img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0 && image.getBoundingClientRect().width > 0 && getComputedStyle(image).opacity === '1')).toBe(true);
  await active.locator('picture img').evaluate((image: HTMLImageElement) => image.decode());
  await page.waitForLoadState('networkidle');
  return active;
}

async function back(page: Page) {
  await page.getByRole('button', { name: 'العودة إلى المدينة', exact: true }).click();
  await expect(page.locator('[data-city-scene]')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'خريطة القرية', exact: true })).toBeVisible();
}

test.beforeEach(async ({ request }) => { expect((await request.post('/__village_test/city-scenario')).ok()).toBe(true); });

test('all eight independent scenes return to the retained city camera', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/city-scenes/')) requested.push(request.url()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await readyHub(page);
  const city = page.getByRole('region', { name: 'خريطة القرية', exact: true });
  await city.getByRole('button', { name: 'القرية', exact: true }).press('Enter');
  const camera = city.locator('[data-village-scene]');
  await expect(camera).toHaveAttribute('data-zoom', '1.800');
  const before = await camera.evaluate((element: HTMLElement) => ({ x: element.dataset.cameraX, y: element.dataset.cameraY, zoom: element.dataset.zoom }));
  expect(requested).toHaveLength(0);
  const sources: string[] = [];
  for (const scene of scenes) {
    const active = await enter(page, scene);
    await expect(active).toHaveAttribute('dir', 'rtl');
    sources.push(await active.locator('picture img').evaluate((image: HTMLImageElement) => image.currentSrc));
    await expect(city).toHaveCount(0); // The mounted overview is inert/aria-hidden while the scene owns the screen.
    await back(page);
    await expect.poll(() => camera.evaluate((element: HTMLElement) => ({ x: element.dataset.cameraX, y: element.dataset.cameraY, zoom: element.dataset.zoom }))).toEqual(before);
  }
  expect(new Set(sources).size).toBe(8);
  expect(sources.every((src) => src.includes('/city-scenes/') && !src.includes('city-master'))).toBe(true);
});

test('garden select save reload persists for A and stays private from B', async ({ page, request }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await readyHub(page); await page.mouse.move(0, 0); const cityBeforeGarden = await pixelHash(page);
  const active = await enter(page, 'palace');
  const garden = active.getByRole('region', { name: 'حديقة السلطان' });
  await garden.getByRole('button', { name: 'تخصيص الحديقة' }).click();
  await garden.getByLabel('اختيار مساحة الحديقة').selectOption('0');
  await garden.getByRole('button', { name: 'ورد أحمر', exact: true }).click();
  await expect(garden.getByRole('img', { name: 'ورد أحمر في مساحة 1', exact: true })).toBeVisible();
  await garden.getByRole('button', { name: 'حفظ الحديقة', exact: true }).click();
  await expect(garden.getByRole('status')).toHaveText('حُفظت حديقتك.');
  await back(page);
  const preferences = page.locator('summary').filter({ hasText: /^إعدادات القرية$/ });
  if (await preferences.evaluate((element) => (element.parentElement as HTMLDetailsElement).open)) await preferences.click();
  await page.mouse.move(0, 0); await frameBarrier(page);
  await expect.poll(() => pixelHash(page)).not.toBe(cityBeforeGarden);
  await page.screenshot({ path: testInfo.outputPath('city-owned-garden-preview.png') });
  await page.reload(); await enter(page, 'palace');
  await expect(page.getByRole('img', { name: 'ورد أحمر في مساحة 1', exact: true })).toBeVisible();
  const a = (await (await request.get('/api/kingdoms')).json()).data;
  const villageId = a.villages[0].id;
  expect((await request.post('/__village_test/player?id=browser-player-b')).ok()).toBe(true);
  await page.reload(); await enter(page, 'palace');
  await expect(page.getByRole('region', { name: 'حديقة السلطان' }).getByRole('button', { name: 'تخصيص الحديقة' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'ورد أحمر في مساحة 1', exact: true })).toHaveCount(0);
  expect((await request.get(`/api/kingdoms/palace-garden?worldId=browser-world&villageId=${villageId}`)).status()).toBe(403);
  await request.post('/__village_test/player?id=browser-player'); await page.reload(); await enter(page, 'palace');
  await expect(page.getByRole('img', { name: 'ورد أحمر في مساحة 1', exact: true })).toBeVisible();
});

test('keyboard focus stays in scene and Escape restores the overview with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click();
  await page.getByLabel('اختر مبنى من الخريطة').focus();
  await enter(page, 'palace');
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-city-scene]')))).toBe(true);
  }
  expect(await page.locator('[data-city-scene]').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-city-scene]')).toHaveCount(0);
  await expect(page.getByLabel('اختر مبنى من الخريطة')).toBeFocused();
});

test('failed independent art provides retry and recovers without replacing the city', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await page.route('**/city-scenes/barracks*.webp', (route) => route.abort());
  const settings = page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }); await settings.click();
  await page.getByLabel('اختر مبنى من الخريطة').selectOption('barracks');
  const scene = page.locator('[data-city-scene="barracks"]');
  await expect(scene.getByRole('alert')).toContainText('تعذر تحميل المشهد.');
  await page.unroute('**/city-scenes/barracks*.webp');
  await scene.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(scene).toHaveAttribute('data-phase', 'active'); await expect(scene.getByRole('alert')).toHaveCount(0); await back(page);
});

test('real engine construction training trading and march remain integrated in their scenes', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  const palace = await enter(page, 'palace');
  await palace.getByRole('button', { name: 'طوّر المبنى', exact: true }).click();
  await expect(palace.locator('[data-city-feedback="notice"]')).toBeVisible();
  const built = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  expect(built.build?.building).toBe('hall'); await back(page);
  const barracks = await enter(page, 'barracks'); await barracks.getByRole('button', { name: 'درّب حارس', exact: true }).click();
  await expect(barracks.getByRole('status').filter({ hasText: 'يتدرب الآن' })).toBeVisible();
  expect((await (await request.get('/api/kingdoms')).json()).data.villages[0].training.unit).toBe('guard'); await back(page);
  const market = await enter(page, 'market');
  await market.locator('input[name="givewood"]').fill('10'); await market.locator('input[name="wantstone"]').fill('5');
  await market.getByRole('button', { name: 'انشر العرض', exact: true }).click(); await expect(market.getByRole('button', { name: 'ألغِ العرض', exact: true })).toBeVisible();
  expect((await (await request.get('/api/kingdoms')).json()).data.offers).toHaveLength(1); await back(page);
  const council = await enter(page, 'war-council');
  await council.getByRole('button', { name: 'إرسال جيش', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'إرسال حملة', exact: true }).last()).toBeVisible();
  const state = (await (await request.get('/api/kingdoms')).json()).data;
  const enemy = state.map.find((village: { ownerId: string }) => village.ownerId === 'browser-player-b');
  await page.locator('summary').filter({ hasText: 'اختر وجهة بإحداثيات اللعبة' }).click();
  await page.getByLabel('الوجهة X', { exact: true }).fill(String(enemy.x));
  await page.getByLabel('الوجهة Y', { exact: true }).fill(String(enemy.y));
  await page.getByRole('button', { name: 'اختر الإحداثيات', exact: true }).click();
  await page.getByLabel(/^حارس \(/).fill('2');
  await page.getByRole('button', { name: 'أرسل الحملة', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/api/kingdoms')).json()).data.movements.length).toBe(1);
});

test('workshop builds crafts settles and repairs genuine owned equipment', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  const scene = await enter(page, 'siege-workshop');
  const panel = scene.getByRole('region', { name: 'إدارة ورشة الحصار' });
  await panel.getByRole('button', { name: 'ابنِ ورشة الحصار', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'طوّر ورشة الحصار', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'صنّع منجنيق', exact: true }).click();
  await expect(panel.getByRole('region', { name: 'طابور تصنيع المعدات' })).toContainText('تصنيع ١ منجنيق');
  await request.post('/__village_test/advance-workshop'); await page.reload(); await enter(page, 'siege-workshop');
  await expect(page.getByRole('heading', { name: 'منجنيق · مخزون ١', exact: true })).toBeVisible();
  await request.post('/__village_test/damaged-workshop'); await page.reload(); await enter(page, 'siege-workshop');
  await page.getByRole('button', { name: 'أصلح منجنيق', exact: true }).click();
  await expect(page.getByRole('region', { name: 'طابور تصنيع المعدات' })).toContainText('إصلاح ١ منجنيق');
  await request.post('/__village_test/advance-workshop'); await page.reload(); await enter(page, 'siege-workshop');
  await expect(page.getByRole('heading', { name: 'منجنيق · مخزون ٢', exact: true })).toBeVisible();
});

test('living Pixi actors animate and freeze for pause and reduced motion; NPC visibility is independent', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('/');
  const stage = await readyHub(page); await page.mouse.move(0, 0);
  expect(Number(await stage.locator('canvas').getAttribute('data-city-actors'))).toBe(5);
  const liveFrame = await pixelFrame(page), live = frameHash(liveFrame);
  await writeFile(testInfo.outputPath('city-life-frame-a.png'), liveFrame);
  let changedFrame: Buffer | undefined;
  await expect.poll(async () => {
    changedFrame = await pixelFrame(page);
    return frameHash(changedFrame);
  }).not.toBe(live);
  expect(changedFrame).toBeDefined();
  await writeFile(testInfo.outputPath('city-life-frame-b.png'), changedFrame!);
  await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click();
  await page.getByRole('button', { name: 'إيقاف الحركة', exact: true }).click();
  await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click(); await page.mouse.move(0, 0);
  await frameBarrier(page); const paused = await pixelHash(page); await frameBarrier(page);
  expect(await pixelHash(page)).toBe(paused);
  await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click();
  await page.locator('summary').filter({ hasText: 'معايرة مشهد القرية — وضع التطوير' }).click();
  await page.getByRole('checkbox', { name: 'السكان المتحركون', exact: true }).uncheck();
  await page.locator('summary').filter({ hasText: 'معايرة مشهد القرية — وضع التطوير' }).click();
  await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click(); await page.mouse.move(0, 0);
  expect(await pixelHash(page)).not.toBe(paused);
  await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click();
  await page.getByRole('button', { name: 'تشغيل الحركة', exact: true }).click();
  await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.mouse.move(0, 0);
  await frameBarrier(page); const reduced = await pixelHash(page); await frameBarrier(page);
  expect(await pixelHash(page)).toBe(reduced);
});

test('camera covers four states, clamps pan and zoom, and retains context across world profile changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('/'); const stage = await readyHub(page);
  await page.waitForLoadState('networkidle'); await page.evaluate(() => document.fonts.ready);
  await expect(stage).toHaveAttribute('data-camera-state', 'CITY_OVERVIEW');
  await page.getByRole('region', { name: 'خريطة القرية', exact: true }).getByRole('button', { name: 'القرية', exact: true }).click();
  await expect(stage).toHaveAttribute('data-zoom', '1.800'); await expect(stage).toHaveAttribute('data-camera-state', 'CITY_EXPLORE');
  await page.mouse.move(900, 450); await page.mouse.wheel(0, -10000); await page.mouse.wheel(0, -10000); await page.mouse.wheel(0, -10000);
  await expect(stage).toHaveAttribute('data-zoom', '3.500');
  await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(1800, 1000, { steps: 12 }); await page.mouse.up();
  const clamp = await stage.evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect(), width = Number(element.dataset.worldWidth), height = Number(element.dataset.worldHeight), zoom = Number(element.dataset.zoom);
    const scale = Math.min(rect.width / width, rect.height / height) * zoom;
    const x = Number(element.dataset.cameraX), y = Number(element.dataset.cameraY);
    return x >= rect.width / scale / 2 - .02 && x <= width - rect.width / scale / 2 + .02 && y >= rect.height / scale / 2 - .02 && y <= height - rect.height / scale / 2 + .02;
  }); expect(clamp).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 768, height: 1024 });
  await expect(stage).toHaveAttribute('data-city-composition', 'portrait'); await expect(stage).toHaveAttribute('data-world-width', '900');
  await page.getByRole('button', { name: 'عرض القرية بالكامل', exact: true }).click(); await expect(stage).toHaveAttribute('data-camera-state', 'CITY_OVERVIEW');
  await page.setViewportSize({ width: 1920, height: 1080 }); await expect(stage).toHaveAttribute('data-city-composition', 'desktop');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const target = stage.getByRole('button', { name: /^الثكنة،/ }); const bounds = await target.boundingBox();
  // Observe the 180ms focus state while input is dispatched, before click settles.
  await Promise.all([
    expect(stage).toHaveAttribute('data-camera-state', 'BUILDING_FOCUS'),
    page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2),
  ]);
  await expect(page.locator('[data-city-scene="barracks"]')).toBeVisible();
  await expect(stage).toHaveAttribute('data-camera-state', 'BUILDING_SCENE'); await back(page);
  await expect(stage).toHaveAttribute('data-camera-state', 'CITY_OVERVIEW');
});

test('returning drag and pinch never activate Pixi buildings', async ({ page, browser }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/'); const stage = await readyHub(page);
  const bounds = await stage.getByRole('button', { name: /^دار الحكم،/ }).boundingBox();
  const x = bounds!.x + bounds!.width / 2, y = bounds!.y + bounds!.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 80, y + 25, { steps: 6 }); await page.mouse.move(x, y, { steps: 6 }); await page.mouse.up();
  await frameBarrier(page); await expect(page.locator('[data-city-scene]')).toHaveCount(0);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  try {
    const phone = await context.newPage(); await phone.goto('/'); const phoneStage = await readyHub(phone);
    const target = await phoneStage.getByRole('button', { name: /^السوق،/ }).boundingBox();
    const cx = target!.x + target!.width / 2, cy = target!.y + target!.height / 2;
    const cdp = await context.newCDPSession(phone);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 8, y: cy, id: 1 }, { x: cx + 8, y: cy, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 35, y: cy, id: 1 }, { x: cx + 35, y: cy, id: 2 }] });
    expect(Number(await phoneStage.getAttribute('data-zoom'))).toBeGreaterThan(1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 8, y: cy, id: 1 }, { x: cx + 8, y: cy, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frameBarrier(phone); await expect(phone.locator('[data-city-scene]')).toHaveCount(0);
    expect(Number(await phoneStage.getAttribute('data-zoom'))).toBeGreaterThanOrEqual(1);
  } finally { await context.close(); }
});

test('low quality avoids unused environment assets and upgrades them on demand', async ({ page }) => {
  const sources: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/city-hub/')) sources.push(request.url()); });
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }));
  await page.goto('/'); await readyHub(page); await page.waitForLoadState('networkidle');
  expect(sources.some((src) => /palm-cluster|banner-flutter/.test(src))).toBe(false);
  await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click(); await page.getByLabel('جودة المشهد').selectOption('high');
  await expect.poll(() => sources.some((src) => src.includes('palm-cluster-a')) && sources.some((src) => src.includes('banner-flutter'))).toBe(true);
});

test('WebGL loss uses installed Pixi canvas fallback and keeps accessible building navigation', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return /webgl/.test(type) ? null : Reflect.apply(original, this, [type, ...args]);
    } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  const stage = await readyHub(page);
  expect(await stage.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.getContext('webgl2'))).toBeNull();
  expect(await stage.locator('canvas').evaluate((canvas: HTMLCanvasElement) => Boolean(canvas.getContext('2d')))).toBe(true);
  await stage.getByRole('button', { name: /^دار الحكم،/ }).press('Enter'); await expect(page.locator('[data-city-scene="palace"]')).toBeVisible(); await back(page);
  await enterPhysical(page, 'market');
});

test('complete canvas backend failure preserves native image and HTML keyboard and pointer fallback', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null }));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  const stage = page.locator('[data-village-scene]');
  await expect(stage).toHaveAttribute('aria-busy', 'false'); await expect(stage.locator('canvas')).toBeHidden();
  await expect(stage).toHaveAttribute('data-pixi-ready', 'false');
  await stage.getByRole('button', { name: /^دار الحكم،/ }).press('Enter'); await expect(page.locator('[data-city-scene="palace"]')).toBeVisible(); await back(page);
  await stage.getByRole('button', { name: /^السوق،/ }).click(); await expect(page.locator('[data-city-scene="market"]')).toBeVisible();
});

test('missing optional actor atlas never blocks genuine Pixi interactions', async ({ page }) => {
  await page.route('**/guard-walk-atlas.webp', (route) => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/'); await readyHub(page, false); await page.waitForLoadState('networkidle');
  await enterPhysical(page, 'market'); await back(page);
});

test('shared blacksmith and granary landmarks open real facilities and civic landmarks are labelled decoration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/'); const stage = await readyHub(page);
  for (const [name, destination] of [['دار الحدادة', 'siege-workshop'], ['مخزن الغلال', 'warehouse']]) {
    const area = await stage.getByRole('button', { name, exact: true }).boundingBox();
    const point = { x: area!.x + area!.width / 2, y: area!.y + area!.height / 2 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point)).toBe('CANVAS');
    await page.mouse.click(point.x, point.y); await expect(page.locator(`[data-city-scene="${destination}"]`)).toBeVisible(); await back(page);
  }
  for (const name of ['دار المعرفة · معلم حضاري', 'جامع المدينة · معلم حضاري', 'الحي السكني · معلم حضاري']) {
    await expect(stage.getByRole('img', { name, exact: true })).toHaveCount(1);
    await expect(stage.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
});

test('unfinished onboarding keeps the initial city overview and tours remain explicit without resetting progress', async ({ page, request }) => {
  expect((await request.post('/__village_test/onboarding-newbie')).ok()).toBe(true);
  const before = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/'); const stage = await readyHub(page);
  await page.waitForLoadState('networkidle'); await frameBarrier(page);
  await expect(stage).toHaveAttribute('data-camera-state', 'CITY_OVERVIEW'); await expect(stage).toHaveAttribute('data-zoom', '1.000');
  await expect(page.getByRole('region', { name: 'جولة القرية', exact: true })).toHaveCount(0);
  expect((await (await request.get('/api/kingdoms/village-onboarding')).json()).data.completed).toBe(false);
  await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click(); await page.getByRole('button', { name: 'جولة في المدينة', exact: true }).click();
  await expect(page.getByRole('region', { name: 'جولة القرية', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'إنهاء الجولة', exact: true }).click();
  await expect(page.getByRole('region', { name: 'جولة القرية', exact: true })).toHaveCount(0); await expect(stage).toHaveAttribute('data-camera-state', 'CITY_OVERVIEW');
  expect((await (await request.get('/api/kingdoms/village-onboarding')).json()).data.completed).toBe(true);
  const after = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
  expect(after.buildings).toEqual(before.buildings); expect(after.resources).toEqual(before.resources); expect(after.progression).toEqual(before.progression);
  await page.getByRole('button', { name: 'جولة في المدينة', exact: true }).click();
  await expect(page.getByRole('region', { name: 'جولة القرية', exact: true })).toBeVisible();
  expect((await (await request.get('/api/kingdoms/village-onboarding')).json()).data.completed).toBe(true);
});

test('production stable owns its level upgrade and cavalry training requirement', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/'); const scene = await enter(page, 'stable');
  await expect(scene.getByText('مستوى الإسطبل ٢', { exact: true })).toBeVisible();
  await scene.getByRole('button', { name: 'طوّر الإسطبل', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/api/kingdoms')).json()).data.villages[0].build?.building).toBe('stable');
  await scene.getByRole('button', { name: 'درّب الفرسان', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/api/kingdoms')).json()).data.villages[0].training?.unit).toBe('rider');
});

for (const touch of [false, true]) test(`stable mounted archers retain functional controls on ${touch ? 'touch' : 'desktop'}`, async ({ browser, request }, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: touch ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
    isMobile: touch,
    hasTouch: touch,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    const scene = await enterPhysical(page, 'stable', touch);
    if (touch) await scene.getByRole('button', { name: 'إدارة المرفق', exact: true }).tap();
    const selector = scene.getByRole('combobox', { name: 'وحدة الإسطبل', exact: true });
    await selector.scrollIntoViewIfNeeded();
    await expect(selector).toBeVisible();
    expect(await selector.locator('option').evaluateAll((options: HTMLOptionElement[]) => options.map((option) => option.value))).toEqual(['rider', 'mounted_archer']);
    await selector.selectOption('mounted_archer');
    const state = (await (await request.get('/api/kingdoms')).json()).data;
    const unit = state.config.units.mounted_archer;
    const quantity = scene.getByRole('spinbutton', { name: `عدد ${unit.name}`, exact: true });
    await quantity.fill('2');
    const costs = scene.getByRole('list', { name: `تكلفة تدريب ${unit.name}`, exact: true });
    for (const [resource, cost] of Object.entries(unit.cost) as [string, number][]) {
      if (cost <= 0) continue;
      const resourceLabels: Record<string, string> = { wood: 'خشب', stone: 'حجر', iron: 'حديد', food: 'غذاء', gold: 'ذهب' };
      await expect(costs.getByRole('listitem').filter({ hasText: resourceLabels[resource] }).locator('bdi')).toHaveText(Math.ceil(cost * 2).toLocaleString('ar-SA'));
    }
    const train = scene.getByRole('button', { name: `درّب ${unit.name}`, exact: true });
    await expect(train).toBeEnabled();
    if (touch) {
      for (const control of [selector, quantity, train]) {
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await train.tap();
    } else await train.click();
    await expect.poll(async () => {
      const village = (await (await request.get('/api/kingdoms')).json()).data.villages[0];
      return { unit: village.training?.unit, count: village.training?.count };
    }).toEqual({ unit: 'mounted_archer', count: 2 });
    await expect(scene.getByLabel('قائمة تدريب القرية', { exact: true })).toContainText(unit.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await back(page);
    await enter(page, 'stable');
    await expect(page.getByLabel('قائمة تدريب القرية', { exact: true })).toContainText(unit.name);
    await back(page);
  } finally {
    await context.close();
  }
});

test('production war council recruits and assigns a real commander then opens the campaign callback', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/'); const scene = await enter(page, 'war-council');
  await scene.getByLabel('اسم القائد', { exact: true }).fill('أمير الاختبار');
  await scene.getByRole('button', { name: 'وظّف القائد', exact: true }).click();
  await expect(scene.getByRole('heading', { name: 'أمير الاختبار', exact: true })).toBeVisible();
  await scene.getByRole('button', { name: 'عيّن للدفاع هنا', exact: true }).click();
  await expect(scene.getByRole('button', { name: 'أخلِ التعيين', exact: true })).toBeVisible();
  expect((await (await request.get('/api/kingdoms')).json()).data.villages[0].commanderId).toBeTruthy();
  await scene.getByRole('button', { name: 'أخلِ التعيين', exact: true }).click();
  await expect(scene.getByRole('button', { name: 'عيّن للدفاع هنا', exact: true })).toBeVisible();
  await scene.getByRole('button', { name: 'إرسال جيش', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'إرسال حملة', exact: true }).last()).toBeVisible();
  await expect(page.getByLabel('قائد الحملة', { exact: true })).toContainText('أمير الاختبار');
});

for (const [width, height] of viewports) test(`@visual matrix ${width}x${height}`, async ({ browser }, testInfo: TestInfo) => {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width, height }, isMobile: width < 900, hasTouch: width < 900, reducedMotion: 'reduce', recordVideo: { dir: testInfo.outputPath('videos') } });
  const page = await context.newPage(); const errors: string[] = [], consoleLog: string[] = [], networkLog: string[] = [];
  let failed = false;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => consoleLog.push(`${message.type()}: ${message.text()}`));
  page.on('response', (response) => networkLog.push(`${response.status()} ${response.request().method()} ${response.url()}`));
  page.on('requestfailed', (request) => networkLog.push(`failed ${request.url()} ${request.failure()?.errorText}`));
  try {
    await page.goto('/'); const stage = await readyHub(page); await page.waitForLoadState('networkidle');
    const cityImage = await stage.locator('picture img').evaluate((image: HTMLImageElement) => ({ src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight }));
    const composition = width < height ? 'portrait' : 'desktop';
    await expect(stage).toHaveAttribute('data-city-composition', composition);
    await expect(stage).toHaveAttribute('data-camera-state', 'CITY_OVERVIEW');
    await expect(stage).toHaveAttribute('data-world-width', composition === 'portrait' ? '900' : '1600');
    await expect(stage).toHaveAttribute('data-world-height', composition === 'portrait' ? '1600' : '900');
    expect(cityImage.src).toContain(`/city-hub/overview-${composition}`);
    expect(Number(await stage.locator('canvas').getAttribute('data-city-interactions'))).toBeGreaterThanOrEqual(18);
    if (width <= 1000) {
      const nav = page.getByRole('navigation', { name: 'تنقل المملكة', exact: true });
      const navBox = await nav.boundingBox(), stageBox = await stage.boundingBox();
      expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(navBox!.y);
      for (const name of ['تكبير القرية', 'تصغير القرية', 'عرض القرية بالكامل', 'إظهار أسماء المباني']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.y + box!.height).toBeLessThanOrEqual(navBox!.y);
      }
    }
    await page.screenshot({ path: testInfo.outputPath('city.png') });
    const overview = await stage.evaluate((element: HTMLElement) => ({ x: element.dataset.cameraX, y: element.dataset.cameraY, zoom: element.dataset.zoom, state: element.dataset.cameraState }));
    for (const key of width === 1920 || width === 390 ? scenes : ['palace', 'barracks'] as const) {
      const active = width === 1920 || width === 390 ? await enterPhysical(page, key, width === 390) : await enter(page, key);
      const backButton = active.getByRole('button', { name: 'العودة إلى المدينة', exact: true });
      const box = await backButton.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const image = await active.locator('picture img').evaluate((element: HTMLImageElement) => ({ w: element.naturalWidth, h: element.naturalHeight, rect: element.getBoundingClientRect().toJSON() }));
      expect(image.rect.width / image.rect.height).toBeCloseTo(image.w / image.h, 2);
      if (width <= 700) {
        const headerBox = await backButton.evaluate((button) => button.closest('header')!.getBoundingClientRect().toJSON());
        expect(image.rect.top).toBeGreaterThanOrEqual(headerBox.bottom);
      }
      await page.screenshot({ path: testInfo.outputPath(`${key}.png`) });
      if (key === 'palace') {
        const garden = active.getByRole('region', { name: 'حديقة السلطان' }); await garden.getByRole('button', { name: 'تخصيص الحديقة' }).click();
        await garden.getByLabel('اختيار مساحة الحديقة').selectOption('0'); await garden.getByRole('button', { name: 'ورد أحمر', exact: true }).click();
        await garden.getByRole('button', { name: 'حفظ الحديقة', exact: true }).scrollIntoViewIfNeeded();
        await expect(garden.getByRole('button', { name: 'حفظ الحديقة', exact: true })).toBeInViewport();
        await expect(backButton).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath('garden-edit.png') });
      } else if (width <= 700) {
        await active.getByRole('button', { name: 'إدارة المرفق', exact: true }).click();
        await expect(active.getByRole('region', { name: 'موارد المشهد' })).toBeInViewport();
        await expect(backButton).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath(`${key}-management.png`) });
      }
      await back(page);
      await expect.poll(() => stage.evaluate((element: HTMLElement) => ({ x: element.dataset.cameraX, y: element.dataset.cameraY, zoom: element.dataset.zoom, state: element.dataset.cameraState }))).toEqual(overview);
    }
    expect(errors).toEqual([]);
  } catch (error) {
    failed = true;
    await testInfo.attach('matrix-failure', { body: await page.screenshot(), contentType: 'image/png' });
    throw error;
  } finally {
    await testInfo.attach('browser-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
    if (failed) {
      await testInfo.attach('matrix-console', { body: consoleLog.join('\n'), contentType: 'text/plain' });
      await testInfo.attach('matrix-network', { body: networkLog.join('\n'), contentType: 'text/plain' });
    }
    const video = page.video(); await context.close();
    if (video) { if (failed) await testInfo.attach('matrix-video', { path: await video.path(), contentType: 'video/webm' }); else await video.delete(); }
  }
});

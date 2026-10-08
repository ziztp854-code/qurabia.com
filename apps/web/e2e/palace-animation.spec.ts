import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';

async function enter(page: Page) {
  const hit = await page.getByRole('button', { name: /^دار الحكم، المستوى/ }).boundingBox();
  expect(hit).not.toBeNull();
  await page.mouse.click(hit!.x + hit!.width / 2, hit!.y + hit!.height / 2);
  const scene = page.locator('[data-city-scene="palace"]');
  await expect(scene).toHaveAttribute('data-phase', 'active');
  await expect(scene.locator('[data-sultan-palace]')).toHaveAttribute('data-pixi-garden', 'true');
  await expect(scene.getByRole('button', { name: 'تخصيص الحديقة', exact: true })).toBeVisible();
  return scene;
}
async function frames(page: Page) { return Number(await page.locator('[data-sultan-palace] canvas').getAttribute('data-palace-frames') ?? 0); }
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function pixelFrame(page: Page) {
  const clip = await page.locator('[data-sultan-palace] canvas').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect(), x = Math.floor(rect.x), y = Math.floor(rect.y);
    // Keep the complete canvas on an integer grid instead of resampling a fractional clip.
    return { x, y, width: Math.ceil(rect.right) - x, height: Math.ceil(rect.bottom) - y };
  });
  return page.screenshot({ clip });
}
const resourceWarnings = new WeakMap<Page, { text: string; stack: unknown }[]>();
test.beforeEach(async ({ page, request }) => {
  const warnings: { text: string; stack: unknown }[] = [];
  resourceWarnings.set(page, warnings);
  const diagnostics = await page.context().newCDPSession(page);
  await diagnostics.send('Runtime.enable');
  diagnostics.on('Runtime.consoleAPICalled', event => {
    const text = event.args.map(argument => String(argument.value ?? '')).join(' ');
    if (text.includes('[BindGroup]')) warnings.push({ text, stack: event.stackTrace });
  });
  await request.post('/__village_test/city-scenario');
  await page.goto('/');
  await expect(page.locator('[data-village-scene]')).toHaveAttribute('data-pixi-ready', 'true');
});
test.afterEach(async ({ page }, info) => {
  const warnings = resourceWarnings.get(page) ?? [];
  await info.attach('pixi-resource-warnings', { contentType: 'application/json', body: JSON.stringify(warnings, null, 2) });
  expect(warnings).toEqual([]);
});
test('independent palace camera, grounded garden colours, save and return', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const scene = await enter(page);
  await scene.getByLabel('وجهة كاميرا القصر').selectOption('GARDEN');
  const first = await scene.locator('[data-sultan-palace]').evaluate(element => element.getAttribute('style'));
  await scene.getByRole('button', { name: 'تخصيص الحديقة', exact: true }).click();
  await scene.getByLabel('اختيار مساحة الحديقة').selectOption('0');
  await scene.getByRole('button', { name: 'ورد أحمر', exact: true }).click();
  await scene.getByRole('button', { name: 'أزرق', exact: true }).click();
  await expect(scene.getByRole('button', { name: 'أزرق', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await scene.getByRole('button', { name: 'حفظ الحديقة', exact: true }).click();
  await expect(scene.getByText('حُفظت حديقتك.')).toBeVisible();
  const saved = await page.request.get('/api/kingdoms/palace-garden?worldId=browser-world&villageId=v1');
  expect((await saved.json()).data.slots).toContainEqual({ slotId: 0, itemId: 'red-roses', color: 'blue' });
  await scene.getByRole('button', { name: 'تكبير القصر' }).click();
  await expect.poll(() => scene.locator('[data-sultan-palace]').evaluate(element => element.getAttribute('style'))).not.toBe(first);
  await scene.getByLabel('وجهة كاميرا القصر').selectOption('FULLPALACE');
  await page.screenshot({ path: info.outputPath('palace-customized.png'), fullPage: true });
  await scene.getByRole('button', { name: 'العودة إلى المدينة', exact: true }).click();
  await expect(page.locator('[data-city-scene]')).toHaveCount(0);
  await enter(page);
  await page.getByRole('button', { name: 'تخصيص الحديقة', exact: true }).click();
  await page.getByLabel('اختيار مساحة الحديقة').selectOption('0');
  await expect(page.getByRole('button', { name: 'أزرق', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
test('motion stops for pause and reduced motion, quality budgets and cleanup', async ({ page }, info) => {
  const scene = await enter(page), canvas = scene.locator('[data-sultan-palace] canvas');
  await expect.poll(() => frames(page)).toBeGreaterThan(30);
  await scene.getByRole('button', { name: 'إيقاف الحركة', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-palace-running', 'false');
  const frozen = hash(await pixelFrame(page));
  await page.waitForTimeout(650); expect(hash(await pixelFrame(page))).toBe(frozen);
  await scene.getByRole('button', { name: 'تشغيل الحركة', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(canvas).toHaveAttribute('data-palace-running', 'false');
  const reduced = hash(await pixelFrame(page)); await page.waitForTimeout(650); expect(hash(await pixelFrame(page))).toBe(reduced);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const measurements: unknown[] = [];
  try {
    for (const [quality, target] of [['high', 60], ['medium', 30], ['low', 20]] as const) {
      const oldCanvas = await canvas.elementHandle(); expect(oldCanvas).not.toBeNull();
      await scene.getByLabel("جودة القصر", { exact: true }).selectOption(quality);
      // AUTO can resolve to HIGH too; require the new renderer instance.
      await expect.poll(() => oldCanvas!.evaluate(element => element.isConnected)).toBe(false);
      await expect(scene.locator('[data-sultan-palace]')).toHaveAttribute('data-pixi-garden', 'true');
      await expect(canvas).toHaveAttribute('data-palace-target-fps', String(target));
      await expect(canvas).toHaveAttribute('data-palace-ambient', 'ready');
      const sample = await canvas.evaluate(async element => {
        type Snapshot = { frames: number; at: number; activeMs: number; initializedAt: number; ambientReadyAt: number | null };
        const surface = element as HTMLCanvasElement & { getPalaceFrameStats?: () => Snapshot };
        const readStats = surface.getPalaceFrameStats;
        if (!readStats) throw new Error('Per-canvas palace frame stats are unavailable');
        const read = () => ({ ...readStats(), connected: surface.isConnected,
          sameStatsOwner: surface.getPalaceFrameStats === readStats, hidden: document.hidden,
          quality: surface.dataset.palaceQuality, running: surface.dataset.palaceRunning === 'true',
          targetFps: Number(surface.dataset.palaceTargetFps), ambient: surface.dataset.palaceAmbient });
        const start = read(); await new Promise<void>(resolve => setTimeout(resolve, 3100));
        return { start, end: read() };
      });
      const elapsedMs = sample.end.at - sample.start.at;
      const fps = (sample.end.frames - sample.start.frames) * 1000 / elapsedMs;
      const measurement = { quality, target, observedFps: fps, elapsedMs,
        ambientStartupMs: sample.start.ambientReadyAt! - sample.start.initializedAt,
        activeMs: sample.end.activeMs - sample.start.activeMs, sample,
        updateMs: await canvas.getAttribute('data-palace-update-ms') };
      measurements.push(measurement); console.log(JSON.stringify(measurement));
      for (const snapshot of [sample.start, sample.end]) {
        expect(snapshot.connected).toBe(true); expect(snapshot.sameStatsOwner).toBe(true);
        expect(snapshot.hidden).toBe(false); expect(snapshot.running).toBe(true);
        expect(snapshot.quality).toBe(quality); expect(snapshot.targetFps).toBe(target);
        expect(snapshot.ambient).toBe('ready');
      }
      // Keep the entire elapsed interval, including any stopped time, in FPS.
      expect(measurement.activeMs).toBeGreaterThanOrEqual(elapsedMs - 100);
      expect(fps).toBeGreaterThan(target * .45); expect(fps).toBeLessThanOrEqual(target + 5);
    }
  } finally {
    await info.attach('quality-measurements', { body: JSON.stringify(measurements), contentType: 'application/json' });
  }
  await page.screenshot({ path: info.outputPath('palace-quality-low.png'), fullPage: true });
  const cdp = await page.context().newCDPSession(page);
  await page.getByRole('button', { name: 'العودة إلى المدينة', exact: true }).click();
  await cdp.send('HeapProfiler.collectGarbage');
  const beforeHeap = await cdp.send('Runtime.getHeapUsage');
  for (let count = 0; count < 3; count++) {
    await enter(page);
    await expect(page.locator('[data-sultan-palace] canvas')).toHaveCount(1);
    await page.getByRole('button', { name: 'العودة إلى المدينة', exact: true }).click();
    await expect(page.locator('[data-sultan-palace] canvas')).toHaveCount(0);
  }
  await cdp.send('HeapProfiler.collectGarbage');
  const afterHeap = await cdp.send('Runtime.getHeapUsage');
  await info.attach('unmount-heap', { body: JSON.stringify({ beforeHeap, afterHeap }), contentType: 'application/json' });
  expect(afterHeap.usedSize - beforeHeap.usedSize).toBeLessThan(8_000_000);
});

test('ground slot tap, pan, pinch, keyboard and offscreen pause', async ({ page }, info) => {
  const scene = await enter(page), frame = scene.locator('[data-sultan-palace]');
  const viewport = scene.getByRole('application');
  const bounds = await viewport.boundingBox(); expect(bounds).not.toBeNull();
  const point = await frame.evaluate(element => {
    const matrix = new DOMMatrix(getComputedStyle(element).getPropertyValue('--palace-camera-transform'));
    const rect = element.getBoundingClientRect(); return { x: rect.x + matrix.a * 622 + matrix.e, y: rect.y + matrix.d * 427 + matrix.f };
  });
  if (info.project.name === 'mobile') await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await expect(scene.getByLabel('اختيار مساحة الحديقة')).toHaveValue('0');
  await scene.getByRole('button', { name: 'إلغاء التعديل', exact: true }).click();
  await scene.getByLabel('وجهة كاميرا القصر').selectOption('GARDEN');
  await page.waitForTimeout(700);
  const before = await frame.getAttribute('style');
  const rect = await viewport.boundingBox(); const x = rect!.x + rect!.width / 2, y = rect!.y + rect!.height * .65;
  if (info.project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 25, y }, { x: x + 25, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 45, y }, { x: x + 45, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y + 12, { steps: 5 }); await page.mouse.up();
  }
  await expect.poll(() => frame.getAttribute('style')).not.toBe(before);
  await viewport.press('Home'); await page.waitForTimeout(700);
  const home = await frame.getAttribute('style'); await viewport.press('+');
  await expect.poll(() => frame.getAttribute('style')).not.toBe(home);
  if (info.project.name === 'mobile') {
    await scene.getByRole('button', { name: 'تخصيص الحديقة', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 240 });
    await scene.evaluate(element => element.scrollTo(0, element.scrollHeight));
    console.log(JSON.stringify(await scene.evaluate(element => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, height: element.clientHeight, frame: element.querySelector('[data-sultan-palace]')?.getBoundingClientRect().toJSON() }))));
    await expect(frame.locator('canvas')).toHaveAttribute('data-palace-running', 'false');
    await scene.evaluate(element => element.scrollTo(0, 0));
    await expect(frame.locator('canvas')).toHaveAttribute('data-palace-running', 'true');
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.screenshot({ path: info.outputPath('palace-navigation.png'), fullPage: true });
});

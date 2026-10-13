import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const evidence = path.resolve(process.cwd(), '../../docs/visual-evidence/market');
for (const [name, width, height, dpr] of [
  ['desktop', 1440, 900, 1], ['mobile', 390, 844, 1],
  ['narrow', 320, 568, 2], ['tablet', 834, 1194, 2], ['landscape', 844, 390, 2],
] as const) {
  test(`market visual evidence and usable form: ${name}`, async ({ browser, request }) => {
    await mkdir(evidence, { recursive: true });
    expect((await request.post('/__village_test/reset')).ok()).toBe(true);
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: width < 1000, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];
    const artworkRequests: string[] = [];
    page.on('request', req => { if (new URL(req.url()).pathname.includes('/city-scenes/market')) artworkRequests.push(new URL(req.url()).pathname); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    const stage = page.locator('[data-village-scene]');
    await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
    await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click();
    await page.getByLabel('اختر مبنى من الخريطة', { exact: true }).selectOption('market');
    const scene = page.locator('[data-city-scene="market"]');
    await expect(scene).toHaveAttribute('data-phase', 'active');
    await scene.locator('picture img').evaluate((img: HTMLImageElement) => img.decode());
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(evidence, `after-${name}.png`) });
    const initial = await scene.evaluate(element => {
      const image = element.querySelector('img')!;
      const rect = image.getBoundingClientRect();
      return { viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, source: image.currentSrc, densityCorrectedIntrinsic: [image.naturalWidth, image.naturalHeight], display: [rect.width, rect.height], font: getComputedStyle(element).fontFamily, overflow: document.documentElement.scrollWidth > innerWidth, sceneOverflow: element.scrollWidth > element.clientWidth };
    });
    expect(initial.overflow).toBe(false);
    expect(initial.sceneOverflow).toBe(false);
    expect(await page.evaluate(() => document.fonts.check('16px "Cairo Variable"'))).toBe(true);
    await expect(scene.locator('input')).toHaveCount(10);
    for (const field of await scene.locator('input').all()) {
      expect(await field.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    if (width <= 700) await scene.getByRole('button', { name: 'إدارة المرفق', exact: true }).click();
    const give = scene.getByRole('group', { name: 'الموارد التي تقدمها', exact: true });
    await give.getByLabel('خشب', { exact: true }).fill('10');
    const want = scene.getByRole('group', { name: 'الموارد التي تطلبها', exact: true });
    await want.getByLabel('حجر', { exact: true }).fill('5');
    await scene.getByRole('button', { name: 'انشر العرض', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(evidence, `after-${name}-form.png`) });
    const posted = page.waitForRequest(req => req.method() === 'POST' && new URL(req.url()).pathname === '/api/kingdoms');
    await scene.getByRole('button', { name: 'انشر العرض', exact: true }).click();
    expect((await posted).postDataJSON().command).toMatchObject({ type: 'tradeOffer', give: { wood: 10 }, want: { stone: 5 } });
    // The starting fixture has no built market: preserve and verify the real engine rejection.
    await expect(scene.locator('[data-city-feedback="error"]')).toBeVisible();
    const axe = await new AxeBuilder({ page }).include('[data-city-scene="market"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    await writeFile(path.join(evidence, `${name}-measurements.json`), JSON.stringify({ ...initial, fixture: 'local real components + local engine, no production account', artworkRequests, resourceTiming: await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.includes('/city-scenes/market')).map(e => ({ name: new URL(e.name).pathname, durationMs: e.duration, encodedBytes: (e as PerformanceResourceTiming).encodedBodySize }))), errors, axeViolations: axe.violations }, null, 2) + '\n');
    expect(axe.violations).toEqual([]);
    expect(artworkRequests).toHaveLength(1);
    expect(artworkRequests[0]).toMatch(/market-(768|1280|1672)\.avif$/);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const enlargedInput = give.getByLabel('خشب', { exact: true });
    await enlargedInput.fill('50000');
    await enlargedInput.scrollIntoViewIfNeeded();
    expect(await enlargedInput.evaluate((el: HTMLInputElement) => {
      const css = getComputedStyle(el), canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!; ctx.font = css.font;
      return el.clientWidth >= ctx.measureText(el.value).width + 20;
    })).toBe(true);
    await page.screenshot({ path: path.join(evidence, `after-${name}-fields-text-200.png`) });
    await scene.getByRole('button', { name: 'انشر العرض', exact: true }).scrollIntoViewIfNeeded();
    await expect(scene.getByRole('button', { name: 'انشر العرض', exact: true })).toBeInViewport();
    await page.screenshot({ path: path.join(evidence, `after-${name}-text-200.png`) });
    expect(await scene.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await scene.getByRole('button', { name: 'العودة إلى المدينة', exact: true }).focus();
    await expect(scene.getByRole('button', { name: 'العودة إلى المدينة', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(scene).toHaveCount(0);
    await expect(stage).toHaveAttribute('data-camera-state', 'CITY_OVERVIEW');
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('built market publishes and cancels an offer through the existing local engine', async ({ page, request }) => {
  expect((await request.post('/__village_test/offline-scenario')).ok()).toBe(true);
  expect((await request.post('/__village_test/advance-five-hours')).ok()).toBe(true);
  expect((await request.post('/api/kingdoms', { data: { worldId: 'browser-world', command: { type: 'build', villageId: 'v1', building: 'market' } } })).ok()).toBe(true);
  expect((await request.post('/__village_test/advance-five-hours')).ok()).toBe(true);
  await page.goto('/');
  await expect(page.locator('[data-village-scene]')).toHaveAttribute('data-pixi-ready', 'true');
  await page.locator('summary').filter({ hasText: /^إعدادات القرية$/ }).click();
  await page.getByLabel('اختر مبنى من الخريطة', { exact: true }).selectOption('market');
  const scene = page.locator('[data-city-scene="market"]');
  await expect(scene).toHaveAttribute('data-phase', 'active');
  await scene.getByRole('group', { name: 'الموارد التي تقدمها', exact: true }).getByLabel('خشب', { exact: true }).fill('10');
  await scene.getByRole('group', { name: 'الموارد التي تطلبها', exact: true }).getByLabel('حجر', { exact: true }).fill('5');
  await scene.getByRole('button', { name: 'انشر العرض', exact: true }).click();
  await expect(scene.getByRole('button', { name: 'ألغِ العرض', exact: true })).toBeVisible();
  const state = (await (await request.get('/api/kingdoms')).json()).data;
  expect(state.offers).toHaveLength(1);
  expect(state.offers[0]).toMatchObject({ give: { wood: 10 }, want: { stone: 5 } });
  await scene.getByRole('button', { name: 'ألغِ العرض', exact: true }).click();
  await expect(scene.getByRole('button', { name: 'ألغِ العرض', exact: true })).toHaveCount(0);
  expect((await (await request.get('/api/kingdoms')).json()).data.offers).toHaveLength(0);
});

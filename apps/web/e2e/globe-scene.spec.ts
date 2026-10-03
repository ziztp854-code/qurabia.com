import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { GeoJSONSource } from 'maplibre-gl';
import type { MapPayload } from '@mamluk/world-map-core';
import type {} from './fixtures/globe-map-probe';

const fixtureRuntime = createRequire(__filename);
const imageRuntime = createRequire(fixtureRuntime.resolve('next/package.json'));
const decodeImage = imageRuntime('sharp') as (input: Buffer) => {
  extract: (rect: { left: number; top: number; width: number; height: number }) => {
    toBuffer: () => Promise<Buffer>;
  };
  stats: () => Promise<{ channels: { mean: number }[] }>;
};

test.beforeEach(async ({ request }) => {
  await request.post('/__globe_test/reset');
});

async function openGlobe(page: Page, referenceOnly = false) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const payload = page.waitForResponse((response) =>
    response.url().includes('/world-map/viewport?') && response.status() === 200);
  const tile = page.waitForResponse((response) =>
    /tiles\.openfreemap\.org\/.*\.pbf/.test(response.url()) && response.status() === 200);
  await page.goto(`/globe${referenceOnly ? '?mode=public' : ''}`);
  const initialPayload = await (await payload).json() as MapPayload;
  await tile;
  await expect(page.locator('canvas.maplibregl-canvas[data-map-ready="true"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'عرض الكرة بالكامل', exact: true })).toBeVisible();
  return { initialPayload, errors };
}

async function camera(page: Page) {
  return page.evaluate(() => {
    const map = window.__globeFixtureMap!;
    const projectedCenter = map.project(map.getCenter());
    return { center: map.getCenter().toArray(), zoom: map.getZoom(),
      pitch: map.getPitch(), bearing: map.getBearing(), projection: map.getProjection().type,
      width: map.getCanvas().clientWidth, height: map.getCanvas().clientHeight,
      canvasWidth: map.getCanvas().width, canvasHeight: map.getCanvas().height,
      containerWidth: map.getContainer().clientWidth, containerHeight: map.getContainer().clientHeight,
      centerPixel: [projectedCenter.x, projectedCenter.y],
      pixelRatio: devicePixelRatio };
  });
}

async function currentCity(page: Page) {
  return page.evaluate(() => {
    const data = window.__globeFixtureMap!
      .getSource<GeoJSONSource>('mamluk-cities')?.serialize().data;
    if (typeof data !== 'object' || data?.type !== 'FeatureCollection') return null;
    const city = data.features.find((feature: { readonly id?: string | number }) => feature.id === 'cairo');
    return city ? { id: city.id, geometry: city.geometry } : null;
  });
}

async function cityHit(page: Page) {
  return page.evaluate(() => {
    const map = window.__globeFixtureMap!;
    const point = map.project([31.2357, 30.0444]);
    return map.queryRenderedFeatures([point.x, point.y - 18], { layers: ['mamluk-cities'] })
      .some((feature) => feature.id === 'cairo');
  });
}

async function overviewScreenshot(page: Page, testInfo: TestInfo) {
  const frame = (await page.locator('canvas.maplibregl-canvas').boundingBox())!;
  const { centerPixel, width, height } = await camera(page);
  // Full-page capture changes the compositor viewport of this dvh/WebGL scene.
  const screenshot = await page.screenshot({ path: testInfo.outputPath('full-globe.png'), scale: 'css' });
  const color = async (x: number, y: number) => {
    const crop = await decodeImage(screenshot).extract({
      left: Math.round(frame.x + x), top: Math.round(frame.y + y), width: 1, height: 1,
    }).toBuffer();
    return (await decodeImage(crop).stats()).channels.slice(0, 3).map((channel) => channel.mean);
  };
  const centerColor = await color(centerPixel[0]!, centerPixel[1]! - 18);
  const outsideColor = await color(width - 5, height / 2);
  // Cairo's rendered land/settlement must occupy the projected center, not the empty ocean.
  expect(centerColor.reduce((distance, value, index) => distance + Math.abs(value - outsideColor[index]!), 0)).toBeGreaterThan(60);
}

async function verifyLayout(page: Page) {
  const toolbar = page.getByRole('group', { name: 'عرض الخريطة', exact: true });
  const navigation = page.getByRole('group', { name: 'التنقل على الخريطة', exact: true });
  const toolbarBox = await toolbar.boundingBox();
  const navigationBox = await navigation.boundingBox();
  const canvasBox = await page.locator('canvas.maplibregl-canvas').boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(toolbarBox!.x).toBeGreaterThanOrEqual(canvasBox!.x);
  expect(toolbarBox!.x + toolbarBox!.width).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width);
  expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(navigationBox!.y);
  const statusBox = await page.locator('[data-state]').boundingBox();
  expect(statusBox).not.toBeNull();
  const intersects = (left: NonNullable<typeof toolbarBox>, right: NonNullable<typeof toolbarBox>) =>
    left.x < right.x + right.width && left.x + left.width > right.x &&
    left.y < right.y + right.height && left.y + left.height > right.y;
  expect(intersects(toolbarBox!, statusBox!)).toBe(false);
  expect(intersects(navigationBox!, statusBox!)).toBe(false);
  for (const button of await toolbar.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(toolbarBox!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(toolbarBox!.x + toolbarBox!.width);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('global aggregate markers drill into the same map with real SDK string IDs', async ({ page }, testInfo) => {
  const { errors } = await openGlobe(page);
  await page.evaluate(() => { (window as unknown as { savedMap: unknown }).savedMap = window.__globeFixtureMap; });
  await page.getByRole('button', { name: 'عرض الكرة بالكامل', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__globeFixtureMap!.getLayer('mamluk-overview-cells')))).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const map = window.__globeFixtureMap!;
    const point = map.project([31.2357, 30.0444]);
    return map.queryRenderedFeatures(point, { layers: ['mamluk-overview-cells'] }).map((feature) => feature.id);
  })).toContain('cell:14:8');
  await page.locator('canvas.maplibregl-canvas').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('unified-world-overview.png') });
  const point = await page.evaluate(() => {
    const map = window.__globeFixtureMap!, bounds = map.getCanvas().getBoundingClientRect();
    const projected = map.project([31.2357, 30.0444]);
    return { x: bounds.left + projected.x, y: bounds.top + projected.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThanOrEqual(8.9);
  await expect.poll(() => currentCity(page)).toMatchObject({ id: 'cairo' });
  expect(await page.evaluate(() => (window as unknown as { savedMap: unknown }).savedMap === window.__globeFixtureMap)).toBe(true);
  expect(errors).toEqual([]);
});

test('campaign modes preserve the actual map instance, camera and village through refresh', async ({ page }) => {
  const { errors } = await openGlobe(page);
  await page.evaluate(() => { (window as unknown as { savedMap: unknown }).savedMap = window.__globeFixtureMap; });
  const before = await camera(page);
  for (const mode of ['SELECT_ATTACK_TARGET', 'SELECT_SCOUT_TARGET', 'SELECT_REINFORCEMENT_TARGET']) {
    await page.getByRole('combobox', { name: 'وضع الخريطة', exact: true }).selectOption(mode);
    await expect(page.getByRole('button', { name: 'تأكيد الهدف', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'تأكيد الهدف', exact: true }).click();
    await expect(page.getByLabel('الهدف المؤكد')).toHaveText('cairo');
    expect(await page.evaluate(() => (window as unknown as { savedMap: unknown }).savedMap === window.__globeFixtureMap)).toBe(true);
    expect((await camera(page)).center).toEqual(before.center);
    expect((await camera(page)).zoom).toEqual(before.zoom);
  }
  const refreshed = page.waitForResponse((response) => response.url().includes('/world-map/viewport?') && response.status() === 200);
  await page.getByRole('button', { name: 'حدّث الخريطة', exact: true }).click();
  await refreshed;
  await expect.poll(() => currentCity(page)).toMatchObject({ id: 'cairo' });
  await page.getByRole('combobox', { name: 'وضع الخريطة', exact: true }).selectOption('SELECT_SETTLEMENT_TARGET');
  await expect(page.getByRole('button', { name: 'تأكيد الهدف', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('real globe and mercator preserve village WGS84 identity and canonical management links', async ({ page }, testInfo) => {
  const { initialPayload, errors } = await openGlobe(page);
  const expected = { id: 'cairo', geometry: { type: 'Point', coordinates: [31.2357, 30.0444] } };
  expect(initialPayload.layers.cities.features[0]).toMatchObject(expected);
  await expect.poll(() => currentCity(page)).toEqual(expected);
  await expect.poll(() => cityHit(page)).toBe(true);
  const panel = page.getByRole('complementary', { name: 'تفاصيل الخريطة', exact: true });
  await expect(panel.getByText('31.2357 / 30.0444', { exact: true })).toBeVisible();
  const management = panel.getByRole('link', { name: 'إدارة القرية', exact: true });
  await expect(management).toHaveAttribute('href', '/games/kingdoms?worldId=world&villageId=cairo&tab=village');
  await expect(page.getByRole('navigation', { name: 'قراي' }).getByRole('link', { name: 'القاهرة' }))
    .toHaveAttribute('href', '/games/kingdoms/world-map?worldId=world&villageId=cairo');
  await verifyLayout(page);
  await page.locator('summary').filter({ hasText: 'عرض الخريطة' }).click();
  await page.getByRole('button', { name: 'خريطة مسطحة', exact: true }).click();
  await expect.poll(async () => (await camera(page)).projection).toBe('mercator');
  await expect.poll(() => currentCity(page)).toEqual(expected);
  await expect.poll(() => cityHit(page)).toBe(true);
  await expect(panel.getByText('31.2357 / 30.0444', { exact: true })).toBeVisible();
  await expect(management).toHaveAttribute('href', '/games/kingdoms?worldId=world&villageId=cairo&tab=village');
  await page.getByRole('button', { name: 'الكرة الأرضية', exact: true }).click();
  await expect.poll(async () => (await camera(page)).projection).toBe('globe');
  await expect.poll(() => currentCity(page)).toEqual(expected);
  await expect(page.locator('canvas.maplibregl-canvas[data-map-ready="true"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('village-globe.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('full-globe view fits the canvas and home follows the refreshed village location', async ({ page, request }, testInfo) => {
  const { errors } = await openGlobe(page);
  await request.post('/__globe_test/relocated');
  const refreshed = page.waitForResponse((response) => response.url().includes('/world-map/viewport?') && response.status() === 200);
  await page.getByRole('button', { name: 'حدّث الخريطة', exact: true }).click();
  expect((await (await refreshed).json() as MapPayload).layers.cities.features[0]!.geometry.coordinates).toEqual([31.35, 30.12]);
  await expect.poll(() => currentCity(page)).toEqual({ id: 'cairo', geometry: { type: 'Point', coordinates: [31.35, 30.12] } });
  const close = page.getByRole('button', { name: 'أغلق تفاصيل الموقع', exact: true });
  if (await close.isVisible()) await close.click();
  await page.getByRole('button', { name: 'عرض الكرة بالكامل', exact: true }).click();
  await expect.poll(async () => (await camera(page)).projection).toBe('globe');
  await expect.poll(async () => (await camera(page)).zoom).toBeLessThanOrEqual(1.5);
  await expect(page.locator('canvas.maplibregl-canvas[data-map-ready="true"]')).toBeVisible();
  const overview = await camera(page);
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const cameraPath = testInfo.outputPath('overview-camera.json');
  await writeFile(cameraPath, JSON.stringify({ before: overview, after: await camera(page) }, null, 2));
  await testInfo.attach('overview-camera', { path: cameraPath, contentType: 'application/json' });
  expect(overview.zoom).toBeCloseTo(Math.max(0, Math.min(1.5, Math.log2(Math.min(overview.width, overview.height) / 256))), 4);
  expect(overview.pitch).toBe(0);
  expect(overview.bearing).toBe(0);
  expect(256 * 2 ** overview.zoom).toBeLessThanOrEqual(Math.min(overview.width, overview.height));
  await verifyLayout(page);
  await overviewScreenshot(page, testInfo);
  await page.getByRole('button', { name: 'انتقل إلى قريتك', exact: true }).click();
  await expect.poll(async () => (await camera(page)).center[0]).toBeCloseTo(31.35, 7);
  await expect.poll(async () => (await camera(page)).center[1]).toBeCloseTo(30.12, 7);
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(6.5, 7);
  expect(errors).toEqual([]);
});

test('public atlas remains reference-only across projections and full-globe navigation', async ({ page }, testInfo) => {
  const relocationRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/world-map/relocate')) relocationRequests.push(request.url());
  });
  const { initialPayload, errors } = await openGlobe(page, true);
  expect(initialPayload.worldId).toBe('public-atlas');
  expect(initialPayload.layers.armies.features).toEqual([]);
  await expect(page.getByRole('navigation', { name: 'قراي' })).toHaveCount(0);
  const expand = page.getByRole('button', { name: 'افتح تفاصيل الخريطة', exact: true });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('button', { name: 'القاهرة', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'تفاصيل الخريطة', exact: true });
  await expect(panel.getByText('31.2357 / 30.0444', { exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'إدارة القرية', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'خريطة مسطحة', exact: true }).click();
  await expect.poll(async () => (await camera(page)).projection).toBe('mercator');
  await expect.poll(() => currentCity(page)).toEqual({ id: 'cairo', geometry: { type: 'Point', coordinates: [31.2357, 30.0444] } });
  await page.getByRole('button', { name: 'عرض الكرة بالكامل', exact: true }).click();
  await expect.poll(async () => (await camera(page)).projection).toBe('globe');
  await expect(page.locator('canvas.maplibregl-canvas[data-map-ready="true"]')).toBeVisible();
  await verifyLayout(page);
  await page.screenshot({ path: testInfo.outputPath('public-atlas.png'), fullPage: true });
  expect(relocationRequests).toEqual([]);
  expect(errors).toEqual([]);
});

import { test, expect, type Page } from '@playwright/test';
import type { GeoJSONSource } from 'maplibre-gl';
import type {} from './fixtures/globe-map-probe';

test.skip(process.env.RUN_MAMLUK_PREVIEW_E2E !== '1', 'Standalone local fixture only.');
test.beforeEach(async ({ request }) => {
  await request.post('/__globe_test/reset');
  await request.post('/__globe_test/control', { data: { ttlMs: 60000 } });
});

const snapshot = (page: Page) =>
  page.evaluate(() => {
    const map = window.__globeFixtureMap;
    const data = map?.getSource<GeoJSONSource>('mamluk-cities')?.serialize().data;
    if (typeof data !== 'object' || data?.type !== 'FeatureCollection') return null;
    const feature = data.features.find((entry: { id?: string | number }) => entry.id === 'cairo');
    return feature
      ? { id: feature.id, geometry: feature.geometry, properties: feature.properties }
      : null;
  });
async function open(page: Page, variant = 'after') {
  const response = page.waitForResponse(
    (r) => r.url().includes('/world-map/viewport?') && r.status() === 200,
  );
  await page.goto(`/globe?variant=${variant}`);
  await response;
  await expect
    .poll(() => snapshot(page))
    .toMatchObject({ id: 'cairo', properties: { villageLevel: 12 } });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window
          .__globeFixtureMap!.queryRenderedFeatures({ layers: ['mamluk-cities'] })
          .some((feature) => feature.id === 'cairo'),
      ),
    )
    .toBe(true);
}

test('visual before and after, selection and stable coordinates on the existing world map', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page, 'before');
  await expect
    .poll(() => page.evaluate(() => window.__globeFixtureMap!.hasImage('mamluk-tier-3')))
    .toBe(true);
  const before = await snapshot(page);
  await page
    .getByRole('region', { name: 'الخريطة الاستراتيجية' })
    .screenshot({ path: info.outputPath('before-world-map.png') });
  await open(page);
  await expect
    .poll(() => page.evaluate(() => window.__globeFixtureMap!.getLayer('mamluk-cities')?.type))
    .toBe('symbol');
  await expect
    .poll(async () => (await snapshot(page))?.properties?.villageThumbnail)
    .toContain('mamluk-own-village-');
  const after = await snapshot(page);
  expect(after?.geometry).toEqual(before?.geometry);
  expect(after?.properties?.name).toBe(before?.properties?.name);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = window
          .__globeFixtureMap!.getSource<GeoJSONSource>('mamluk-cities')!
          .serialize().data;
        if (typeof data !== 'object' || data?.type !== 'FeatureCollection') return false;
        const id = data.features[0]?.properties?.villageThumbnail;
        return typeof id === 'string' && window.__globeFixtureMap!.hasImage(id);
      }),
    )
    .toBe(true);
  await page.getByRole('button', { name: /أغلق.*تفاصيل/ }).click();
  await expect(page.getByRole('heading', { name: /القاهرة/ })).not.toBeVisible();
  const canvas = page.locator('canvas.maplibregl-canvas');
  const point = await page.evaluate(() => window.__globeFixtureMap!.project([31.2357, 30.0444]));
  await canvas.click({ position: { x: point.x, y: point.y } });
  await expect(page.getByRole('heading', { name: /القاهرة/ })).toBeVisible();
  await page
    .getByRole('region', { name: 'الخريطة الاستراتيجية' })
    .screenshot({ path: info.outputPath('after-world-map.png') });
  await page.screenshot({ path: info.outputPath('after-full-page.png'), fullPage: true });
  const closeup = await page.evaluate(() => {
    const map = window.__globeFixtureMap!;
    map.jumpTo({ center: [31.2357, 30.0444], zoom: 12 });
    return map.getZoom();
  });
  expect(closeup).toBe(12);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__globeFixtureMap!.queryRenderedFeatures({ layers: ['mamluk-cities'] }).length,
      ),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole('region', { name: 'الخريطة الاستراتيجية' })
    .screenshot({ path: info.outputPath('after-village-closeup.png') });
  const measurements = await page.evaluate(async () => {
    const durations: number[] = [];
    await new Promise<void>((resolve) => {
      let previous = performance.now();
      const frame = () => {
        const next = performance.now();
        durations.push(next - previous);
        previous = next;
        if (durations.length === 20) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    durations.sort((a, b) => a - b);
    return {
      frameP50Ms: durations[10],
      frameP95Ms: durations[19],
      miniatureImages: window
        .__globeFixtureMap!.listImages()
        .filter((id) => /mamluk-(own-village|village-mini)-/.test(id)).length,
    };
  });
  expect(measurements.miniatureImages).toBeLessThanOrEqual(38);
  await info.attach('miniature-performance', {
    body: JSON.stringify(measurements),
    contentType: 'application/json',
  });
  expect(errors).toEqual([]);
});

test('slow legacy images do not block first data or the miniature', async ({ page }, info) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/game-art\/mamluk-map\/(village|castle)\.png$/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await open(page);
    await expect
      .poll(() => page.evaluate(() => window.__globeFixtureMap!.getLayer('mamluk-cities')?.type))
      .toBe('symbol');
    await page
      .getByRole('region', { name: 'الخريطة الاستراتيجية' })
      .screenshot({ path: info.outputPath('slow-images-visible.png') });
    expect((await snapshot(page))?.geometry).toEqual({
      type: 'Point',
      coordinates: [31.2357, 30.0444],
    });
  } finally {
    release();
  }
});

test('failure expires private architecture and forces; auth revocation removes all previous villages', async ({
  page,
  request,
}) => {
  await open(page);
  expect((await snapshot(page))?.properties?.villageBuildings).toBeTruthy();
  await request.post('/__globe_test/control', { data: { ttlMs: 2000 } });
  const fresh = page.waitForResponse(
    (response) => response.url().includes('/world-map/viewport?') && response.status() === 200,
  );
  await page.getByRole('button', { name: 'حدّث الخريطة', exact: true }).click();
  await fresh;
  await request.post('/__globe_test/control', { data: { fault: '503' } });
  await expect
    .poll(async () => (await snapshot(page))?.properties?.villageBuildings, { timeout: 10000 })
    .toBeUndefined();
  expect((await snapshot(page))?.properties).not.toHaveProperty('villageThumbnail');
  expect((await snapshot(page))?.properties).not.toHaveProperty('fortificationLevel');
  expect((await snapshot(page))?.properties?.name).toBe('القاهرة');
  await expect
    .poll(() =>
      page.evaluate(() => window.__globeFixtureMap!.getSource('mamluk-armies') === undefined),
    )
    .toBe(true);
  await request.post('/__globe_test/control', { data: { fault: 'ok', ttlMs: 60000, level: 13 } });
  await page.getByRole('button', { name: 'حدّث الخريطة', exact: true }).click();
  await expect.poll(async () => (await snapshot(page))?.properties?.villageLevel).toBe(13);
  await request.post('/__globe_test/control', { data: { fault: '401' } });
  await page.getByRole('button', { name: 'حدّث الخريطة', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__globeFixtureMap!.getSource('mamluk-cities') === undefined),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window
            .__globeFixtureMap!.listImages()
            .filter((id) => id.startsWith('mamluk-own-village-')).length,
      ),
    )
    .toBe(0);
});

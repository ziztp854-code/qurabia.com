import { expect, test } from '@playwright/test';
import { approvedPayload } from '../src/components/mamluk-map/map-fixture';

test('the built public atlas loads its versioned worker and provider glyphs', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const watchedResponses: { url: string; status: number }[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('response', (response) => {
    const url = response.url();
    if (/maplibre-gl-worker|fonts\/|glyph|\.pbf(?:\?|$)/i.test(url)) {
      watchedResponses.push({ url, status: response.status() });
    }
  });

  let fulfilledViewports = 0;
  await page.route('**/api/kingdoms/world-map/viewport**', async (route) => {
    const now = Date.now();
    const requestUrl = new URL(route.request().url());
    const bounds = {
      west: Number(requestUrl.searchParams.get('west')),
      south: Number(requestUrl.searchParams.get('south')),
      east: Number(requestUrl.searchParams.get('east')),
      north: Number(requestUrl.searchParams.get('north')),
    };
    const payload = approvedPayload('mamluk-public-geographic-atlas-v1');
    fulfilledViewports += 1;
    await route.fulfill({
      status: 200,
      headers: { 'X-Mamluk-Public-Settlements': '1' },
      json: {
        ...payload,
        serverTime: now,
        expiresAt: now + 60_000,
        bounds,
        layers: {
          ...payload.layers,
          cities: {
            ...payload.layers.cities,
            features: payload.layers.cities.features.map((city) => ({
              ...city,
              properties: {
                ...city.properties,
                ownerPlayerId: null,
                ownerSultanateId: null,
                fortificationLevel: 0,
                strategicValue: 0,
              },
            })),
          },
        },
      },
    });
  });

  await page.goto('/games/kingdoms/world-map/');
  await expect.poll(() => fulfilledViewports).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'انتقل إلى القاهرة' })).toBeVisible();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect
    .poll(
      () =>
        watchedResponses.filter((entry) => /tiles\.openfreemap\.org\/fonts\//i.test(entry.url))
          .length,
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('local-production-map.png'), fullPage: true });

  const worker = watchedResponses.find((entry) => /maplibre-gl-worker/.test(entry.url));
  expect(worker).toMatchObject({ status: 200 });
  expect(worker?.url).toMatch(/[?&]v=6\.11\.2(?:&|$)/);

  const glyphs = watchedResponses.filter((entry) =>
    /tiles\.openfreemap\.org\/fonts\//i.test(entry.url),
  );
  const geography = watchedResponses.filter((entry) =>
    /tiles\.openfreemap\.org\/(?:planet|natural_earth)\//i.test(entry.url),
  );
  expect(glyphs.length).toBeGreaterThan(0);
  expect(glyphs.every((entry) => entry.status < 400)).toBe(true);
  expect(glyphs.some((entry) => /cairo/i.test(entry.url))).toBe(false);
  expect(geography.length).toBeGreaterThan(0);
  expect(geography.every((entry) => entry.status < 400)).toBe(true);
  expect(
    consoleErrors.filter((message) => /glyph|maplibre-gl-worker|cairo/i.test(message)),
  ).toEqual([]);

  await testInfo.attach('local built map responses', {
    body: Buffer.from(JSON.stringify({ worker, glyphs, geography, consoleErrors }, null, 2)),
    contentType: 'application/json',
  });
});

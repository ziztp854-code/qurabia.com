import { test, expect, type Page, type Route, type APIResponse } from '@playwright/test';
import type { GeoJSONSource, Map as LibreMap } from 'maplibre-gl';
import type {} from './fixtures/globe-map-probe';
import type { Feature } from '@mamluk/world-map-core';

// Real browser, real MapLibre, deterministic local API: only the transport is controlled.
declare global {
  interface Window {
    __savedMap?: LibreMap;
    __anomalies?: string[];
    __samples?: number;
    __requests?: { kind: string; at: number }[];
    __savedCities?: GeoJSONSource;
  }
}

// Needs the standalone fixture server from playwright.mamluk-continuity.config.ts; the default
// application suite must not run it against the real app.
test.skip(
  process.env.RUN_MAMLUK_CONTINUITY_E2E !== '1',
  'Requires the standalone map fixture server.',
);

const OWN_TIER = 3;

test.beforeEach(async ({ request }) => {
  await request.post('/__globe_test/reset');
});

async function control(
  request: import('@playwright/test').APIRequestContext,
  body: Record<string, unknown>,
) {
  await request.post('/__globe_test/control', { data: body });
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__requests = [];
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/world-map/viewport?'))
        window.__requests!.push({ kind: 'viewport', at: Date.now() });
      else if (url.includes('/world-map/overview?'))
        window.__requests!.push({ kind: 'overview', at: Date.now() });
      return nativeFetch(input, init);
    };
  });
  const first = page.waitForResponse(
    (response) => response.url().includes('/world-map/viewport?') && response.status() === 200,
  );
  await page.goto('/globe');
  await first;
  await expect(page.locator('canvas.maplibregl-canvas[data-map-ready="true"]')).toBeVisible();
  await expect.poll(() => cairo(page)).toMatchObject({ villageVisualTier: OWN_TIER });
  await page.evaluate((tier) => {
    window.__savedMap = window.__globeFixtureMap;
    window.__anomalies = [];
    window.__samples = 0;
    // Every 20 ms: the own village must be present with its authorized presentation, and a
    // layer the user hid must never be visible, even for a single sample.
    setInterval(() => {
      const map = window.__savedMap!;
      const data = map.getSource<GeoJSONSource>('mamluk-cities')?.serialize().data;
      const feature =
        typeof data === 'object' && data?.type === 'FeatureCollection'
          ? data.features.find((entry: { readonly id?: string | number }) => entry.id === 'cairo')
          : undefined;
      window.__samples = (window.__samples ?? 0) + 1;
      if (!feature) window.__anomalies!.push('village missing');
      else if (feature.properties?.villageVisualTier !== tier)
        window.__anomalies!.push('tier ' + String(feature.properties?.villageVisualTier));
      const hidden = (window as unknown as { __hideCities?: boolean }).__hideCities;
      for (const id of ['mamluk-cities', 'mamluk-cities-owner-markers', 'mamluk-village-clusters'])
        if (hidden && map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none')
          window.__anomalies!.push('layer visible ' + id);
    }, 20);
  }, OWN_TIER);
  return { errors };
}

function cairo(page: Page) {
  return page.evaluate(() => {
    const data = window.__globeFixtureMap
      ?.getSource<GeoJSONSource>('mamluk-cities')
      ?.serialize().data;
    if (typeof data !== 'object' || data?.type !== 'FeatureCollection') return null;
    return (
      data.features.find((feature: { readonly id?: string | number }) => feature.id === 'cairo')
        ?.properties ?? null
    );
  });
}

function camera(page: Page) {
  return page.evaluate(() => {
    const map = window.__savedMap!;
    return { center: map.getCenter().toArray(), zoom: map.getZoom() };
  });
}

const requests = (page: Page, kind?: string) =>
  page.evaluate(
    (wanted) => window.__requests!.filter((entry) => !wanted || entry.kind === wanted).length,
    kind,
  );

async function finish(page: Page, errors: string[]) {
  expect(await page.evaluate(() => window.__savedMap === window.__globeFixtureMap)).toBe(true);
  expect(await page.evaluate(() => window.__samples!)).toBeGreaterThan(20);
  expect(await page.evaluate(() => window.__anomalies!)).toEqual([]);
  expect(errors).toEqual([]);
}

test('approved village miniatures render before slow legacy artwork without replacing their source', async ({
  page,
}, testInfo) => {
  let releaseArtwork!: () => void;
  const artworkGate = new Promise<void>((resolve) => {
    releaseArtwork = resolve;
  });
  await page.route(/\/game-art\/mamluk-map\/(village|castle)\.png$/, async (route) => {
    await artworkGate;
    await route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const first = page.waitForResponse(
      (response) => response.url().includes('/world-map/viewport?') && response.status() === 200,
    );
    await page.goto('/globe');
    await first;
    await expect
      .poll(() => cairo(page))
      .toMatchObject({ villageLevel: 12, villageVisualTier: OWN_TIER });
    await expect
      .poll(() => page.evaluate(() => window.__globeFixtureMap!.getLayer('mamluk-cities')?.type))
      .toBe('symbol');
    await expect
      .poll(() =>
        page.evaluate(() =>
          window
            .__globeFixtureMap!.queryRenderedFeatures({ layers: ['mamluk-cities'] })
            .some((feature) => feature.id === 'cairo'),
        ),
      )
      .toBe(true);
    await page.evaluate(() => {
      window.__savedCities = window.__globeFixtureMap!.getSource<GeoJSONSource>('mamluk-cities');
    });
    await page
      .getByRole('region', { name: 'الخريطة الاستراتيجية' })
      .screenshot({ path: testInfo.outputPath('villages-before-artwork.png') });
    releaseArtwork();
    await expect
      .poll(() => page.evaluate(() => window.__globeFixtureMap!.getLayer('mamluk-cities')?.type))
      .toBe('symbol');
    expect(
      await page.evaluate(
        () => window.__savedCities === window.__globeFixtureMap!.getSource('mamluk-cities'),
      ),
    ).toBe(true);
    // A changed style layer is attached before its worker buckets are rendered.
    // Query the visible symbol only once the actual SDK reports the frame loaded.
    await expect.poll(() => page.evaluate(() => window.__globeFixtureMap!.loaded())).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window
            .__globeFixtureMap!.queryRenderedFeatures({ layers: ['mamluk-cities'] })
            .some((feature) => feature.id === 'cairo'),
        ),
      )
      .toBe(true);
    await page
      .getByRole('region', { name: 'الخريطة الاستراتيجية' })
      .screenshot({ path: testInfo.outputPath('villages-after-artwork.png') });
    expect(errors).toEqual([]);
  } finally {
    releaseArtwork();
  }
});

test('villages stay visible through overview and rapid pan while the newest response wins', async ({
  page,
  request,
}, testInfo) => {
  await control(request, { ttlMs: 60000 });
  const { errors } = await open(page);
  await page.locator('summary', { hasText: 'عرض الخريطة' }).click();
  await page.getByRole('button', { name: 'خريطة مسطحة', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__savedMap!.getProjection().type))
    .toBe('mercator');
  const visibleVillage = () =>
    page.evaluate(() =>
      window
        .__savedMap!.queryRenderedFeatures({ layers: ['mamluk-cities'] })
        .some((feature) => feature.id === 'cairo'),
    );
  await expect.poll(visibleVillage).toBe(true);
  await page.evaluate(() => {
    window.__savedCities = window.__savedMap!.getSource<GeoJSONSource>('mamluk-cities');
  });
  const broad = page.waitForResponse(
    (response) => response.url().includes('/world-map/overview?') && response.status() === 200,
  );
  await setSpan(page, 120);
  await broad;
  await expect
    .poll(() =>
      page.evaluate(() => window.__savedMap!.getLayoutProperty('mamluk-cities', 'visibility')),
    )
    .toBe('visible');
  await expect.poll(visibleVillage).toBe(true);
  expect((await cairo(page))?.fortificationLevel).toBeUndefined();
  await page
    .getByRole('region', { name: 'الخريطة الاستراتيجية' })
    .screenshot({ path: testInfo.outputPath('villages-at-overview.png') });

  const pending: { route: Route; response: APIResponse; level: number }[] = [];
  await page.route(/\/world-map\/viewport\?/, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const city = payload.layers.cities.features.find(
      (feature: { id: string }) => feature.id === 'cairo',
    );
    pending.push({ route, response, level: city?.properties.villageLevel });
  });
  await setSpan(page, 60);
  await expect.poll(() => pending.length).toBe(1);
  for (const longitude of [31.4, 31.1, 31.3]) {
    await page.evaluate((lng) => window.__savedMap!.jumpTo({ center: [lng, 30] }), longitude);
    await expect.poll(visibleVillage).toBe(true);
  }
  await control(request, { level: 13 });
  await page.evaluate(() => window.__savedMap!.jumpTo({ center: [31.2, 30] }));
  // Intermediate pans may already have queued an old response. Identify the
  // updated server snapshot, rather than assuming the second arrival is newest.
  await expect.poll(() => pending.some((entry) => entry.level === 13)).toBe(true);
  const latest = pending.find((entry) => entry.level === 13)!;
  await latest.route.fulfill({ response: latest.response });
  await expect.poll(() => cairo(page)).toMatchObject({ villageLevel: 13 });
  // The obsolete fetch was aborted by the real browser; delivering its old response
  // must not resurrect the superseded snapshot.
  for (const obsolete of pending.filter((entry) => entry !== latest)) {
    await obsolete.route.fulfill({ response: obsolete.response });
    await obsolete.response.dispose();
  }
  await latest.response.dispose();
  await page.unrouteAll({ behavior: 'wait' });
  await expect.poll(() => cairo(page)).toMatchObject({ villageLevel: 13 });
  expect(
    await page.evaluate(
      () => window.__savedCities === window.__savedMap!.getSource('mamluk-cities'),
    ),
  ).toBe(true);
  await expect.poll(visibleVillage).toBe(true);
  await page
    .getByRole('region', { name: 'الخريطة الاستراتيجية' })
    .screenshot({ path: testInfo.outputPath('villages-after-rapid-pan.png') });
  await finish(page, errors);
});

test('village and camera survive background refresh, failure and recovery', async ({
  page,
  request,
}) => {
  await control(request, { ttlMs: 60000 });
  const { errors } = await open(page);
  const before = await camera(page);
  const polls = await requests(page, 'viewport');
  await expect.poll(() => requests(page, 'viewport'), { timeout: 15000 }).toBeGreaterThan(polls);
  expect(await cairo(page)).toMatchObject({ villageLevel: 12, villageVisualTier: OWN_TIER });

  await control(request, { fault: '503' });
  const failing = await requests(page, 'viewport');
  // More failures than any bounded fixed schedule would survive: recovery must still follow.
  await expect
    .poll(() => requests(page, 'viewport'), { timeout: 45000 })
    .toBeGreaterThanOrEqual(failing + 5);
  expect(await cairo(page)).toMatchObject({ villageLevel: 12 });

  await control(request, { fault: 'ok', level: 13 });
  await expect.poll(() => cairo(page), { timeout: 40000 }).toMatchObject({ villageLevel: 13 });
  // Normal polling resumes after the recovery.
  const resumed = await requests(page, 'viewport');
  await expect.poll(() => requests(page, 'viewport'), { timeout: 12000 }).toBeGreaterThan(resumed);
  expect(await camera(page)).toEqual(before);
  await finish(page, errors);
});

test('hidden tab and offline keep the snapshot and resume with an immediate refresh', async ({
  page,
  request,
  context,
}) => {
  await control(request, { ttlMs: 60000 });
  const { errors } = await open(page);
  const before = await camera(page);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  const hidden = await requests(page, 'viewport');
  await page.waitForTimeout(7000);
  expect(await requests(page, 'viewport')).toBe(hidden);
  expect(await cairo(page)).toMatchObject({ villageLevel: 12 });

  await control(request, { level: 13 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => cairo(page), { timeout: 3000 }).toMatchObject({ villageLevel: 13 });

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.waitForTimeout(500);
  const offline = await requests(page, 'viewport');
  await page.waitForTimeout(7000);
  expect(await requests(page, 'viewport')).toBe(offline);
  expect(await cairo(page)).toMatchObject({ villageLevel: 13 });

  await control(request, { level: 14 });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => cairo(page), { timeout: 3000 }).toMatchObject({ villageLevel: 14 });
  const online = await requests(page, 'viewport');
  await expect.poll(() => requests(page, 'viewport'), { timeout: 12000 }).toBeGreaterThan(online);
  expect(await camera(page)).toEqual(before);
  await finish(page, errors);
});

test('expiry refreshes before the next poll and never keeps private detail', async ({
  page,
  request,
}) => {
  await control(request, { ttlMs: 2500 });
  const { errors } = await open(page);
  expect(await cairo(page)).toMatchObject({ fortificationLevel: 4 });
  const firstAt = await page.evaluate(() => window.__requests!.at(-1)!.at);
  await expect.poll(() => requests(page, 'viewport'), { timeout: 4500 }).toBeGreaterThanOrEqual(2);
  const secondAt = await page.evaluate(() => window.__requests!.at(-1)!.at);
  expect(secondAt - firstAt).toBeLessThan(4500);

  // With the server failing, the expired snapshot is replaced by the safe public fallback.
  await control(request, { fault: '503' });
  await expect
    .poll(async () => (await cairo(page))?.fortificationLevel, { timeout: 20000 })
    .toBeUndefined();
  const fallback = await cairo(page);
  expect(fallback).toMatchObject({ villageLevel: 12, villageVisualTier: OWN_TIER });
  expect(fallback).not.toHaveProperty('villagePower');
  expect(fallback).not.toHaveProperty('villageRank');
  expect(fallback).not.toHaveProperty('strategicValue');

  await control(request, { fault: 'ok' });
  await expect
    .poll(async () => (await cairo(page))?.fortificationLevel, { timeout: 25000 })
    .toBe(4);
  await finish(page, errors);
});

test('revoked access clears the map, while a data failure keeps authorized public villages', async ({
  page,
  request,
}) => {
  await control(request, { ttlMs: 60000 });
  const { errors } = await open(page);
  await control(request, { fault: '400' });
  const failing = await requests(page, 'viewport');
  await expect
    .poll(() => requests(page, 'viewport'), { timeout: 25000 })
    .toBeGreaterThanOrEqual(failing + 2);
  expect(await cairo(page)).toMatchObject({ villageLevel: 12 });

  await control(request, { fault: '401' });
  await expect
    .poll(() => page.evaluate(() => window.__savedMap!.getSource('mamluk-cities') === undefined), {
      timeout: 25000,
    })
    .toBe(true);
  // Access loss is not retried automatically; no villages are shown from the old snapshot.
  const stopped = await requests(page, 'viewport');
  await page.waitForTimeout(7000);
  expect(await requests(page, 'viewport')).toBe(stopped);
  expect(await page.evaluate(() => window.__savedMap === window.__globeFixtureMap)).toBe(true);
  expect(errors).toEqual([]);
});

/** Zoom a flat map until its larger span equals the requested degrees. */
async function setSpan(page: Page, span: number) {
  await page.evaluate((target) => {
    const map = window.__savedMap!;
    for (let step = 0; step < 14; step += 1) {
      const bounds = map.getBounds();
      const current = Math.max(
        bounds.getEast() - bounds.getWest(),
        bounds.getNorth() - bounds.getSouth(),
      );
      if (Math.abs(current - target) < 0.2) break;
      map.jumpTo({ center: [31.2, 30], zoom: map.getZoom() + Math.log2(current / target) });
    }
    map.jumpTo({ center: [31.2, 30], zoom: map.getZoom() });
  }, span);
}

async function lastKindAfter(page: Page, count: number) {
  await expect.poll(() => requests(page), { timeout: 8000 }).toBeGreaterThan(count);
  await page.waitForTimeout(300);
  return page.evaluate(() => window.__requests!.at(-1)!.kind);
}

test('overview switches with hysteresis around the 90 degree limit', async ({ page }) => {
  const { errors } = await open(page);
  await page.locator('summary', { hasText: 'عرض الخريطة' }).click();
  await page.getByRole('button', { name: 'خريطة مسطحة', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__savedMap!.getProjection().type))
    .toBe('mercator');
  const saved = await page.evaluate(() => window.__savedMap!.getZoom());
  expect(saved).toBeGreaterThan(0);

  const kinds: string[] = [];
  for (const span of [88, 91, 88, 89.5, 86, 84, 88, 89.5, 84, 89]) {
    const count = await requests(page);
    await setSpan(page, span);
    kinds.push(await lastKindAfter(page, count));
  }
  // enter above 90, stay through 86–89.5, leave only at 85 or less, stay local up to 90.
  expect(kinds).toEqual([
    'viewport',
    'overview',
    'overview',
    'overview',
    'overview',
    'viewport',
    'viewport',
    'viewport',
    'viewport',
    'viewport',
  ]);

  // Oscillating inside the band never changes mode or recreates the map.
  const before = await requests(page, 'overview');
  for (let index = 0; index < 8; index += 1) {
    await setSpan(page, index % 2 ? 89.5 : 87);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);
  expect(await requests(page, 'overview')).toBe(before);
  expect(await page.evaluate(() => window.__savedMap === window.__globeFixtureMap)).toBe(true);
  expect(errors).toEqual([]);
});

test('a hidden layer stays hidden through refresh, expiry, recovery and overview transitions', async ({
  page,
  request,
}) => {
  await control(request, { ttlMs: 3000 });
  const { errors } = await open(page);
  await page.getByRole('button', { name: 'الطبقات', exact: true }).click();
  await page.getByRole('checkbox', { name: 'القرى والمدن', exact: true }).uncheck();
  await page.getByRole('button', { name: 'الطبقات', exact: true }).click();
  const visibility = () =>
    page.evaluate(() => window.__savedMap!.getLayoutProperty('mamluk-cities', 'visibility'));
  await expect.poll(visibility).toBe('none');
  await page.evaluate(() => {
    (window as unknown as { __hideCities: boolean }).__hideCities = true;
  });

  // expiry and manual refresh
  const polls = await requests(page, 'viewport');
  await expect
    .poll(() => requests(page, 'viewport'), { timeout: 12000 })
    .toBeGreaterThan(polls + 1);
  await page.getByRole('button', { name: 'حدّث الخريطة', exact: true }).click();
  expect(await visibility()).toBe('none');

  // failure and recovery
  await control(request, { fault: '503' });
  const failing = await requests(page, 'viewport');
  await expect
    .poll(() => requests(page, 'viewport'), { timeout: 20000 })
    .toBeGreaterThan(failing + 1);
  await control(request, { fault: 'ok', level: 13 });
  await expect.poll(() => cairo(page), { timeout: 20000 }).toMatchObject({ villageLevel: 13 });
  expect(await visibility()).toBe('none');

  // overview round trip
  await page.locator('summary', { hasText: 'عرض الخريطة' }).click();
  await page.getByRole('button', { name: 'خريطة مسطحة', exact: true }).click();
  const count = await requests(page);
  await setSpan(page, 120);
  expect(await lastKindAfter(page, count)).toBe('overview');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__savedMap!.getLayoutProperty('mamluk-overview-cells', 'visibility'),
      ),
    )
    .toBe('none');
  const back = await requests(page);
  await setSpan(page, 60);
  expect(await lastKindAfter(page, back)).toBe('viewport');
  await expect.poll(visibility).toBe('none');

  await page.evaluate(() => {
    (window as unknown as { __hideCities: boolean }).__hideCities = false;
  });
  await page.getByRole('button', { name: 'الطبقات', exact: true }).click();
  await page.getByRole('checkbox', { name: 'القرى والمدن', exact: true }).check();
  await expect.poll(visibility).toBe('visible');
  expect(await page.evaluate(() => window.__savedMap === window.__globeFixtureMap)).toBe(true);
  await finish(page, errors);
});

test.use({ video: 'on' });

test.describe('army journeys on the existing map', () => {
  async function military(page: Page, state: { accepted: boolean; fail: boolean }) {
    const departure = Date.now() - 20000;
    await page.route(/\/world-map\/viewport\?/, async (route) => {
      if (state.fail) {
        await route.fulfill({ status: 503, json: { error: 'Isolated network failure' } });
        return;
      }
      const response = await route.fetch();
      const payload = await response.json();
      const missions = ['attack', 'raid', 'reinforce', 'scout', 'gather', 'transport', 'return'];
      const armies: unknown[] = [],
        routes: unknown[] = [];
      if (state.accepted)
        missions.forEach((mission, index) => {
          const id = `fixture-${mission}`;
          const origin = [31.12, 29.985 + index * 0.022];
          const destination = [31.37, 30.055 + index * 0.022];
          if (mission === 'return') {
            const old = origin.slice();
            origin.splice(0, 2, ...destination);
            destination.splice(0, 2, ...old);
          }
          const arrives = departure + 100000;
          const progress = Math.max(0, Math.min(1, (payload.serverTime - departure) / 100000));
          armies.push({
            type: 'Feature',
            id,
            geometry: {
              type: 'Point',
              coordinates: [
                origin[0]! + (destination[0]! - origin[0]!) * progress,
                origin[1]! + (destination[1]! - origin[1]!) * progress,
              ],
            },
            properties: {
              armyId: id,
              ownerPlayerId: 'viewer',
              ownerSultanateId: null,
              status: mission === 'return' ? 'retreating' : 'moving',
              own: true,
            },
          });
          routes.push({
            type: 'Feature',
            id,
            geometry: { type: 'LineString', coordinates: [origin, destination] },
            properties: {
              armyId: id,
              mission,
              distance: 4,
              distanceUnit: 'tiles',
              departureTime: departure,
              arrivalTime: arrives,
            },
          });
        });
      payload.layers.armies = { type: 'FeatureCollection', features: armies };
      payload.layers.armyRoutes = { type: 'FeatureCollection', features: routes };
      payload.revision = state.accepted ? '2' : '1';
      await route.fulfill({ response, json: payload });
    });
  }

  const militaryData = (page: Page) =>
    page.evaluate(() => {
      const data = window.__globeFixtureMap
        ?.getSource<GeoJSONSource>('mamluk-armies')
        ?.serialize().data;
      return (typeof data === 'object' && data?.type === 'FeatureCollection'
        ? data.features
        : []) as unknown as readonly Feature[];
    });

  test('accepted armies move with direction and ETA without rebuilding the camera on desktop/mobile', async ({
    page,
  }, testInfo) => {
    const state = { accepted: false, fail: false };
    await military(page, state);
    const { errors } = await open(page);
    expect(await militaryData(page)).toEqual([]);
    await page.evaluate(() => {
      window.__savedMap!.jumpTo({ center: [31.2357, 30.06], zoom: 9.5 });
    });
    state.accepted = true;
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('mamluk:command-accepted', { detail: { worldId: 'world', revision: 2 } }),
      ),
    );
    await expect.poll(async () => (await militaryData(page)).length).toBe(7);
    const first = (await militaryData(page))[0]!;
    await page.evaluate(() => {
      (window as unknown as { __armySource?: GeoJSONSource }).__armySource =
        window.__savedMap!.getSource<GeoJSONSource>('mamluk-armies');
    });
    await expect
      .poll(async () => (await militaryData(page))[0]?.geometry)
      .not.toEqual(first.geometry);
    await expect(page.getByLabel('دليل مهام الجيش')).toBeVisible();
    expect(
      await page.evaluate(() => window.__savedMap!.getLayer('mamluk-army-direction')?.type),
    ).toBe('symbol');
    expect(
      (await militaryData(page)).every(
        (army) => army.properties?.__mamlukEta && army.properties?.__mamlukMissionSymbol,
      ),
    ).toBe(true);
    expect((await militaryData(page)).some((army) => army.id === 'hidden-enemy')).toBe(false);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__savedMap!.queryRenderedFeatures(undefined, { layers: ['mamluk-armies'] })
              .length,
        ),
      )
      .toBe(7);
    await expect(page.locator('canvas.maplibregl-canvas[data-map-ready="true"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__savedMap!.queryRenderedFeatures(undefined, { layers: ['mamluk-army-timers'] })
              .length,
        ),
      )
      .toBe(7);
    await page.screenshot({ path: testInfo.outputPath('army-journeys.png'), fullPage: true });
    await testInfo.attach('army journeys', {
      path: testInfo.outputPath('army-journeys.png'),
      contentType: 'image/png',
    });
    await page.evaluate(() =>
      window.__savedMap!.easeTo({ center: [31.26, 30.06], zoom: 10, duration: 150 }),
    );
    await expect
      .poll(() => page.evaluate(() => window.__savedMap === window.__globeFixtureMap))
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __armySource?: GeoJSONSource }).__armySource ===
            window.__savedMap!.getSource('mamluk-armies'),
        ),
      )
      .toBe(true);
    await expect.poll(async () => (await militaryData(page)).length).toBe(7);
    await page.getByRole('button', { name: 'جيشك', exact: true }).first().click();
    await expect(page.getByText('الوصول خلال', { exact: true })).toBeVisible();
    await expect(page.getByText('المهمة', { exact: true })).toBeVisible();
    await finish(page, errors);
  });

  test('reduced motion, expired offline data and reconnect keep authority and source cleanup', async ({
    page,
    request,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await control(request, { ttlMs: 3000 });
    const state = { accepted: true, fail: false };
    await military(page, state);
    const { errors } = await open(page);
    await expect.poll(async () => (await militaryData(page)).length).toBe(7);
    const initial = (await militaryData(page))[0]!.geometry;
    await expect.poll(async () => (await militaryData(page))[0]?.geometry).not.toEqual(initial);
    state.fail = true;
    await page.context().setOffline(true);
    await expect.poll(async () => (await militaryData(page)).length, { timeout: 10000 }).toBe(0);
    expect(
      await page.evaluate(() => window.__savedMap!.getLayer('mamluk-army-timers')),
    ).toBeUndefined();
    state.fail = false;
    await page.context().setOffline(false);
    await expect.poll(async () => (await militaryData(page)).length).toBe(7);
    await page.screenshot({ path: testInfo.outputPath('army-reconnected.png'), fullPage: true });
    await testInfo.attach('army reconnected', {
      path: testInfo.outputPath('army-reconnected.png'),
      contentType: 'image/png',
    });
    expect(await page.evaluate(() => window.__savedMap === window.__globeFixtureMap)).toBe(true);
    expect(errors).toEqual([]);
  });
});

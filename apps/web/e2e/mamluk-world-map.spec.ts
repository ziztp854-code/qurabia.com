import { expect, test, type Page, type Response } from '@playwright/test';
import { parseMapPayload, type MapPayload } from '@mamluk/world-map-core';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, type Prisma } from '@tahaddi/database';
import { createWorld, executeCommand } from '../src/lib/kingdoms/engine';

const mapPath = '/games/kingdoms/world-map';
const viewportPath = '/api/kingdoms/world-map/viewport';
const fixtureWorld = 'mamluk-geographic-local';
const publicAtlasWorld = 'mamluk-public-geographic-atlas-v1';

// Both the dedicated config and this spec guard against accidental general-suite execution.
test.skip(
  process.env.RUN_MAMLUK_MAP_E2E !== '1',
  'Requires the explicit isolated local map fixture.',
);
test.beforeAll(async ({ baseURL }) => {
  const database = new URL(process.env.KINGDOMS_TEST_DATABASE_URL ?? 'about:blank');
  if (
    baseURL !== 'http://127.0.0.1:3000' ||
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
    !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(database.pathname) ||
    database.search ||
    database.hash
  )
    throw new Error('This map suite can run only against the explicitly isolated local fixture.');
});

function isViewport(response: Response): boolean {
  return (
    new URL(response.url()).pathname.replace(/\/$/, '') === viewportPath &&
    !(response.status() >= 300 && response.status() < 400)
  );
}

function isBasemapTile(response: Response): boolean {
  const url = new URL(response.url());
  return (
    url.hostname === 'tiles.openfreemap.org' &&
    /\/\d+\/\d+\/\d+(?:\.(?:pbf|mvt))?$/.test(url.pathname) &&
    response.status() === 200
  );
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`/auth/sign-in/?next=${encodeURIComponent(mapPath)}`);
  // The toggle proves React has hydrated before submitting the real credentials form.
  await page.getByRole('button', { name: 'إظهار كلمة المرور', exact: true }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'إخفاء كلمة المرور', exact: true }).click();
  await page.getByLabel('البريد الإلكتروني').fill('mamluk-map@example.test');
  await page.locator('input[name="password"]').fill('MamlukMapTestOnly42!');
  await page.getByRole('button', { name: 'دخول بالبريد', exact: true }).click();
  await expect(page).toHaveURL(/\/games\/kingdoms\/world-map\/?$/);
  await expect(page.getByRole('heading', { name: 'خريطة العالم', level: 1 })).toBeVisible();
}

function checkPayload(payload: MapPayload, requestUrl: string): void {
  expect(payload.worldId).toBe(fixtureWorld);
  const url = new URL(requestUrl);
  expect(url.searchParams.has('playerId')).toBe(false);
  expect(url.searchParams.has('viewerPlayerId')).toBe(false);
  const span =
    payload.bounds.east >= payload.bounds.west
      ? payload.bounds.east - payload.bounds.west
      : 360 - payload.bounds.west + payload.bounds.east;
  expect(span).toBeLessThanOrEqual(90);
  expect(payload.bounds.north - payload.bounds.south).toBeLessThanOrEqual(90);
  expect(JSON.stringify(payload)).not.toContain('enemy-hidden');
  for (const army of payload.layers.armies.features) {
    if (army.properties.own !== true) {
      expect(Object.keys(army.properties).sort()).toEqual([
        'armyId',
        'own',
        'ownerPlayerId',
        'ownerSultanateId',
        'status',
      ]);
      expect(payload.layers.armyRoutes.features.some((route) => route.id === army.id)).toBe(false);
    }
  }
}

async function showPanel(page: Page, button: string, heading: string): Promise<void> {
  const expand = page.getByRole('button', { name: 'افتح تفاصيل الخريطة', exact: true });
  if (await expand.isVisible()) await expand.click();
  const locations = page.getByRole('region', { name: 'المواقع المتاحة في المشهد' });
  await locations.getByRole('button', { name: button, exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'تفاصيل الخريطة' });
  await expect(panel.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(panel.getByText('خط الطول / خط العرض', { exact: true })).toBeVisible();
  await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBe(0);
}

async function changeViewport(page: Page, action: () => Promise<unknown>): Promise<MapPayload> {
  const response = page.waitForResponse(isViewport);
  await action();
  const result = await response;
  expect(result.status()).toBe(200);
  const payload = parseMapPayload(await result.json());
  checkPayload(payload, result.url());
  await expect(page.getByRole('status').filter({ hasText: 'رؤيتك الحالية' })).toBeVisible();
  return payload;
}

async function checkPanels(page: Page, screenshotPath: string): Promise<void> {
  const canvas = page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).locator('canvas');
  const before = await canvas.boundingBox();
  await showPanel(page, 'القاهرة', 'القاهرة');
  expect((await canvas.boundingBox())?.height).toBe(before?.height);
  await expect(
    page
      .getByRole('complementary', { name: 'تفاصيل الخريطة' })
      .getByText('تحت رايتك', { exact: true }),
  ).toBeVisible();
  await showPanel(page, 'قلعة القاهرة', 'قلعة القاهرة');
  await showPanel(page, 'جيشك', 'جيشك');
  await expect(page.getByText('المسافة', { exact: true })).toBeVisible();
  await showPanel(page, 'جيش مرصود', 'جيش مرصود');
  const panel = page.getByRole('complementary', { name: 'تفاصيل الخريطة' });
  await expect(panel.getByText('المسافة', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('الوصول', { exact: true })).toHaveCount(0);
  await showPanel(page, 'حصار مدينة', 'حصار مدينة');
  await expect(panel.getByText('قائم', { exact: true })).toBeVisible();
  await page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('status').filter({ hasText: 'رؤيتك الحالية' })).toBeVisible();
  await page.screenshot({ path: screenshotPath, fullPage: false });
}

async function freshZoom(page: Page, previous: MapPayload): Promise<MapPayload> {
  const oldSpan = previous.bounds.north - previous.bounds.south;
  const response = page.waitForResponse((candidate) => {
    if (!isViewport(candidate)) return false;
    const query = new URL(candidate.url()).searchParams;
    return Math.abs(Number(query.get('north')) - Number(query.get('south')) - oldSpan) > 0.000001;
  });
  await page.getByRole('button', { name: 'قرّب الخريطة', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  const payload = parseMapPayload(await result.json());
  checkPayload(payload, result.url());
  expect(payload.bounds.north - payload.bounds.south).toBeLessThan(oldSpan);
  await expect(page.getByRole('status').filter({ hasText: 'رؤيتك الحالية' })).toBeVisible();
  return payload;
}

function pointOnFlatCanvas(
  payload: MapPayload,
  coordinates: readonly number[],
  size: { width: number; height: number },
) {
  const [longitude, latitude] = coordinates;
  const bounds = payload.bounds;
  expect(longitude).toBeGreaterThan(bounds.west);
  expect(longitude).toBeLessThan(bounds.east);
  expect(latitude).toBeGreaterThan(bounds.south);
  expect(latitude).toBeLessThan(bounds.north);
  const mercatorY = (degrees: number) =>
    Math.log(Math.tan(Math.PI / 4 + (degrees * Math.PI) / 360));
  return {
    x: ((longitude - bounds.west) / (bounds.east - bounds.west)) * size.width,
    y:
      ((mercatorY(bounds.north) - mercatorY(latitude)) /
        (mercatorY(bounds.north) - mercatorY(bounds.south))) *
      size.height,
  };
}

async function checkMarkerClicks(page: Page, screenshotPath: string): Promise<void> {
  let payload = await changeViewport(page, () =>
    page.getByRole('button', { name: 'خريطة مسطحة', exact: true }).click(),
  );
  payload = await changeViewport(page, () =>
    page.getByRole('button', { name: 'انتقل إلى القاهرة', exact: true }).click(),
  );
  for (let zoom = 0; zoom < 3; zoom += 1) payload = await freshZoom(page, payload);
  const canvas = page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).locator('canvas');
  const size = await canvas.boundingBox();
  if (!size) throw new Error('The live map canvas is unavailable');
  for (const [layer, id, heading] of [
    ['cities', 'cairo', 'القاهرة'],
    ['castles', 'cairo-citadel', 'قلعة القاهرة'],
    ['armies', 'cairo-guard', 'جيشك'],
  ] as const) {
    const collapse = page.getByRole('button', { name: 'اطوِ تفاصيل الخريطة', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    const feature = payload.layers[layer].features.find((entry) => entry.id === id);
    if (feature?.geometry.type !== 'Point')
      throw new Error('The authorized marker is outside this viewport');
    const position = pointOnFlatCanvas(payload, feature.geometry.coordinates, size);
    // Source workers finish asynchronously; every retry remains a real SDK hit-test click.
    await expect(async () => {
      await canvas.click({ position });
      await expect(
        page
          .getByRole('complementary', { name: 'تفاصيل الخريطة' })
          .getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000, intervals: [200, 400, 800] });
  }
  await page.screenshot({ path: screenshotPath, fullPage: false });
}

async function checkGazaMarkerClicks(page: Page): Promise<void> {
  let payload = await changeViewport(page, () =>
    page.getByRole('button', { name: 'انتقل إلى القاهرة', exact: true }).click(),
  );
  const canvas = page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).locator('canvas');
  const collapse = page.getByRole('button', { name: 'اطوِ تفاصيل الخريطة', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  payload = await changeViewport(page, async () => {
    await canvas.focus();
    await canvas.press('ArrowRight');
  });
  const size = await canvas.boundingBox();
  if (!size) throw new Error('The live map canvas is unavailable');
  const enemy = payload.layers.armies.features.find((entry) => entry.id === 'enemy-visible');
  if (enemy?.geometry.type !== 'Point') throw new Error('The approved enemy marker is unavailable');
  const position = pointOnFlatCanvas(payload, enemy.geometry.coordinates, size);
  payload = await changeViewport(page, async () => {
    await page.mouse.move(size.x + position.x, size.y + position.y);
    await page.mouse.down();
    await page.mouse.move(size.x + size.width / 2, size.y + size.height / 2, { steps: 8 });
    await page.mouse.up();
  });
  for (let zoom = 0; zoom < 2; zoom += 1) payload = await freshZoom(page, payload);
  for (const [layer, id, heading] of [
    ['armies', 'enemy-visible', 'جيش مرصود'],
    ['sieges', 'gaza-siege', 'حصار مدينة'],
  ] as const) {
    if (await collapse.isVisible()) await collapse.click();
    const feature = payload.layers[layer].features.find((entry) => entry.id === id);
    if (feature?.geometry.type !== 'Point') throw new Error('The authorized marker is unavailable');
    const position = pointOnFlatCanvas(payload, feature.geometry.coordinates, size);
    await expect(async () => {
      await canvas.click({ position });
      await expect(
        page
          .getByRole('complementary', { name: 'تفاصيل الخريطة' })
          .getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000, intervals: [200, 400, 800] });
  }
}

async function captureOverview(page: Page, screenshotPath: string): Promise<void> {
  const payload = await changeViewport(page, () =>
    page.getByRole('button', { name: 'خريطة مسطحة', exact: true }).click(),
  );
  const canvas = page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).locator('canvas');
  const size = await canvas.boundingBox();
  const army = payload.layers.armies.features.find((entry) => entry.id === 'cairo-guard');
  if (!size || army?.geometry.type !== 'Point') throw new Error('The approved army is unavailable');
  const position = pointOnFlatCanvas(payload, army.geometry.coordinates, size);
  await expect(async () => {
    await canvas.click({ position });
    await expect(
      page
        .getByRole('complementary', { name: 'تفاصيل الخريطة' })
        .getByRole('heading', { name: 'جيشك', exact: true }),
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000, intervals: [200, 400, 800] });
  await page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: screenshotPath, fullPage: false });
}

async function checkNavigation(page: Page): Promise<void> {
  const panel = page.getByRole('complementary', { name: 'تفاصيل الخريطة' });
  await changeViewport(page, () =>
    page.getByRole('button', { name: 'خريطة مسطحة', exact: true }).click(),
  );
  await expect(page.getByRole('button', { name: 'خريطة مسطحة', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const beforeZoom = await changeViewport(page, () =>
    page.getByRole('button', { name: 'أبعد الخريطة', exact: true }).click(),
  );
  const afterZoom = await changeViewport(page, () =>
    page.getByRole('button', { name: 'قرّب الخريطة', exact: true }).click(),
  );
  expect(afterZoom.bounds.north - afterZoom.bounds.south).toBeLessThan(
    beforeZoom.bounds.north - beforeZoom.bounds.south,
  );
  const canvas = page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).locator('canvas');
  await changeViewport(page, async () => {
    await canvas.focus();
    await canvas.press('ArrowRight');
  });
  await expect(panel.getByRole('heading', { name: 'اختر موقعًا على الخريطة' })).toBeVisible();
  await changeViewport(page, () =>
    page.getByRole('button', { name: 'الكرة الأرضية', exact: true }).click(),
  );
  await changeViewport(page, () =>
    page.getByRole('button', { name: 'انتقل إلى القاهرة', exact: true }).click(),
  );
}

async function checkLayout(page: Page, mobile: boolean): Promise<void> {
  const canvas = page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).locator('canvas');
  const panel = page.getByRole('complementary', { name: 'تفاصيل الخريطة' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const mapBounds = await canvas.boundingBox();
  expect(mapBounds?.width).toBeGreaterThan(300);
  expect(mapBounds?.height).toBeGreaterThanOrEqual(390);
  const control = await page
    .getByRole('button', { name: 'قرّب الخريطة', exact: true })
    .boundingBox();
  expect(control?.width).toBeGreaterThanOrEqual(44);
  expect(control?.height).toBeGreaterThanOrEqual(44);
  if (mobile) {
    const expand = page.getByRole('button', { name: 'افتح تفاصيل الخريطة', exact: true });
    if (await expand.isVisible()) await expand.click();
    const sheetBounds = await panel.boundingBox();
    expect(sheetBounds?.y).toBeGreaterThan(mapBounds?.y ?? 0);
    expect(sheetBounds?.y).toBeLessThan((mapBounds?.y ?? 0) + (mapBounds?.height ?? 0));
    expect(sheetBounds?.width).toBeGreaterThan(300);
    await page.getByRole('button', { name: 'اطوِ تفاصيل الخريطة', exact: true }).click();
    const collapsed = await panel.boundingBox();
    expect(collapsed?.height).toBeLessThanOrEqual(100);
    await page.getByRole('button', { name: 'افتح تفاصيل الخريطة', exact: true }).click();
    expect((await panel.boundingBox())?.height).toBeGreaterThan(collapsed?.height ?? 0);
  }
}

function monitorTraffic(
  page: Page,
  validate: (payload: MapPayload, requestUrl: string) => void = checkPayload,
): () => Promise<void> {
  const errors: string[] = [];
  const payloads: Promise<void>[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (!isViewport(response)) return;
    payloads.push(
      (async () => {
        // Panning deliberately cancels in-flight reads; inspect every completed response.
        if (await response.finished()) return;
        expect(response.status()).toBe(200);
        validate(parseMapPayload(await response.json()), response.url());
      })().catch((error) => {
        errors.push(String(error));
      }),
    );
  });
  return async () => {
    await Promise.all(payloads);
    expect(errors).toEqual([]);
  };
}

function checkPublicAtlasPayload(payload: MapPayload, requestUrl: string): void {
  expect(payload.worldId).toBe(publicAtlasWorld);
  const request = new URL(requestUrl);
  expect(request.searchParams.get('worldId')).toBe(publicAtlasWorld);
  expect(request.searchParams.has('playerId')).toBe(false);
  expect(request.searchParams.has('viewerPlayerId')).toBe(false);
  const longitudeSpan =
    payload.bounds.east >= payload.bounds.west
      ? payload.bounds.east - payload.bounds.west
      : 360 - payload.bounds.west + payload.bounds.east;
  expect(longitudeSpan).toBeLessThanOrEqual(90);
  expect(payload.bounds.north - payload.bounds.south).toBeLessThanOrEqual(90);
  expect(payload.layers.cities.features.length).toBeLessThanOrEqual(12);
  for (const city of payload.layers.cities.features) {
    expect(city.geometry.type).toBe('Point');
    expect(city.properties.ownerPlayerId).toBeNull();
    expect(city.properties.ownerSultanateId).toBeNull();
    expect(city.properties.fortificationLevel).toBe(0);
    expect(city.properties.strategicValue).toBe(0);
    if (city.geometry.type !== 'Point') throw new Error('Public city must be a geographic point');
    const [longitude, latitude] = city.geometry.coordinates;
    expect(latitude).toBeGreaterThanOrEqual(payload.bounds.south);
    expect(latitude).toBeLessThanOrEqual(payload.bounds.north);
    expect(
      payload.bounds.west <= payload.bounds.east
        ? longitude >= payload.bounds.west && longitude <= payload.bounds.east
        : longitude >= payload.bounds.west || longitude <= payload.bounds.east,
    ).toBe(true);
  }
  for (const layer of [
    'castles',
    'territories',
    'sultanateBorders',
    'armies',
    'armyRoutes',
    'sieges',
    'fog',
  ] as const) {
    expect(payload.layers[layer].features).toEqual([]);
  }
  expect(JSON.stringify(payload)).not.toMatch(/enemy-hidden|enemy-visible|cairo-guard|gaza-siege/);
}

test('anonymous public atlas renders real landmarks without game intelligence', async ({
  page,
}, testInfo) => {
  const checkTraffic = monitorTraffic(page, checkPublicAtlasPayload);
  const initialResponse = page.waitForResponse(isViewport);
  const tileResponse = page.waitForResponse(isBasemapTile);
  await page.goto(`${mapPath}/`);
  const response = await initialResponse;
  expect(response.status()).toBe(200);
  let payload = parseMapPayload(await response.json());
  checkPublicAtlasPayload(payload, response.url());
  expect((await tileResponse).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'خريطة العالم', level: 1 })).toBeVisible();
  await expect(
    page.getByText('أطلس جغرافي · مدن مصر والشام والحجاز', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('لا توجد حملة متصلة. استكشف مواقع المدن بإحداثياتها الجغرافية.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'العالم', exact: true })).toHaveValue(
    publicAtlasWorld,
  );
  await expect(page.getByRole('status').filter({ hasText: 'مدن الأطلس الجغرافي' })).toBeVisible();
  await expect(page.getByText('رؤيتك الحالية', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('تُعرض المواقع التي تسمح بها رؤيتك الحالية.', { exact: true }),
  ).toHaveCount(0);
  for (const label of ['الجيوش', 'الحصار', 'القلاع']) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  const cairo = payload.layers.cities.features.find((city) => city.id === 'cairo');
  expect(cairo?.geometry).toEqual({ type: 'Point', coordinates: [31.24967, 30.06263] });

  async function changePublicViewport(
    action: () => Promise<unknown>,
    expectedBoundsChange?: (request: URLSearchParams) => boolean,
  ): Promise<MapPayload> {
    const responsePromise = page.waitForResponse(
      (candidate) =>
        isViewport(candidate) &&
        (!expectedBoundsChange || expectedBoundsChange(new URL(candidate.url()).searchParams)),
    );
    await action();
    const result = await responsePromise;
    expect(result.status()).toBe(200);
    const next = parseMapPayload(await result.json());
    checkPublicAtlasPayload(next, result.url());
    await expect(page.getByRole('status').filter({ hasText: 'مدن الأطلس الجغرافي' })).toBeVisible();
    return next;
  }
  payload = await changePublicViewport(() =>
    page.getByRole('button', { name: 'خريطة مسطحة', exact: true }).click(),
  );
  await expect(page.getByRole('button', { name: 'خريطة مسطحة', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  payload = await changePublicViewport(() =>
    page.getByRole('button', { name: 'انتقل إلى القاهرة', exact: true }).click(),
  );
  for (let zoom = 0; zoom < 3; zoom += 1) {
    const previousSpan = payload.bounds.north - payload.bounds.south;
    payload = await changePublicViewport(
      () => page.getByRole('button', { name: 'قرّب الخريطة', exact: true }).click(),
      (query) =>
        Math.abs(Number(query.get('north')) - Number(query.get('south')) - previousSpan) > 0.000001,
    );
    expect(payload.bounds.north - payload.bounds.south).toBeLessThan(previousSpan);
  }
  const canvas = page.getByRole('region', { name: 'الخريطة الجغرافية' }).locator('canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('The public geographic map canvas is unavailable');
  const cairoMarker = payload.layers.cities.features.find((city) => city.id === 'cairo');
  if (cairoMarker?.geometry.type !== 'Point')
    throw new Error('Cairo must be in the public viewport');
  const position = pointOnFlatCanvas(payload, cairoMarker.geometry.coordinates, bounds);
  const panel = page.getByRole('complementary', { name: 'تفاصيل الخريطة' });
  await expect(async () => {
    await canvas.click({ position });
    await expect(panel.getByRole('heading', { name: 'القاهرة', exact: true })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 10_000, intervals: [200, 400, 800] });
  await expect(panel.getByText('31.2497 / 30.0626', { exact: true })).toBeVisible();
  for (const label of [
    'الملكية',
    'التحصين',
    'القيمة الاستراتيجية',
    'الحالة',
    'المسافة',
    'الوصول',
  ]) {
    await expect(panel.getByText(label, { exact: true })).toHaveCount(0);
  }
  await page.screenshot({
    path: testInfo.outputPath('mamluk-public-atlas-cairo.png'),
    fullPage: false,
  });
  const collapse = page.getByRole('button', { name: 'اطوِ تفاصيل الخريطة', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  const beforePan = payload.bounds;
  payload = await changePublicViewport(
    async () => {
      await canvas.focus();
      await canvas.press('ArrowRight');
    },
    (query) => Math.abs(Number(query.get('west')) - beforePan.west) > 0.000001,
  );
  expect(payload.bounds.west).not.toBe(beforePan.west);
  await expect(panel.getByRole('heading', { name: 'القاهرة', exact: true })).toHaveCount(0);
  const beforeZoomOut = payload.bounds.north - payload.bounds.south;
  payload = await changePublicViewport(
    () => page.getByRole('button', { name: 'أبعد الخريطة', exact: true }).click(),
    (query) =>
      Math.abs(Number(query.get('north')) - Number(query.get('south')) - beforeZoomOut) > 0.000001,
  );
  expect(payload.bounds.north - payload.bounds.south).toBeGreaterThan(beforeZoomOut);
  await changePublicViewport(() =>
    page.getByRole('button', { name: 'الكرة الأرضية', exact: true }).click(),
  );
  await expect(page.getByRole('button', { name: 'الكرة الأرضية', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await changePublicViewport(() =>
    page.getByRole('button', { name: 'انتقل إلى القاهرة', exact: true }).click(),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  // A public atlas request never permits anonymous access to a persisted game world.
  const privateResponse = await page.request.get(
    `${viewportPath}/?worldId=${fixtureWorld}&west=28&south=25&east=40&north=36`,
  );
  expect(privateResponse.status()).toBe(401);
  await canvas.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('mamluk-public-atlas-overview.png'),
    fullPage: false,
  });
  await checkTraffic();
});

test('real globe, authorized panels and bounded loading work on desktop and mobile', async ({
  page,
}, testInfo) => {
  const checkTraffic = monitorTraffic(page);
  const initialResponse = page.waitForResponse(isViewport);
  const basemapTile = page.waitForResponse(isBasemapTile);
  await signIn(page);
  const response = await initialResponse;
  expect(response.status()).toBe(200);
  const initial = parseMapPayload(await response.json());
  checkPayload(initial, response.url());
  expect((await basemapTile).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'رؤيتك الحالية' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'الكرة الأرضية', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('combobox', { name: 'العالم', exact: true })).toHaveValue(
    fixtureWorld,
  );
  expect(initial.layers.cities.features.some((feature) => feature.id === 'cairo')).toBe(true);
  expect(initial.layers.castles.features.some((feature) => feature.id === 'cairo-citadel')).toBe(
    true,
  );
  expect(initial.layers.armies.features.map((feature) => feature.id)).toEqual(
    expect.arrayContaining(['cairo-guard', 'enemy-visible']),
  );
  expect(initial.layers.sieges.features.some((feature) => feature.id === 'gaza-siege')).toBe(true);
  for (const layer of [
    'territories',
    'sultanateBorders',
    'armyRoutes',
    'visibility',
    'fog',
  ] as const) {
    expect(initial.layers[layer].features.length).toBeGreaterThan(0);
  }

  await captureOverview(page, testInfo.outputPath('mamluk-map-ready.png'));
  await checkPanels(page, testInfo.outputPath('mamluk-map-authorized-panels.png'));
  await checkNavigation(page);
  await checkMarkerClicks(page, testInfo.outputPath('mamluk-map-marker-click.png'));
  await checkGazaMarkerClicks(page);
  await changeViewport(page, () =>
    page.getByRole('button', { name: 'انتقل إلى القاهرة', exact: true }).click(),
  );
  await changeViewport(page, () =>
    page.getByRole('button', { name: 'الكرة الأرضية', exact: true }).click(),
  );
  await checkLayout(page, testInfo.project.name === 'mamluk-mobile');
  if (testInfo.project.name === 'mamluk-mobile') {
    await page.getByRole('button', { name: 'اطوِ تفاصيل الخريطة', exact: true }).click();
  }
  await page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('status').filter({ hasText: 'رؤيتك الحالية' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mamluk-map-final.png'), fullPage: false });
  await expect(page.getByRole('alert').filter({ hasText: 'تعذر تحديث الخريطة' })).toHaveCount(0);
  await checkTraffic();
});

test('a village world-map entry opens its real geographic village and returns to village management', async ({
  page,
}, testInfo) => {
  const db = createPrismaClient(process.env.KINGDOMS_TEST_DATABASE_URL!);
  const worldId = `map_village_e2e_${randomUUID()}`;
  try {
    const player = await db.user.findUniqueOrThrow({
      where: { email: 'mamluk-map@example.test' },
      select: { id: true },
    });
    const now = Date.now();
    const state = executeCommand(
      createWorld(now),
      player.id,
      { type: 'found', name: 'الحاكم' },
      now,
    );
    const village = Object.values(state.villages)[0];
    await db.kingdomWorld.create({
      data: {
        id: worldId,
        name: 'عالم القرى الجغرافية',
        // Keep the existing explicit campaign as the default for the other browser checks.
        createdAt: new Date('2000-01-01T00:00:00Z'),
        state: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue,
      },
    });
    await signIn(page);
    await page.goto(`/games/kingdoms/?worldId=${worldId}&villageId=${village.id}&tab=village`);
    await expect(page.getByRole('combobox', { name: 'العالم والموسم', exact: true })).toHaveValue(
      worldId,
    );
    const navigation = page.getByRole('navigation', { name: 'إدارة المملكة', exact: true });
    const mapLink = navigation.getByRole('link', { name: 'خريطة العالم', exact: true });
    await expect(mapLink).toHaveAttribute(
      'href',
      `/games/kingdoms/world-map/?worldId=${worldId}&villageId=${village.id}`,
    );
    const viewport = page.waitForResponse(
      (response) =>
        isViewport(response) && new URL(response.url()).searchParams.get('worldId') === worldId,
    );
    const tile = page.waitForResponse(isBasemapTile);
    await mapLink.click();
    await expect(page).toHaveURL(new RegExp(`/games/kingdoms/world-map/?.*worldId=${worldId}`));
    const checkTraffic = monitorTraffic(page, (payload) => {
      expect(payload.worldId).toBe(worldId);
      expect(JSON.stringify(payload)).not.toMatch(
        /"(?:troops|resources|reinforcements|reports|loot)"/,
      );
      expect(payload.layers.armies.features).toEqual([]);
    });
    const response = await viewport;
    expect(response.status()).toBe(200);
    const payload = parseMapPayload(await response.json());
    const marker = payload.layers.cities.features.find((feature) => feature.id === village.id);
    expect(marker?.geometry.type).toBe('Point');
    expect(marker?.properties.name).toBe('عاصمة الحاكم');
    if (marker?.geometry.type !== 'Point')
      throw new Error('Actual village marker was not projected');
    expect(marker.geometry.coordinates[0]).toBeGreaterThan(28);
    expect(marker.geometry.coordinates[0]).toBeLessThan(41);
    expect(marker.geometry.coordinates[1]).toBeGreaterThan(20);
    expect(marker.geometry.coordinates[1]).toBeLessThan(38);
    expect(marker.geometry.coordinates).not.toEqual([village.x, village.y]);
    expect(marker.geometry.coordinates).toEqual([31.24967, 30.06263]);
    expect(payload.layers.fog.features.length).toBeGreaterThan(0);
    expect((await tile).status()).toBe(200);
    await expect(page.getByRole('status').filter({ hasText: 'رؤيتك الحالية' })).toBeVisible();
    await showPanel(page, 'عاصمة الحاكم', 'عاصمة الحاكم');
    const panel = page.getByRole('complementary', { name: 'تفاصيل الخريطة', exact: true });
    await expect(panel.getByText('تحت رايتك', { exact: true })).toBeVisible();
    const manageVillage = panel.getByRole('link', { name: 'إدارة القرية', exact: true });
    await expect(manageVillage).toHaveAttribute(
      'href',
      `/games/kingdoms/?worldId=${worldId}&villageId=${village.id}&tab=village`,
    );
    const canvas = page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).locator('canvas');
    const flatViewport = page.waitForResponse(
      (candidate) =>
        isViewport(candidate) && new URL(candidate.url()).searchParams.get('worldId') === worldId,
    );
    await page.getByRole('button', { name: 'خريطة مسطحة', exact: true }).click();
    const flatPayload = parseMapPayload(await (await flatViewport).json());
    await expect(page.getByRole('status').filter({ hasText: 'رؤيتك الحالية' })).toBeVisible();
    const size = await canvas.boundingBox();
    if (!size) throw new Error('The actual village map canvas is unavailable');
    const position = pointOnFlatCanvas(flatPayload, marker.geometry.coordinates, size);
    const collapse = page.getByRole('button', { name: 'اطوِ تفاصيل الخريطة', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    await expect(async () => {
      await canvas.click({ position });
      await expect(panel.getByRole('heading', { name: 'عاصمة الحاكم', exact: true })).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 10_000, intervals: [200, 400, 800] });
    await canvas.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('actual-village-geographic-map.png'),
      fullPage: false,
    });
    await checkTraffic();
    await manageVillage.click();
    await expect(page.getByRole('combobox', { name: 'العالم والموسم', exact: true })).toHaveValue(
      worldId,
    );
    await expect(navigation.getByRole('button', { name: 'القرية', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } finally {
    await db.kingdomWorld.deleteMany({ where: { id: worldId } });
    await db.$disconnect();
  }
});

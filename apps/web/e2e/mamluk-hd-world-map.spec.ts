import { expect, test, type Page, type TestInfo } from '@playwright/test';
const campaign = 'mamluk-hd-villages-local';
const villages = 'mamluk-hd-villages-local';
const viewportPath = '/api/kingdoms/world-map/viewport';
test.skip(process.env.RUN_MAMLUK_MAP_E2E !== '1', 'Requires isolated local fixtures.');
test.beforeAll(async ({ baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:3000') throw Error('Local fixture only');
});
function monitorMapResources(page: Page) {
  const failures: string[] = [];
  const relevant = (address: string) =>
    /tiles\.openfreemap\.org|elevation-tiles-prod\.s3\.amazonaws\.com|\/maplibre\/|\/api\/kingdoms\/world-map\//.test(
      address,
    );
  page.on('response', (response) => {
    if (relevant(response.url()) && response.status() >= 400)
      failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? '';
    if (relevant(request.url()) && !failure.includes('ERR_ABORTED'))
      failures.push(`${failure} ${new URL(request.url()).pathname}`);
  });
  page.on('console', (message) => {
    // This isolated fixture has no realtime service; viewport polling is verified below.
    if (
      message.type() === 'error' &&
      /Content Security Policy|Refused to|CSP/i.test(message.text()) &&
      !message.text().includes('ws://localhost:3001/socket.io/')
    )
      failures.push(message.text());
  });
  return failures;
}
async function ready(page: Page) {
  await expect(page.locator('.maplibregl-canvas')).toHaveAttribute('data-map-ready', 'true', {
    timeout: 60000,
  });
}
async function capture(page: Page, info: TestInfo, name: string) {
  await ready(page);
  await page.getByRole('region', { name: 'الخريطة الاستراتيجية' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
}
async function signIn(page: Page, world: string, local = false) {
  await page.goto(
    `/auth/sign-in/?next=${encodeURIComponent(`/games/kingdoms/world-map/?worldId=${world}${local ? '&villageId=hd-village-0' : ''}`)}`,
  );
  await page.getByRole('button', { name: 'إظهار كلمة المرور', exact: true }).click();
  await page.getByLabel('البريد الإلكتروني').fill('mamluk-map@example.test');
  await page.locator('input[name="password"]').fill('MamlukMapTestOnly42!');
  await page.getByRole('button', { name: 'دخول بالبريد', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'خريطة العالم', level: 1 })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByRole('combobox', { name: 'العالم', exact: true })).toHaveValue(world);
  await ready(page);
}
async function click(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  const options = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: /^عرض الخريطة$/ }) });
  if (!(await button.isVisible())) await options.locator('summary').click();
  await button.click();
  await ready(page);
  if (await options.evaluate((element) => element.hasAttribute('open')))
    await options.locator('summary').click();
}
async function markCanvas(page: Page) {
  await page
    .locator('.maplibregl-canvas')
    .evaluate((canvas) => canvas.setAttribute('data-verification-instance', 'original'));
}
async function stableCanvas(page: Page) {
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await expect(page.locator('.maplibregl-canvas')).toHaveAttribute(
    'data-verification-instance',
    'original',
  );
}
async function layout(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    })),
  ).toEqual(await page.evaluate(() => ({ width: window.innerWidth, viewport: window.innerWidth })));
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
  const button = await page
    .getByRole('button', { name: 'قرّب الخريطة', exact: true })
    .boundingBox();
  expect(button?.width).toBeGreaterThanOrEqual(44);
  expect(button?.height).toBeGreaterThanOrEqual(44);
}

test('world to territory uses one canvas with Arabic controls and progressive detail', async ({
  page,
}, info) => {
  const resourceFailures = monitorMapResources(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const overview = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.replace(/\/$/, '') === '/api/kingdoms/world-map/overview' &&
      response.status() === 200,
    { timeout: 30000 },
  );
  await signIn(page, campaign);
  const overviewResponse = await overview;
  const overviewPayload = await overviewResponse.json();
  expect(JSON.stringify(overviewPayload)).not.toContain('enemy-hidden');
  await info.attach('overview-response-metrics', {
    body: JSON.stringify({
      bytes: Buffer.byteLength(JSON.stringify(overviewPayload)),
      detail: 'overview',
      requestDurationMs: overviewResponse.request().timing().responseEnd,
    }),
    contentType: 'application/json',
  });
  await markCanvas(page);
  await layout(page);
  await capture(page, info, '01-full-world');
  await click(page, 'انتقل إلى قريتك');
  await click(page, 'أبعد الخريطة');
  await click(page, 'أبعد الخريطة');
  await capture(page, info, '02-middle-east');
  await click(page, 'انتقل إلى قريتك');
  for (let step = 0; step < 4; step += 1) await click(page, 'قرّب الخريطة');
  await capture(page, info, '03-kingdom-territory');
  await stableCanvas(page);
  await click(page, 'خريطة مسطحة');
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.focus();
  await canvas.press('ArrowRight');
  await ready(page);
  await stableCanvas(page);
  await click(page, 'عرض الكرة بالكامل');
  await stableCanvas(page);
  await page.getByRole('button', { name: 'الطبقات', exact: true }).click();
  const villagesLayer = page.getByRole('checkbox', { name: 'القرى والمدن', exact: true });
  await villagesLayer.uncheck();
  await expect(villagesLayer).not.toBeChecked();
  await stableCanvas(page);
  await villagesLayer.check();
  await page.getByRole('button', { name: 'الطبقات', exact: true }).click();
  await click(page, 'اضبط اتجاه الشمال');
  await stableCanvas(page);
  expect(errors).toEqual([]);
  expect(resourceFailures).toEqual([]);
});

test('local villages preserve canvas, disclose actual metadata and provide mobile selection sheet', async ({
  page,
}, info) => {
  const resourceFailures = monitorMapResources(page);
  await signIn(page, villages, true);
  const closeInitialSelection = page.getByRole('button', {
    name: 'أغلق تفاصيل الموقع',
    exact: true,
  });
  if (await closeInitialSelection.isVisible()) await closeInitialSelection.click();
  await markCanvas(page);
  await layout(page);
  await click(page, 'انتقل إلى قريتك');
  for (let step = 0; step < 4; step += 1) await click(page, 'قرّب الخريطة');
  await capture(page, info, '04-local-villages');
  // Home centers the authorized capital; exercise the SDK's actual hit-test, including mobile tap.
  const canvas = page.locator('.maplibregl-canvas');
  const panel = page.getByRole('complementary', { name: 'تفاصيل الخريطة' });
  await expect(async () => {
    await canvas.click();
    await expect(panel.getByRole('heading', { name: 'حاضرة القاهرة', exact: true })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 10000, intervals: [200, 500, 1000] });
  await expect(panel.getByText('غير متوفر', { exact: true }).first()).toBeVisible();
  await expect(panel.locator('dd').filter({ hasText: /^٥٠$/ })).toBeVisible();
  await expect(panel.locator('dd').filter({ hasText: /^حاضرة مملوكية$/ })).toBeVisible();
  await capture(page, info, '05-selected-village-popup');
  await stableCanvas(page);
  if (info.project.name === 'hd-mobile') {
    const box = await panel.boundingBox(),
      map = await page.locator('.maplibregl-canvas').boundingBox();
    expect(box?.y).toBeGreaterThan(map?.y ?? 0);
  }
  await page.getByRole('button', { name: 'أغلق تفاصيل الموقع', exact: true }).click();
  await stableCanvas(page);
  const poll = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.replace(/\/$/, '') === viewportPath &&
      response.status() === 200,
    { timeout: 45000 },
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await poll;
  await ready(page);
  await stableCanvas(page);
  expect(resourceFailures).toEqual([]);
});

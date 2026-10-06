import { expect, test as base, type Page } from '@playwright/test';

type CaptureScene = 'overview' | 'palace' | 'barracks' | 'stable';

const test = base.extend<{ diagnostics: void }>({
  diagnostics: [
    async ({ page }, use, testInfo) => {
      const consoleLog: string[] = [];
      const networkLog: string[] = [];
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
  await expect(stage).toHaveAttribute('data-city-composition', /^(desktop|portrait)$/);
  await expect(stage).toHaveAttribute('data-pixi-ready', 'true', { timeout: 30000 });
  await expect(stage).toHaveAttribute('aria-busy', 'false');
  await expect(stage).toHaveAttribute('data-camera-state', 'CITY_OVERVIEW');
  await stage.locator('picture img').evaluate((image: HTMLImageElement) => image.decode());
  const source = await stage
    .locator('picture img')
    .evaluate((image: HTMLImageElement) => image.currentSrc);
  expect(source).toContain('/game-art/kingdoms/city-hub/overview-');
  expect(source).not.toContain('mamluk-capital');
  await page.evaluate(() => document.fonts.ready);
  return stage;
}

export async function readyFacility(page: Page, scene: Exclude<CaptureScene, 'overview'>) {
  const active = page.locator(`[data-city-scene="${scene}"]`);
  const sheet = active.locator('[data-village-building-sheet]');
  await expect(sheet.locator('h3')).toBeVisible({ timeout: 30000 });
  // Artwork readiness precedes the lazy facility content and its CSS modules.
  await expect
    .poll(
      () =>
        sheet.evaluate((element) => {
          const style = getComputedStyle(element);
          const header = element.querySelector(':scope > header');
          return {
            lineHeight: Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize),
            headerDisplay: header && getComputedStyle(header).display,
          };
        }),
      { timeout: 30000 },
    )
    .toEqual({ lineHeight: 1.75, headerDisplay: 'flex' });
  if (scene !== 'palace') {
    const training =
      scene === 'stable'
        ? sheet
        : active.getByRole('region', { name: 'تجنيد الثكنة', exact: true });
    await expect(training.getByRole('spinbutton').first()).toBeVisible({ timeout: 30000 });
    await expect
      .poll(
        () =>
          training.locator('form').first().evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              display: style.display,
              gap: style.rowGap,
              width: element.getBoundingClientRect().width > 0,
            };
          }),
        { timeout: 30000 },
      )
      .toEqual({ display: 'grid', gap: '8px', width: true });
  }
  await page.evaluate(() => document.fonts.ready);
}

export async function livingCityScreenshotMasks(page: Page, scene: CaptureScene) {
  const masks = [
    page.getByRole('region', { name: 'موارد القرية', exact: true }).locator('[data-resource] strong'),
    page.getByRole('region', { name: 'موارد المشهد', exact: true }),
  ];
  if (scene !== 'stable' || page.viewportSize()?.width !== 1920) return masks;
  expect(page.viewportSize()).toEqual({ width: 1920, height: 1080 });
  const active = page.locator('[data-city-scene="stable"]');
  const form = active.locator('[data-village-building-sheet] > form');
  const formBounds = await form.boundingBox();
  const contentBounds = await form.evaluate((element) => {
    const content = element.parentElement?.parentElement;
    if (!content || content.parentElement?.dataset.cityScene !== 'stable') return null;
    const bounds = content.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, bottom: bounds.bottom };
  });
  expect(formBounds).not.toBeNull();
  expect(contentBounds).not.toBeNull();
  expect(formBounds!.x).toBe(1552);
  expect(formBounds!.width).toBe(336);
  const windowsReference = process.platform === 'win32';
  expect(formBounds!.y).toBe(windowsReference ? 470.6875 : 468.3125);
  expect(contentBounds).toEqual({
    x: 1520,
    y: 111.359375,
    width: 384,
    bottom: 1064,
  });
  const top = Math.floor(formBounds!.y);
  // Apply this identical exception to canonical 0ed6ed6 captures, never repaired references.
  await active.evaluate(
    (element, bounds) => {
      const mask = document.createElement('div');
      mask.dataset.livingCityTrainingMask = '';
      mask.setAttribute('aria-hidden', 'true');
      Object.assign(mask.style, {
        position: 'fixed',
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        pointerEvents: 'none',
      });
      element.append(mask);
    },
    { x: formBounds!.x, y: top, width: formBounds!.width, height: contentBounds!.bottom - top },
  );
  return [...masks, active.locator('[data-living-city-training-mask]')];
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/__village_test/reset')).ok()).toBe(true);
});

test('Living City identity excludes the retired village scene', async ({ page }) => {
  await page.goto('/');
  const stage = await readyCity(page);
  expect(
    Number(await stage.locator('canvas').getAttribute('data-city-interactions')),
  ).toBeGreaterThanOrEqual(18);
});

for (const scene of ['overview', 'palace', 'barracks', 'stable'] as const) {
  test(`canonical Living City ${scene}`, async ({ page, request }, testInfo) => {
    expect((await request.post('/__village_test/city-scenario')).ok()).toBe(true);
    await page.goto('/');
    const stage = await readyCity(page);
    if (scene !== 'overview') {
      const name =
        scene === 'palace' ? /^دار الحكم،/ : scene === 'barracks' ? /^الثكنة،/ : /^الإسطبل،/;
      const hotspot = stage.getByRole('button', { name });
      const bounds = await hotspot.boundingBox();
      expect(bounds).not.toBeNull();
      const point = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
      expect(
        await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point),
      ).toBe('CANVAS');
      if (testInfo.project.use.hasTouch) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      const active = page.locator(`[data-city-scene="${scene}"]`);
      await expect(active).toHaveAttribute('data-phase', 'active');
      await expect(stage).toHaveAttribute('data-camera-state', 'BUILDING_SCENE');
      await active.locator('picture img').evaluate((image: HTMLImageElement) => image.decode());
      await expect
        .poll(() =>
          active.locator('picture img').evaluate((image) => getComputedStyle(image).opacity),
        )
        .toBe('1');
      expect(
        await active.locator('picture img').evaluate((image: HTMLImageElement) => image.currentSrc),
      ).toContain(`/city-scenes/${scene}`);
      await readyFacility(page, scene);
    }
    await page.mouse.click(0, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page).toHaveScreenshot(`${scene}.png`, {
      mask: await livingCityScreenshotMasks(page, scene),
    });
    if (scene !== 'overview') {
      await page.getByRole('button', { name: 'العودة إلى المدينة', exact: true }).click();
      await expect(page.locator('[data-city-scene]')).toHaveCount(0);
      await expect(stage).toHaveAttribute('data-camera-state', 'CITY_OVERVIEW');
    }
  });
}

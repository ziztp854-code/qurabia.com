import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const runtime = (page: Page) => page.locator('html');
test.use({ trace: 'retain-on-failure' });

test('Arabic content, decorations and click targets stay usable', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(runtime(page)).toHaveAttribute('data-scroll-runtime', 'active');
  await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '1');
  await expect(runtime(page)).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'تحدي' })).toBeVisible();
  await expect(page.locator('[data-react-bits="Noise"]')).toHaveCount(1);
  const cta = page.getByRole('link', { name: 'ابدأ اللعب الآن' });
  await cta.hover();
  expect(
    await cta.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit === element || element.contains(hit);
    }),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`home-${testInfo.project.name}.png`) });
  await cta.click();
  await expect(page).toHaveURL(/\/games\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'ساحة الألعاب' })).toBeVisible();
  await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '1');
  await page.screenshot({ path: testInfo.outputPath(`games-${testInfo.project.name}.png`) });
  const chunks = readdirSync('.next/static/chunks').filter((name) => name.endsWith('.js'));
  const deferredAssets = chunks.flatMap((name) => {
    const content = readFileSync(`.next/static/chunks/${name}`);
    return content.includes('autoRaf') || content.includes('"Noise"')
      ? [{ name, bytes: content.length, gzipBytes: gzipSync(content).length }]
      : [];
  });
  await testInfo.attach('motion-assets', {
    body: JSON.stringify({ browser: 'cloud Chromium', deferredAssets }, null, 2),
    contentType: 'application/json',
  });
  expect(errors).toEqual([]);
});

test('hidden pages and the mobile filter drawer suspend motion', async ({ page }) => {
  await page.goto('/games');
  await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '1');
  // Headless tabs do not expose a foreground UI; exercise the same visibility event.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '0');
  await expect(page.locator('[data-react-bits="GradientText"]')).toHaveAttribute(
    'data-motion-active',
    'false',
  );
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '1');
  const trigger = page.getByRole('button', { name: 'فتح لوحة الفلاتر' });
  if (await trigger.isVisible()) {
    await trigger.click();
    await expect(page.locator('.gc-filters-panel')).toHaveAttribute('data-open', 'true');
    await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '0');
    await page.keyboard.press('Escape');
    await expect(page.locator('.gc-filters-panel')).toHaveAttribute('data-open', 'false');
    await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '1');
    await expect(trigger).toBeFocused();
  }
});

test('wheel, touch and keyboard preserve natural scroll and independent panels', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('/');
  await expect(runtime(page)).toHaveAttribute('data-scroll-runtime', 'active');
  if (testInfo.project.name === 'mobile') {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 200, y: 650 }],
    });
    for (const y of [600, 520, 440, 350, 250]) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 200, y }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(60, 600);
    await page.mouse.wheel(0, 550);
  }
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  const previous = await page.evaluate(() => scrollY);
  await page.keyboard.press('PageDown');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(previous + 100);
  await page.keyboard.press('Home');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(5);
  await page.evaluate(() => {
    const panel = document.createElement('div');
    panel.id = 'motion-native-panel';
    panel.setAttribute('data-lenis-prevent', '');
    panel.style.cssText =
      'position:fixed;top:200px;left:20px;width:160px;height:120px;overflow-y:auto;z-index:9999;background:var(--surface)';
    const child = document.createElement('div');
    child.style.height = '1200px';
    child.textContent = 'لوحة مستقلة';
    panel.append(child);
    document.body.append(panel);
  });
  await page.mouse.move(70, 250);
  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => page.locator('#motion-native-panel').evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
  expect(await page.evaluate(() => scrollY)).toBeLessThan(5);
  await page.locator('#motion-native-panel').evaluate((element) => element.remove());
});

test('anchors, route changes and browser back do not multiply the runtime', async ({ page }) => {
  await page.goto('/games');
  await expect(runtime(page)).toHaveAttribute('data-scroll-runtime', 'active');
  await page.locator('a[href="#gc-results"]').click();
  await expect(page).toHaveURL(/#gc-results$/);
  await expect
    .poll(() =>
      page
        .locator('#gc-results')
        .evaluate((element) => Math.abs(element.getBoundingClientRect().top)),
    )
    .toBeLessThan(160);
  const position = await page.evaluate(() => scrollY);
  await page
    .getByRole('link', { name: 'انضم برمز', exact: true })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page).toHaveURL(/\/join\/?$/);
  await expect(
    page.getByRole('heading', { name: 'انضم كزائر إلى المسابقة', level: 1 }),
  ).toBeVisible();
  await expect(runtime(page)).not.toHaveAttribute('data-scroll-runtime', 'active');
  expect((await runtime(page).getAttribute('class')) ?? '').not.toContain('lenis');
  await page.goBack();
  await expect(page).toHaveURL(/\/games\/?#gc-results$/);
  await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '1');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(position - 100);
  for (let i = 0; i < 3; i++) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(runtime(page)).not.toHaveAttribute('data-scroll-runtime', 'active');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '1');
  }
});

test('late catalogue artwork preserves the catalogue anchor position', async ({
  page,
}, testInfo) => {
  let releaseArtwork!: () => void;
  let delayedRequests = 0;
  const artworkGate = new Promise<void>((resolve) => {
    releaseArtwork = resolve;
  });
  page.once('close', releaseArtwork);
  await page.route((url) => {
    const source = url.pathname === '/_next/image' ? url.searchParams.get('url') : url.pathname;
    return source?.startsWith('/game-art/catalog-v2/') ?? false;
  }, async (route) => {
    delayedRequests += 1;
    await artworkGate;
    await route.continue();
  });
  await page.goto('/games', { waitUntil: 'domcontentloaded' });
  await expect(runtime(page)).toHaveAttribute('data-scroll-runtime', 'active');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('a[href="#gc-results"]').click();
  await expect(page).toHaveURL(/#gc-results$/);
  const geometry = () =>
    page.evaluate(() => ({
      top: document.getElementById('gc-results')!.getBoundingClientRect().top,
      scroll: scrollY,
      artworkHeight: document.querySelector('.gc-card-visual')!.getBoundingClientRect().height,
    }));
  await expect.poll(async () => Math.abs((await geometry()).top)).toBeLessThan(160);
  const before = await geometry();
  expect(before.artworkHeight).toBeGreaterThan(0);
  await expect.poll(() => delayedRequests).toBeGreaterThan(0);
  releaseArtwork();
  await page.locator('.gc-card-cover').first().evaluate((image: HTMLImageElement) => image.decode());
  const after = await geometry();
  await testInfo.attach('late-artwork-anchor', {
    body: JSON.stringify({ before, after }, null, 2),
    contentType: 'application/json',
  });
  expect(Math.abs(after.artworkHeight - before.artworkHeight)).toBeLessThan(1);
  await expect.poll(async () => Math.abs((await geometry()).top)).toBeLessThan(160);
  expect(await page.locator('.gc-card-cover').first().evaluate((image: HTMLImageElement) =>
    image.complete && image.naturalWidth > 0,
  )).toBe(true);
});

test('a same-turn catalogue update preserves a native anchor jump', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'mobile') await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/games');
  await expect(runtime(page)).toHaveAttribute('data-scroll-runtime', 'active');
  await expect(page.locator('a[href="#gc-results"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250); // Let initial scroll-cache setup finish before the same-turn update.
  await page.evaluate(() => {
    const results = document.getElementById('gc-results')!;
    // A filter/lazy-render commit can land before the browser dispatches scroll.
    results.scrollIntoView({ behavior: 'instant' });
    const update = document.createElement('i');
    update.setAttribute('aria-hidden', 'true');
    update.id = 'motion-anchor-update';
    results.append(update);
  });
  await expect
    .poll(() =>
      page
        .locator('#gc-results')
        .evaluate((element) => Math.abs(element.getBoundingClientRect().top)),
    )
    .toBeLessThan(160);
  await page.locator('#motion-anchor-update').evaluate((element) => element.remove());
});

test('dialogs suspend the ticker, scroll internally and resume after closing', async ({ page }) => {
  await page.goto('/games');
  await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '1');
  // Exercise the global modal contract without invoking authentication or game data.
  await page.evaluate(() => {
    const modal = document.createElement('dialog');
    modal.id = 'motion-test-dialog';
    modal.setAttribute('aria-label', 'اختبار النافذة');
    modal.style.cssText = 'height:180px;width:220px;overflow-y:auto';
    const button = document.createElement('button');
    button.textContent = 'إغلاق الاختبار';
    button.onclick = () => {
      modal.close();
      modal.remove();
    };
    const body = document.createElement('div');
    body.style.height = '1200px';
    modal.append(button, body);
    document.body.append(modal);
    modal.showModal();
  });
  await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '0');
  const dialog = page.getByRole('dialog', { name: 'اختبار النافذة' });
  await dialog.hover();
  await page.mouse.wheel(0, 240);
  await expect.poll(() => dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await page.keyboard.press('Escape');
  await expect(runtime(page)).toHaveAttribute('data-scroll-ticker', '1');
  await page.locator('#motion-test-dialog').evaluate((element) => element.remove());
});

test('reduced motion and JavaScript-disabled content remain visible', async ({
  page,
  browser,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'تحدي', level: 1 })).toBeVisible();
  await expect(runtime(page)).not.toHaveAttribute('data-scroll-runtime', 'active');
  expect(
    await page
      .locator('[data-react-bits="GradientText"] span')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await page.screenshot({ path: testInfo.outputPath(`reduced-${testInfo.project.name}.png`) });
  const native = await browser.newContext({
    javaScriptEnabled: false,
    viewport: testInfo.project.use.viewport,
    baseURL: testInfo.project.use.baseURL,
  });
  const fallback = await native.newPage();
  await fallback.goto('/');
  await expect(fallback.getByRole('heading', { name: 'تحدي', level: 1 })).toBeVisible();
  await expect(fallback.getByRole('link', { name: 'ابدأ اللعب الآن' })).toBeVisible();
  await fallback.getByRole('link', { name: 'ابدأ اللعب الآن' }).click();
  await expect(fallback.getByRole('heading', { name: 'ساحة الألعاب', level: 1 })).toBeVisible();
  await native.close();
});

test('public MapLibre route never receives Lenis', async ({ page }) => {
  await page.goto('/games/kingdoms/world-map');
  await expect(page.locator('.maplibregl-map')).toBeVisible({ timeout: 30_000 });
  await expect(runtime(page)).not.toHaveAttribute('data-scroll-runtime', 'active');
  expect((await runtime(page).getAttribute('class')) ?? '').not.toContain('lenis');
  const map = page.locator('.maplibregl-canvas');
  await expect(map).toBeVisible();
  await map.click({ position: { x: 120, y: 120 } });
  await page.mouse.wheel(0, -100);
  await expect(map).toBeVisible();
});

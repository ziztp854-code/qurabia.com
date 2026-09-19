import { expect, test } from '@playwright/test';

test('places the interactive challenge card in the games hero without removing catalog filters', async ({
  page,
}) => {
  await page.route('**/api/presence/heartbeat/**', (route) => route.fulfill({ status: 204 }));
  await page.goto('/games/');

  const hero = page.locator('.gc-hero');
  await expect(hero.getByRole('region', { name: 'عارض بطاقة تحدّي' })).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30_000 },
  );
  await expect(hero.getByLabel('تصفح الألعاب حسب الفئة')).toHaveCount(0);
  await page.getByRole('button', { name: 'فتح لوحة الفلاتر' }).click();
  await expect(page.getByRole('dialog', { name: 'الفلاتر' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'التصنيفات' })).toBeVisible();
});

test('loads and controls the Blender challenge card without overflow', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const httpErrors: string[] = [];
  const modelResponses: number[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (/\/models\/challenge-card(?:\.[a-f0-9]+)?\.glb/.test(response.url()))
      modelResponses.push(response.status());
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  });
  await page.route('**/api/presence/heartbeat/**', (route) => route.fulfill({ status: 204 }));

  await page.goto('/3d/');
  const viewer = page.getByRole('region', { name: 'عارض بطاقة تحدّي' });
  await expect(viewer).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveCount(1);
  let still = await page.locator('canvas').screenshot();
  await expect
    .poll(async () => {
      const next = await page.locator('canvas').screenshot();
      const stable = next.equals(still);
      still = next;
      return stable;
    })
    .toBe(true);
  const playButton = page.getByRole('button', { name: 'تشغيل الحركة' });
  await expect(playButton).toBeEnabled();
  await playButton.click();
  await page.getByRole('button', { name: 'إيقاف مؤقت' }).click();
  await page.getByRole('button', { name: 'تقريب' }).click();
  await expect
    .poll(async () => (await page.locator('canvas').screenshot()).equals(still))
    .toBe(false);
  await page.getByRole('button', { name: 'تبديل الخامة' }).click();

  expect(modelResponses).toContain(200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect({ consoleErrors, httpErrors }).toEqual({ consoleErrors: [], httpErrors: [] });
  await page.screenshot({ path: testInfo.outputPath('challenge-card.png'), fullPage: true });
});

test('shows an actionable fallback when the GLB request fails', async ({ page }) => {
  await page.route('**/models/challenge-card*.glb*', (route) => route.abort('failed'));
  await page.goto('/3d/');
  await expect(page.getByRole('alert').filter({ hasText: 'تعذر تحميل المجسم' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('link', { name: /العودة إلى الرئيسية/ })).toBeVisible();
  await page.unroute('**/models/challenge-card*.glb*');
  await page.getByRole('button', { name: 'إعادة المحاولة' }).click();
  await expect(page.getByRole('region', { name: 'عارض بطاقة تحدّي' })).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30_000 },
  );
  await expect(page.getByRole('button', { name: 'تشغيل الحركة' })).toBeEnabled();
});

test('shows loading until the model arrives and honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/models/challenge-card*.glb*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/3d/');
  const viewer = page.getByRole('region', { name: 'عارض بطاقة تحدّي' });
  await expect(viewer.getByRole('status')).toContainText('تحميل المجسم');
  release();
  await expect(viewer).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'تشغيل الحركة' })).toBeDisabled();
  await page.getByLabel('اسحب لتدوير', { exact: false }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('الحركة التلقائية معطلة وفق تفضيلات جهازك.')).toBeVisible();
});

test('development refreshes a changed publication manifest without page reload', async ({
  page,
  request,
}) => {
  test.skip(process.env.CI === 'true', 'Requires the Next.js development server.');
  const response = await request.get('/models/manifest.json');
  const manifest = await response.json();
  const original = manifest['challenge-card'].src;
  let current = original;
  const changed = '/models/challenge-card.0123456789abcdef.glb';
  await page.route('**/models/manifest.json', (route) =>
    route.fulfill({ json: { ...manifest, 'challenge-card': { src: current } } }),
  );
  await page.route(`**${changed}`, async (route) => {
    const asset = await request.get(original);
    await route.fulfill({ body: await asset.body(), contentType: 'model/gltf-binary' });
  });
  await page.goto('/3d/');
  const viewer = page.getByRole('region', { name: 'عارض بطاقة تحدّي' });
  await expect(viewer).toHaveAttribute('aria-busy', 'false');
  current = changed;
  await expect(viewer).toHaveAttribute('data-model-src', changed, { timeout: 10000 });
  await expect(viewer).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: 'تشغيل الحركة' })).toBeEnabled();
});

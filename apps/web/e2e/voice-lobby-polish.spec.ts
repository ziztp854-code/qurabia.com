// Real discovery components with local synthetic data; no production or audio claims.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { rooms } from './fixtures/tahaddi-surfaces-data';

test('discovery: responsive controls, Arabic text zoom, accessibility and filter recovery', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/voice/rooms{,/}', (route) => route.fulfill({ json: rooms }));
  await page.goto('/');
  await expect(page.locator('.v-room-grid article')).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 430, 1440, 1920]) {
    await page.setViewportSize({ width, height: width > 1000 ? 1080 : 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const link = page
      .getByRole('complementary', { name: 'الغرفة الأكثر نشاطًا' })
      .getByRole('link');
    const bounds = await link.boundingBox();
    expect(bounds!.width).toBeGreaterThan(100);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    const enter = page.locator('.v-enter').first();
    await expect(enter).toBeVisible();
    expect((await enter.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath(`discovery-${width}.png`), fullPage: true });
    const accessibility = await new AxeBuilder({ page })
      .include('.v-app')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const search = page.locator('.v-mobile-search input');
  await search.fill('لا يوجد مجلس بهذا الاسم');
  await expect(page.getByText('لا توجد غرف تطابق بحثك')).toBeVisible();
  await page.getByRole('button', { name: 'مسح البحث والتصنيف' }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.v-room-grid article')).toHaveCount(4);
  await page.getByRole('button', { name: 'فتح القائمة', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'قائمة الغرف الصوتية' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'فتح القائمة', exact: true })).toBeFocused();
  await search.focus();
  await page.keyboard.type(' ');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('.v-room-card')
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe('0s');
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLElement>('.v-app, .v-app *')];
    const sizes = elements.map((e) => parseFloat(getComputedStyle(e).fontSize));
    elements.forEach((e, i) => e.style.setProperty('font-size', `${sizes[i] * 2}px`, 'important'));
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const titles = await page.locator('.v-room-grid article h3').evaluateAll((elements) =>
    elements.map((element) => ({
      clippedX: element.scrollWidth > element.clientWidth + 1,
      clippedY: element.scrollHeight > element.clientHeight + 1,
    })),
  );
  for (const title of titles) {
    expect(title.clippedX, 'room title fits horizontally at 200% Arabic text').toBe(false);
    expect(title.clippedY, 'room title grows to contain wrapped Arabic text at 200%').toBe(false);
  }
  await page.screenshot({ path: info.outputPath('discovery-320-text200.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('discovery: service failure retry and inactive rooms never appear live', async ({ page }) => {
  let failed = true;
  await page.route('**/api/voice/rooms{,/}', (route) =>
    route.fulfill(
      failed
        ? { status: 503, json: { error: 'الخدمة غير متاحة' } }
        : { json: { ...rooms, rooms: rooms.rooms.map((r) => ({ ...r, active: false })) } },
    ),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'تعذر تحميل الغرف' })).toBeVisible();
  await expect(page.getByText('اللقاء يبدأ بحسابك')).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'إعادة المحاولة' }).click();
  await expect(page.locator('.v-room-grid article')).toHaveCount(4);
  await expect(page.getByRole('complementary', { name: 'الغرفة الأكثر نشاطًا' })).toHaveCount(0);
  await expect(page.getByText('مباشر الآن', { exact: true })).toHaveCount(0);
});

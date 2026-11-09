import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1440, 390, 320]) {
  test(`knowledge tower: keyboard start and answer flow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?surface=knowledge-tower');
    const start = page.getByRole('button', { name: 'ابدأ الصعود' });
    await expect(page.getByRole('heading', { name: 'برج المعرفة', exact: true })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(3);
    await start.focus();
    await page.keyboard.press('Enter');
    const answers = page.getByRole('button').filter({ has: page.locator('strong') });
    await expect(answers).toHaveCount(4);
    await expect(page.getByRole('img', { name: 'الأرواح المتبقية: 3' })).toBeVisible();
    await answers.first().click();
    for (const answer of await answers.all()) await expect(answer).toBeDisabled();
    await page.getByRole('button', { name: /الطابق التالي|واصل الصعود/ }).click();
    await expect(answers.first()).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    const audit = await new AxeBuilder({ page })
      .include('section')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
  });
}

test('knowledge tower: intro reflows at 200% text on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/?surface=knowledge-tower');
  await expect(page.getByRole('heading', { name: 'برج المعرفة', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll<HTMLElement>('#root *')].map((element) => ({
      element,
      size: parseFloat(getComputedStyle(element).fontSize),
    }));
    for (const { element, size } of sizes) element.style.fontSize = `${size * 2}px`;
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.getByRole('button', { name: 'ابدأ الصعود' })).toBeEnabled();
});

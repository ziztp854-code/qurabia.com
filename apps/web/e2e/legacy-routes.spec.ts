import { expect, test } from '@playwright/test';
import { LEGACY_SITE_BACK_ENTRY } from '../src/lib/legacy-site-history';

const removedRoutes = ['/demo/waiting', '/demo/question', '/demo/results', '/demo/winners'];

test('تعيد مسارات العرض التجريبي القديمة 404', async ({ request }) => {
  for (const route of removedRoutes) {
    const response = await request.get(route);
    expect(response.status(), `${route} should be removed`).toBe(404);
  }
});

test('the shared back button returns to the preceding Next.js page without Navigation API', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'navigation', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await expect
    .poll(() => page.evaluate((key) => window.history.state?.[key], LEGACY_SITE_BACK_ENTRY))
    .toBe(false);
  const footer = page.locator('footer');
  await footer.getByRole('link', { name: 'الألعاب', exact: true }).click();
  await expect(page).toHaveURL(/\/games\/$/);
  await footer.getByRole('link', { name: 'خريطة العالم', exact: true }).click();
  await expect(page).toHaveURL(/\/games\/kingdoms\/world-map\/$/);
  await expect.poll(() => page.evaluate(() => document.referrer)).toBe('');
  await expect
    .poll(() => page.evaluate((key) => window.history.state?.[key], LEGACY_SITE_BACK_ENTRY))
    .toBe(true);

  await page.getByRole('button', { name: 'رجوع', exact: true }).click();
  await expect(page).toHaveURL(/\/games\/$/);
});

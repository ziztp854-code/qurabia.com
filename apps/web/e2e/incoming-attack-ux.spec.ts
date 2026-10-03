import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/__village_test/incoming-attack')).ok()).toBeTruthy();
});

test('incoming attack is visible in alert, village, and activity without leaking troops', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/games/kingdoms/world-map/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html lang="ar" dir="rtl"><body data-testid="unified-map">الخريطة الموحدة</body></html>',
    });
  });
  await page.goto('/');
  const alert = page.getByRole('alert', { name: 'تحذير عسكري' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('الهجمات القادمة');
  await expect(alert).not.toContainText('حارس');
  await expect(page.getByRole('alert', { name: 'هجوم قادم' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /القوات القادمة/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'نشاط القرية' })).toContainText('هجوم قادم');
  await expect(page.locator('[data-threat]')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('commanderId');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('alert', { name: 'تحذير عسكري' }).getByRole('button', { name: 'عرض على الخريطة' }).click();
  await expect(page).toHaveURL(/\/games\/kingdoms\/world-map\//);
  await expect(page.getByTestId('unified-map')).toBeVisible();
});

import { expect, test } from '@playwright/test';

test('رابط دعوة الغرفة يعرض صورة تحدّي وبيانات المشاركة الصحيحة', async ({ page }) => {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.CI === 'true' ? 'http://127.0.0.1:3000' : 'https://qurabia.com');
  const response = await page.goto('/join/123456/');

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle('انضم إلى غرفة 123456 | تحدّي');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    `${siteUrl}/og.png`,
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    'content',
    `${siteUrl}/og.png`,
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    `${siteUrl}/join/123456/`,
  );
});

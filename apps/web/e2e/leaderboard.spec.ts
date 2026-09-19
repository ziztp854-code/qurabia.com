import { expect, test } from '@playwright/test';

test('تعرض صورة لوحة الشرف وحدها دون تمرير أفقي', async ({ page }, testInfo) => {
  let requests = 0;
  await page.route('**/api/leaderboard', (route) => {
    requests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        players: [
          { id: '1', name: requests === 1 ? 'نورة' : 'ليان', score: 20000, rank: 1 },
          { id: '2', name: 'خالد', score: 18000, rank: 2 },
          { id: '3', name: 'سارة', score: 16000, rank: 3 },
        ],
      }),
    });
  });
  await page.goto('/leaderboard');

  await expect(page.getByRole('heading', { level: 1, name: 'لوحة الشرف' })).toBeAttached();
  const poster = page.getByRole('img', { name: /لوحة الشرف/ });
  await expect(poster).toBeVisible();
  const backButton = page.getByRole('button', { name: 'رجوع' });
  await expect(backButton).toBeVisible();
  const backButtonBox = await backButton.boundingBox();
  expect(backButtonBox?.width).toBeGreaterThanOrEqual(44);
  expect(backButtonBox?.height).toBeGreaterThanOrEqual(44);
  const isMobile = testInfo.project.name === 'mobile';
  await expect(poster).toHaveJSProperty('naturalWidth', isMobile ? 1024 : 1536);
  await expect(poster).toHaveJSProperty('naturalHeight', isMobile ? 1536 : 1024);
  await expect(page.getByRole('listitem', { name: /المركز 1: نورة، 20,000 نقطة/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تحديث الترتيب' })).toHaveCount(0);
  await expect(page.getByText('ليان').first()).toBeVisible({ timeout: 7_000 });

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});

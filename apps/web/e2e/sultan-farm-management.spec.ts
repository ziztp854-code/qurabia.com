import { expect, test } from '@playwright/test';

test('management game opens inside Sultan farm, harvests, saves and returns on desktop and mobile', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await request.post('/__village_test/farm-scenario')).ok()).toBe(true);
  await page.goto('/');
  await expect(page.locator('[data-village-scene]')).toHaveAttribute('data-pixi-ready', 'true', {
    timeout: 30000,
  });
  const entrance = page.getByRole('button', { name: /افتح حديقة السلطان/ });
  await entrance.focus();
  await entrance.press('Enter');
  const scene = page.locator('[data-city-scene="sultan-garden"]');
  await expect(scene).toHaveAttribute('data-phase', 'active');
  if (page.viewportSize()!.width < 700)
    await scene.getByRole('button', { name: 'إدارة الحديقة' }).click();
  const trigger = page.getByRole('button', { name: 'افتح لعبة المزرعة' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'لعبة إدارة مزرعة السلطان' });
  await expect(dialog).toBeVisible();
  const game = page.frameLocator('iframe[title="لعبة إدارة مزرعة السلطان"]');
  await expect(game.locator('[data-plot]')).toHaveCount(6);
  await game.locator('[data-plot="0"]').click();
  await expect(game.locator('[data-plot="0"]')).toContainText('جاهز للحصاد', { timeout: 16000 });
  await game.locator('[data-plot="0"]').click();
  await expect(game.locator('#toast')).toContainText('حصدت');
  const frame = page
    .frames()
    .find((frame) => frame.url().includes('/games/sultan-farm/index.html'))!;
  expect(
    await frame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  const before = await frame.evaluate(() => {
    const key = 'mamluk-farm-v1:' + new URLSearchParams(location.search).get('save');
    return localStorage.getItem(key);
  });
  expect(JSON.parse(before!).harvests).toBe(1);
  await frame.evaluate(() => location.reload());
  await expect(game.locator('[data-plot]')).toHaveCount(6);
  expect(
    await frame.evaluate(() => {
      const key = 'mamluk-farm-v1:' + new URLSearchParams(location.search).get('save');
      return localStorage.getItem(key);
    }),
  ).toBe(before);
  await page.getByRole('button', { name: 'العودة إلى المزرعة' }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(scene).toHaveCount(1);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('button', { name: 'العودة إلى المزرعة' }).click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

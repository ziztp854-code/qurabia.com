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
  await expect(scene).toHaveAttribute('data-farm-world', '3d');
  await expect(page.getByRole('button', { name: 'افتح لعبة المزرعة' })).toHaveCount(0);
  const game = page.frameLocator('iframe[title="مزرعة السلطان ثلاثية الأبعاد"]');
  await expect(game.locator('#world')).toHaveAttribute('data-renderer', 'ready', {
    timeout: 30000,
  });
  const camera = await game.locator('#world').getAttribute('data-camera');
  await game.getByRole('button', { name: 'تدوير الخريطة' }).click();
  await expect(game.locator('#world')).not.toHaveAttribute('data-camera', camera!);
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
  await game.locator('.dock [data-tab="production"]').click();
  await game.locator('[data-action="produce"][data-id="flour"]').click();
  await expect(game.locator('[data-factory="mill"] .queue-item')).toHaveCount(1);
  await expect(game.locator('[data-action="collect"][data-id="mill"]')).toBeEnabled({
    timeout: 20000,
  });
  await game.locator('[data-action="collect"][data-id="mill"]').click();
  await expect(game.locator('#toast')).toContainText('استلمت');
  await game.locator('.dock [data-tab="build"]').click();
  await game.locator('[data-action="place"][data-id="garden"]').click();
  await game.locator('[data-action="slot"][data-id="3"]').click();
  await expect(game.locator('#toast')).toContainText('بدأ بناء');
  await expect(game.locator('[data-action="relocate"][data-id="garden"]')).toBeEnabled({
    timeout: 12000,
  });
  const saved = await frame.evaluate(() => {
    const key = 'mamluk-farm-v1:' + new URLSearchParams(location.search).get('save');
    return localStorage.getItem(key);
  });
  await Promise.all([
    frame.waitForNavigation({ waitUntil: 'load' }),
    frame.evaluate(() => location.reload()),
  ]);
  await expect(game.locator('#world')).toHaveAttribute('data-renderer', 'ready', {
    timeout: 30000,
  });
  await expect(game.locator('[data-plot]')).toHaveCount(6);
  expect(
    await frame.evaluate(() => {
      const key = 'mamluk-farm-v1:' + new URLSearchParams(location.search).get('save');
      return localStorage.getItem(key);
    }),
  ).toBe(saved);
  await frame.locator('body').press('Escape');
  await expect(scene).toHaveCount(0);
  await entrance.focus();
  await entrance.press('Enter');
  await expect(scene).toHaveAttribute('data-farm-world', '3d');
  await page.getByRole('button', { name: 'العودة إلى القرية' }).click();
  await expect(scene).toHaveCount(0);
  expect(errors).toEqual([]);
});

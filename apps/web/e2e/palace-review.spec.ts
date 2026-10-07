import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';

// Cosmetic demonstration data belongs only to the existing in-memory fixture.
test('review capture: original city, masked river and populated palace garden', async ({ page, request }, info) => {
  await request.post('/__village_test/city-scenario');
  const slots = ['red-roses', 'yellow-roses', 'white-roses', 'pink-roses', 'tulips', 'purple-flowers', 'jasmine', 'green-shrub', 'cypress-tree', 'fountain', 'bench', 'red-roses']
    .map((itemId, slotId) => ({ slotId, itemId, ...([0, 1, 2, 3, 4, 5].includes(slotId) ? { color: ['red', 'yellow', 'blue', 'green', 'orange', 'brown'][slotId] } : {}) }));
  const saved = await request.put('/api/kingdoms/palace-garden', { data: { worldId: 'browser-world', villageId: 'v1', slots } });
  expect(saved.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.locator('[data-village-scene]')).toHaveAttribute('data-pixi-ready', 'true');
  const canvas = page.locator('[data-village-scene] canvas');
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const first = hash(await canvas.screenshot());
  await page.waitForTimeout(2000);
  expect(hash(await canvas.screenshot())).not.toBe(first);
  await expect(canvas).toHaveAttribute('data-city-actors', '5');
  await page.screenshot({ path: info.outputPath('village-original-motion.png'), fullPage: true });
  const palace = await page.getByRole('button', { name: /^دار الحكم، المستوى/ }).boundingBox();
  expect(palace).not.toBeNull();
  await page.mouse.click(palace!.x + palace!.width / 2, palace!.y + palace!.height / 2);
  const scene = page.locator('[data-city-scene="palace"]');
  await expect(scene.locator('[data-sultan-palace]')).toHaveAttribute('data-pixi-garden', 'true');
  const selects = scene.locator('[role="group"] select');
  await selects.nth(1).selectOption('high');
  await expect(scene.locator('[data-sultan-palace] canvas')).toHaveAttribute('data-palace-quality', 'high');
  await selects.nth(0).selectOption('GARDEN');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath('palace-garden-six-colours.png'), fullPage: true });
  await page.waitForTimeout(3000);
  await selects.nth(0).selectOption('FOUNTAIN');
  await page.waitForTimeout(900);
  await page.screenshot({ path: info.outputPath('palace-fountain.png'), fullPage: true });
  await page.waitForTimeout(2500);
  await selects.nth(0).selectOption('FULLPALACE');
  await page.waitForTimeout(900);
  await page.screenshot({ path: info.outputPath('palace-full-original.png'), fullPage: true });
  await page.waitForTimeout(1500);
  const populated = [];
  const liveCanvas = scene.locator('[data-sultan-palace] canvas');
  for (const quality of ['high', 'medium', 'low']) {
    await selects.nth(1).selectOption(quality);
    await expect(liveCanvas).toHaveAttribute('data-palace-quality', quality);
    const before = Number(await liveCanvas.getAttribute('data-palace-frames') ?? 0), at = Date.now();
    await page.waitForTimeout(3100);
    populated.push({ quality, observedFps: (Number(await liveCanvas.getAttribute('data-palace-frames')) - before) / ((Date.now() - at) / 1000),
      updateMs: await liveCanvas.getAttribute('data-palace-update-ms'), placements: 12 });
  }
  await info.attach('populated-garden-quality', { body: JSON.stringify(populated), contentType: 'application/json' });
});

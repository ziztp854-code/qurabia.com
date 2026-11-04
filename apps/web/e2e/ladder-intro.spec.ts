import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const evidence = path.resolve('test-results/ladder-intro-evidence');
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    route.request().url().startsWith('http://127.0.0.1:3427/') ? route.continue() : route.abort(),
  );
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [320, 700],
  [844, 390],
]) {
  test(`complete frame and readable names at ${width}x${height}`, async ({ page }) => {
    await mkdir(evidence, { recursive: true });
    await page.setViewportSize({ width, height });
    await page.goto('/?elapsed=5000');
    await page.getByRole('button', { name: 'ابدأ المقدمة التجريبية' }).click();
    const video = page.getByLabel('مقدمة مواجهة السلم');
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
      .toBeGreaterThanOrEqual(2);
    await expect(page.getByText('عبدالعزيز', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByText('عبدالعزيز', { exact: true })
          .evaluate((el) => getComputedStyle(el.parentElement!).opacity),
      )
      .toBe('1');
    expect(await video.evaluate((el) => getComputedStyle(el).objectFit)).toBe('contain');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const metrics = await video.evaluate((el: HTMLVideoElement) => ({
      width: el.videoWidth,
      height: el.videoHeight,
      duration: el.duration,
      time: el.currentTime,
      paused: el.paused,
    }));
    expect(metrics.width).toBe(1920);
    expect(metrics.height).toBe(1080);
    expect(metrics.duration).toBeCloseTo(9.775, 1);
    expect(metrics.time).toBeGreaterThan(4.5);
    await page.screenshot({
      path: path.join(evidence, `after-${width}x${height}.png`),
      fullPage: true,
    });
    await expect(page.getByRole('region', { name: 'السؤال الأول' })).toHaveCount(0);
    await page.getByRole('button', { name: 'وصول السؤال من الخادم' }).click();
    await expect(page.getByRole('heading', { name: 'السؤال الأول' })).toBeVisible();
    await expect(page.getByLabel('مقدمة مواجهة السلم')).toHaveCount(0);
  });
}

test('clip ends without opening question and sound control operates', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ابدأ المقدمة التجريبية' }).click();
  const video = page.getByLabel('مقدمة مواجهة السلم');
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.1);
  const sound = page.getByRole('button', { name: /^(تشغيل الصوت|كتم الصوت)$/ });
  const before = await video.evaluate((el: HTMLVideoElement) => el.muted);
  await sound.click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.muted)).toBe(!before);
  await expect(page.getByRole('status')).toHaveText('بانتظار السؤال الأول…', { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'السؤال الأول' })).toHaveCount(0);
});

test('reduced motion, long Arabic names, and double text size remain readable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/?long=1');
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await page.getByRole('button', { name: 'ابدأ المقدمة التجريبية' }).click();
  await expect(page.getByText('عبدالعزيز بن عبدالرحمن القحطاني', { exact: true })).toBeVisible();
  const metrics = await page
    .getByText('عبدالعزيز بن عبدالرحمن القحطاني', { exact: true })
    .evaluate((el) => {
      const name = el.parentElement!.getBoundingClientRect();
      const stage = el.parentElement!.parentElement!.parentElement!.getBoundingClientRect();
      return {
        name: { top: name.top, bottom: name.bottom },
        stage: { top: stage.top, bottom: stage.bottom },
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
  expect(metrics.overflow).toBe(false);
  expect(metrics.name.top).toBeGreaterThanOrEqual(metrics.stage.top);
  expect(metrics.name.bottom).toBeLessThanOrEqual(metrics.stage.bottom);
  await page.screenshot({
    path: path.join(evidence, 'after-320-reduced-long-200percent.png'),
    fullPage: true,
  });
});

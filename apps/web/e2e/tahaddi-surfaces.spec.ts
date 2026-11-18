import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { profile } from './fixtures/tahaddi-surfaces-data';
for (const [width, height] of [
  [390, 844],
  [1440, 900],
]) {
  test(`synthetic surfaces ${width}x${height}: profile follow and login layout`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let followed = false;
    await page.route('**/api/community/profiles/124/follow', async (route) => {
      followed = true;
      await route.fulfill({ json: { ok: true, data: {} } });
    });
    await page.route('**/api/community/profiles/124', (route) =>
      route.fulfill({
        json: {
          ok: true,
          data: { ...profile, isFollowing: followed, followerCount: followed ? 125 : 124 },
        },
      }),
    );
    await page.goto('/?surface=profile');
    await expect(page.getByRole('heading', { name: 'سارة', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'متابعة', exact: true }).click();
    await expect(page.getByRole('button', { name: 'إلغاء المتابعة', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`profile-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.goto('/?surface=login');
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
    await page.getByLabel('البريد الإلكتروني').fill('fixture@example.test');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('fixture-only');
    await page.screenshot({ path: testInfo.outputPath(`login-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('narrow surfaces preserve RTL and no horizontal overflow at enlarged text', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route('**/api/community/profiles/124', (route) =>
    route.fulfill({ json: { ok: true, data: profile } }),
  );
  for (const surface of ['profile', 'login']) {
    await page.goto(`/?surface=${surface}`);
    await page.getByRole('heading').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    expect
      .soft(await page.evaluate(() => getComputedStyle(document.documentElement).direction))
      .toBe('rtl');
    expect
      .soft(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        `${surface}320px`,
      )
      .toBe(false);
    await page.evaluate(() => {
      const values = [...document.querySelectorAll<HTMLElement>('#root *')].map((element) => ({
        element,
        size: parseFloat(getComputedStyle(element).fontSize),
      }));
      values.forEach(({ element, size }) => {
        element.style.fontSize = `${size * 2}px`;
      });
    });
    await page.screenshot({
      path: testInfo.outputPath(`${surface}-320-text200.png`),
      fullPage: true,
    });
    expect
      .soft(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        `${surface}320px200%`,
      )
      .toBe(false);
    if (surface === 'profile') {
      const avatar = page.locator('span[data-size="large"]').first();
      const contained = await avatar.evaluate((element) => {
        const parent = element.getBoundingClientRect();
        const label = element.querySelector('span')!.getBoundingClientRect();
        return (
          label.x >= parent.x - 1 &&
          label.right <= parent.right + 1 &&
          label.y >= parent.y - 1 &&
          label.bottom <= parent.bottom + 1
        );
      });
      expect.soft(contained, 'missing-photo label stays inside avatar').toBe(true);
      const metrics = await page.locator('div[class*="metrics"] > div').evaluateAll((elements) =>
        elements.map((element) => {
          const parent = element.getBoundingClientRect();
          return [...element.querySelectorAll('strong,span')].every((child) => {
            const b = child.getBoundingClientRect();
            return b.x >= parent.x - 1 && b.right <= parent.right + 1;
          });
        }),
      );
      expect.soft(metrics).toHaveLength(4);
      expect.soft(metrics.every(Boolean), 'metric labels remain in separate columns').toBe(true);
    }
    if (surface === 'login') {
      const email = page.getByLabel('البريد الإلكتروني');
      await email.scrollIntoViewIfNeeded();
      await email.fill('fixture@example.test');
      await expect(email).toBeFocused();
      const inputMeasurements = await page.locator('input').evaluateAll((inputs) =>
        inputs.map((element) => {
          const input = element as HTMLInputElement;
          const style = getComputedStyle(input);
          return {
            type: input.type,
            height: input.clientHeight,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
          };
        }),
      );
      inputMeasurements.forEach((input) => {
        expect(input.height, `${input.type} line fits at 200%`).toBeGreaterThanOrEqual(
          parseFloat(input.lineHeight) + input.padding - 1,
        );
      });
      await writeFile(
        testInfo.outputPath('login-text200-inputs.json'),
        JSON.stringify(inputMeasurements, null, 2),
      );
      await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeEnabled();
    }
  }
});

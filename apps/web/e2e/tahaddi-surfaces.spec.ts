import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { profile, rooms } from './fixtures/tahaddi-surfaces-data';
const evidence = path.resolve(process.cwd(), '../../docs/visual-evidence/tahaddi-surfaces');
for (const [width, height] of [
  [390, 844],
  [1440, 900],
]) {
  test(`synthetic surfaces ${width}x${height}: discovery sorting, profile follow, login layout`, async ({
    page,
  }) => {
    await mkdir(evidence, { recursive: true });
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/voice/rooms', (route) => route.fulfill({ json: rooms }));
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'جلسة نقاش حرة', exact: true }).last(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'جديد', exact: true }).click();
    await expect(page.locator('.v-room-grid article').first()).toContainText('موسيقى لايف');
    await page.getByRole('button', { name: 'الأكثر شعبية', exact: true }).click();
    await expect(page.locator('.v-room-grid article').first()).toContainText('جلسة نقاش حرة');
    await page.getByRole('button', { name: 'مباشر', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(evidence, `lobby-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
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
    await page.screenshot({ path: path.join(evidence, `profile-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.goto('/?surface=login');
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
    await page.getByLabel('البريد الإلكتروني').fill('fixture@example.test');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('fixture-only');
    await page.screenshot({ path: path.join(evidence, `login-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('narrow surfaces preserve RTL and no horizontal overflow at enlarged text', async ({
  page,
}) => {
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route('**/api/voice/rooms', (route) => route.fulfill({ json: rooms }));
  await page.route('**/api/community/profiles/124', (route) =>
    route.fulfill({ json: { ok: true, data: profile } }),
  );
  for (const surface of ['lobby', 'profile', 'login']) {
    await page.goto(surface === 'lobby' ? '/' : `/?surface=${surface}`);
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
      path: path.join(evidence, `${surface}-320-text200.png`),
      fullPage: true,
    });
    expect
      .soft(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        `${surface}320px200%`,
      )
      .toBe(false);
    if (surface === 'lobby') {
      const signIn = await page
        .locator('.v-topbar')
        .getByRole('link', { name: 'تسجيل الدخول', exact: true })
        .boundingBox();
      expect(signIn).not.toBeNull();
      expect(signIn!.x).toBeGreaterThanOrEqual(0);
      expect(signIn!.x + signIn!.width).toBeLessThanOrEqual(321);
      expect(signIn!.width).toBeGreaterThanOrEqual(44);
      expect(signIn!.height).toBeGreaterThanOrEqual(44);
      const cards = await page.locator('.v-room-grid article').evaluateAll((elements) =>
        elements.map((card) => {
          const title = card.querySelector('h3') as HTMLElement;
          const count = card.querySelector('.v-card-presence')!;
          const a = title.getBoundingClientRect(),
            b = count.getBoundingClientRect();
          return {
            clippedX: title.scrollWidth > title.clientWidth + 1,
            clippedY: title.scrollHeight > title.clientHeight + 1,
            overlap:
              a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1,
          };
        }),
      );
      cards.forEach((card) => {
        expect.soft(card.clippedX).toBe(false);
        expect.soft(card.clippedY).toBe(false);
        expect.soft(card.overlap).toBe(false);
      });
    }
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
        path.join(evidence, 'login-text200-inputs.json'),
        JSON.stringify(inputMeasurements, null, 2),
      );
      await page.screenshot({ path: path.join(evidence, 'login-320-text200.png'), fullPage: true });
      await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeEnabled();
    }
  }
});

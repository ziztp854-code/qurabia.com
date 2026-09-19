import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`تعرض الصفحة الرئيسية طبقاتها المتجاوبة دون تمرير أفقي عند ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'تحدي' })).toBeVisible();
    await expect(
      page.getByText(
        'منصة مسابقات وألعاب جماعية عربية مباشرة، حيث يُصنع الأبطال وتُسجّل إنجازاتهم',
      ),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /ابدأ اللعب الآن/ })).toHaveAttribute(
      'href',
      /\/games\/?$/,
    );
    await expect(page.getByRole('link', { name: /انضم برمز/ })).toHaveAttribute(
      'href',
      /\/join\/?$/,
    );
    await expect(page.getByRole('textbox', { name: 'رمز الغرفة' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'انضم' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'الألعاب الأبرز' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'رُتب البلاط والاشتراكات' })).toBeVisible();

    const bottomNav = page.getByRole('navigation', { name: 'التنقل السفلي' });
    if (viewport.width < 768) await expect(bottomNav).toBeVisible();
    else await expect(bottomNav).toBeHidden();

    if (viewport.width < 768) {
      const undersizedTargets = await page
        .locator('[data-home-hero] a, [data-home-hero] button, [data-home-hero] input')
        .evaluateAll(
          (elements) =>
            elements.filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
            }).length,
        );
      expect(undersizedTargets).toBe(0);
    }

    await expect
      .poll(() =>
        page.evaluate(() => ({
          dir: document.documentElement.dir,
          fits: document.body.scrollWidth <= document.documentElement.clientWidth,
        })),
      )
      .toEqual({ dir: 'rtl', fits: true });
  });
}

test('تعرض صفحة الإهداء النص الكامل وتحترم تقليل الحركة', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('link', { name: 'الإهداء' }).click();
  const dedication = page.getByRole('region', { name: 'إهداء إلى أميرة' });
  await expect(dedication.getByText('إلى أميرة، شكرًا لأنك كنتِ جزءًا من البداية.')).toBeVisible();
  expect(
    await dedication.evaluate(
      (root) =>
        root
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === 'running').length,
    ),
  ).toBe(0);
});

test('يبقي مدخل لعبة القاتل واضحًا ومتجاوبًا', async ({ page }) => {
  await page.goto('/mafia');

  await expect(page.getByRole('heading', { level: 1, name: 'القاتل' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ادخل برمز الغرفة' })).toBeVisible();
  await expect(page.getByLabel('اسم اللاعب')).toBeVisible();
  await expect(page.getByLabel('رمز الغرفة')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

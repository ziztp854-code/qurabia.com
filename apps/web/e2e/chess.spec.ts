import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

async function createChessRoom(host: Page) {
  await host.goto('/games/chess/');
  await expect(host.getByRole('heading', { name: 'تحدي الشطرنج' })).toBeVisible();
  await host.getByLabel('اسمك').fill('عبدالعزيز');
  await host.getByRole('button', { name: 'إنشاء التحدي' }).click();
  await expect(host.getByRole('heading', { name: 'غرفة الانتظار' })).toBeVisible();
  const pinText = await host.locator('.chess-room-pin').textContent();
  const pin = pinText?.match(/\d{6}/)?.[0];
  expect(pin).toBeTruthy();
  return pin as string;
}

async function joinChessAsPlayer(
  browser: Browser,
  pin: string,
  name: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/games/chess/?join=${pin}`);
  await expect(page.getByRole('heading', { name: 'تحدي الشطرنج' })).toBeVisible();
  await page.getByLabel('اسم اللاعب').fill(name);
  await expect(page.getByLabel('رمز الغرفة')).toHaveValue(pin);
  await page.getByRole('button', { name: 'تحدَّ الآن' }).click();
  await expect(page.getByRole('heading', { name: 'جاهز للبدء' })).toBeVisible();
  return { context, page };
}

test('يلعب لاعبان مباراة شطرنج كاملة ويتحقق من reassign بعد التحديث', async ({
  browser,
  page: host,
}) => {
  const pin = await createChessRoom(host);

  const player2 = await joinChessAsPlayer(browser, pin, 'محمد');

  try {
    await host.getByRole('button', { name: 'بدء المباراة' }).click();

    await expect(host.getByRole('heading', { name: 'المباراة' })).toBeVisible();
    await expect(player2.page.getByRole('heading', { name: 'المباراة' })).toBeVisible();

    await expect(host.getByText('عبدالعزيز')).toBeVisible();
    await expect(host.getByText('محمد')).toBeVisible();

    const hostBadge = host.getByText('أنت');
    const player2Badge = player2.page.getByText('أنت');

    await expect(hostBadge).toBeAttached();
    await expect(player2Badge).toBeAttached();

    const hostColor = await host
      .locator('[data-player-self="true"]')
      .getAttribute('data-player-color');
    const player2Color = await player2.page
      .locator('[data-player-self="true"]')
      .getAttribute('data-player-color');

    expect(hostColor).not.toBe(player2Color);
    const player2IsWhite = player2Color === 'white';
    const whitePage = player2IsWhite ? player2.page : host;
    const blackPage = player2IsWhite ? host : player2.page;

    await expect(whitePage.locator('[data-player-self="true"]')).toHaveAttribute(
      'data-player-color',
      'white',
    );
    await expect(blackPage.locator('[data-player-self="true"]')).toHaveAttribute(
      'data-player-color',
      'black',
    );

    await whitePage.getByRole('button', { name: /e2/ }).click();
    await whitePage.getByRole('button', { name: /e4/ }).click();

    await expect(host.getByRole('button', { name: /أبيض الجندي في e4/ })).toBeVisible();
    await expect(player2.page.getByRole('button', { name: /أبيض الجندي في e4/ })).toBeVisible();

    await blackPage.getByRole('button', { name: /أسود الجندي في e7/ }).click();
    await blackPage.getByRole('button', { name: /مربع e5/ }).click();

    await expect(host.getByRole('button', { name: /أسود الجندي في e5/ })).toBeVisible();
    await expect(player2.page.getByRole('button', { name: /أسود الجندي في e5/ })).toBeVisible();

    await player2.page.reload();
    await expect(player2.page.getByText('محمد')).toBeVisible();
    await expect(player2.page.getByText('أنت')).toBeAttached();
    await expect(player2.page.getByRole('heading', { name: 'المباراة' })).toBeVisible();

    const urlAfterRefresh = player2.page.url();
    expect(urlAfterRefresh).not.toContain('guestToken');
    expect(urlAfterRefresh).not.toContain('token');

    host.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await host.getByRole('button', { name: 'استسلام' }).click();

    await expect(host.getByText(/يفوز/)).toBeVisible({ timeout: 15000 });
    await expect(player2.page.getByText(/يفوز/)).toBeVisible({ timeout: 15000 });
  } finally {
    await Promise.all([player2.context.close()]);
  }
});

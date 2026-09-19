import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { SPECIAL_GAME_META, SPECIAL_GAME_ORDER, type SpecialGameMode } from '@tahaddi/domain';

function parseArabicNumber(value: string) {
  const digits = value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  return Number(digits.match(/\d+/)?.[0]);
}

async function expectRoundTimer(page: Page, roundSeconds: number) {
  const timer = page.locator('.special-timer');
  await expect(timer).toBeVisible();
  const remaining = parseArabicNumber((await timer.textContent()) ?? '');
  expect(remaining).toBeGreaterThan(0);
  expect(remaining).toBeLessThanOrEqual(roundSeconds);
}

async function createRoom(host: Page, mode: SpecialGameMode) {
  await host.goto(`/games/${mode}/`);
  await expect(host.getByText('متصل بخدمة اللعب')).toBeVisible({ timeout: 15_000 });
  await host.getByRole('button', { name: 'أنشئ الغرفة' }).click();
  const pinText = await host.locator('.special-room-pin').textContent();
  const pin = pinText?.match(/\d{6}/)?.[0];
  expect(pin).toBeTruthy();
  await expect(host.getByLabel(`رمز QR للانضمام إلى الغرفة ${pin}`)).toBeVisible();
  return pin as string;
}

async function joinPlayers(browser: Browser, mode: SpecialGameMode, pin: string, count: number) {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  for (let index = 0; index < count; index += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    contexts.push(context);
    pages.push(page);
    await page.goto(`/games/${mode}/?join=${pin}`);
    await expect(page.getByText('متصل بخدمة اللعب')).toBeVisible({ timeout: 15_000 });
    const playerName = `لاعب ${index + 1}`;
    await page.getByLabel('اسم اللاعب').fill(playerName);
    await expect(page.getByLabel('اسم اللاعب')).toHaveValue(playerName);
    await expect(page.getByLabel('رمز الغرفة')).toHaveValue(pin);
    await page.getByRole('button', { name: 'ادخل الغرفة' }).click();
    await expect(page.getByRole('heading', { name: 'غرفة الانتظار' })).toBeVisible();
  }
  return { contexts, pages };
}

test('يكمل أول وضع غرفة دورة السؤال والإجابة والكشف', async ({ browser, page: host }) => {
  const mode = SPECIAL_GAME_ORDER[0];
  const pin = await createRoom(host, mode);
  const { contexts, pages } = await joinPlayers(
    browser,
    mode,
    pin,
    Math.max(3, SPECIAL_GAME_META[mode].minimumPlayers),
  );

  try {
    await host.getByRole('button', { name: 'ابدأ الجولة' }).click();
    await Promise.all(
      pages.map((player) => expectRoundTimer(player, SPECIAL_GAME_META[mode].roundSeconds)),
    );
    for (const player of pages) {
      await expect(player.locator('.special-question-panel h2')).toBeVisible();
      await player.locator('.special-option').first().click();
    }
    await expect(host.getByRole('heading', { name: 'انكشفت العوالم' })).toBeVisible();
    await expect(host.getByLabel('اللاعبون والترتيب')).toBeVisible();
    await expect(host.getByRole('button', { name: 'الجولة التالية' })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('يكمل ثاني وضع غرفة دورة الكتابة والتصويت والنتيجة', async ({ browser, page: host }) => {
  const mode = SPECIAL_GAME_ORDER[1];
  const pin = await createRoom(host, mode);
  const { contexts, pages } = await joinPlayers(
    browser,
    mode,
    pin,
    SPECIAL_GAME_META[mode].minimumPlayers,
  );

  try {
    await host.getByRole('button', { name: 'ابدأ الجولة' }).click();
    await Promise.all(
      pages.map((player) => expectRoundTimer(player, SPECIAL_GAME_META[mode].roundSeconds)),
    );
    for (const [index, player] of pages.entries()) {
      await player.getByLabel('سؤالك الذكي').fill(`ما السؤال المناسب للاعب رقم ${index + 1}؟`);
      await player.getByRole('button', { name: 'أرسل السؤال' }).click();
    }
    for (const player of pages) {
      await expect(player.getByRole('heading', { name: 'أي سؤال هو الأذكى؟' })).toBeVisible();
      await player.locator('.special-vote-list button:not([disabled])').first().click();
    }
    await expect(host.getByRole('heading', { name: 'نتيجة التصويت' })).toBeVisible();
    await expect(host.getByLabel('اللاعبون والترتيب')).toBeVisible();
    await expect(host.getByRole('button', { name: 'الجولة التالية' })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('يكمل ثالث وضع غرفة بأربعة سياقات مستقلة حتى كشف الدخيل', async ({ browser, page: host }) => {
  test.setTimeout(90_000);
  const mode = SPECIAL_GAME_ORDER[2];
  const pin = await createRoom(host, mode);
  const { pages } = await joinPlayers(browser, mode, pin, 4);

  await host.getByRole('button', { name: 'ابدأ الجولة' }).click();
  await Promise.all(
    pages.map(async (player) => {
      await player.getByRole('button', { name: 'اكشف دورك السري' }).click();
      await player.getByRole('button', { name: 'فهمت — ابدأ' }).click();
      await expectRoundTimer(player, SPECIAL_GAME_META[mode].roundSeconds);
    }),
  );
  await Promise.all(
    pages.map(async (player) => {
      await expect(player.locator('.special-question-panel h2')).toBeVisible();
      await player.locator('.special-option').first().click();
    }),
  );

  await Promise.all(
    pages.map(async (player) => {
      await expect(
        player.getByRole('heading', { name: 'أي إجابة جاءت من سؤال مختلف؟' }),
      ).toBeVisible();
      await player.locator('.special-vote-list button:not([disabled])').first().click();
    }),
  );

  const infiltratorPage = (
    await Promise.all(
      pages.map(async (player) => ({
        player,
        hasGuess: (await player.getByText(/فرصتك الثانية/).count()) > 0,
      })),
    )
  ).find((candidate) => candidate.hasGuess)?.player;
  expect(infiltratorPage).toBeDefined();
  await infiltratorPage
    ?.locator('.special-majority-guess .special-option:not([disabled])')
    .first()
    .click();

  await expect(host.getByRole('heading', { name: 'انكشف الدخيل' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(host.getByLabel('اللاعبون والترتيب')).toBeVisible();
  await expect(host.getByRole('button', { name: 'الجولة التالية' })).toBeVisible();
});

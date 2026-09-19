import { expect, test } from '@playwright/test';
import {
  INJECTED_GAME_CATALOG,
  PARALLEL_WORLD_BANK,
  REVERSE_TIME_BANK,
  SPECIAL_GAME_META,
  SPECIAL_GAME_ORDER,
  SPECTRUM_BANK,
  UPCOMING_SPECIAL_GAMES,
} from '@tahaddi/domain';
import {
  COLOR_RUSH_BANK,
  INSTANT_GAME_META,
  INSTANT_GAME_ORDER,
  MEMORY_SYMBOL_BANK,
  WORD_CODE_BANK,
} from '../src/components/instant-games/game-data';

test('الكتالوج والمسارات والبنوك مشتقة من قوائم الألعاب الثلاث', async ({ page, request }) => {
  await page.goto('/games/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ساحة الألعاب');
  await expect(page.getByText(/اختر لعبتك المفضلة وابدأ جولة مباشرة مع أصدقائك/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'الألعاب الجماعية' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'الألعاب الفورية' })).toBeVisible();

  const cards = page.getByRole('article').filter({ has: page.getByRole('heading', { level: 3 }) });
  await expect(cards).toHaveCount(INJECTED_GAME_CATALOG.length);

  for (const mode of SPECIAL_GAME_ORDER) {
    const meta = SPECIAL_GAME_META[mode];
    expect(meta).toMatchObject({
      mode,
      minimumPlayers: expect.any(Number),
      roundSeconds: expect.any(Number),
      contentLabel: expect.any(String),
    });
    await expect(page.getByRole('link', { name: meta.title, exact: true })).toHaveAttribute(
      'href',
      `/games/${mode}/`,
    );
    const card = page.getByRole('article').filter({
      has: page.getByRole('heading', { level: 3, name: meta.title, exact: true }),
    });
    await expect(card).toBeVisible();
    await expect(card.locator('.game-card__meta')).toContainText('لاعب');
    expect((await request.get(`/games/${mode}/`)).status()).toBe(200);
  }

  for (const mode of INSTANT_GAME_ORDER) {
    const meta = INSTANT_GAME_META[mode];
    expect(meta).toMatchObject({
      mode,
      minimumPlayers: expect.any(Number),
      roundSeconds: expect.any(Number),
      contentLabel: expect.any(String),
    });
    await expect(page.getByRole('link', { name: meta.title, exact: true })).toHaveAttribute(
      'href',
      `/games/${mode}/`,
    );
    const card = page.getByRole('article').filter({
      has: page.getByRole('heading', { level: 3, name: meta.title, exact: true }),
    });
    await expect(card).toBeVisible();
    expect((await request.get(`/games/${mode}/`)).status()).toBe(200);
  }

  for (const game of UPCOMING_SPECIAL_GAMES) {
    expect(game).toMatchObject({
      minimumPlayers: expect.any(Number),
      roundSeconds: expect.any(Number),
      contentLabel: expect.any(String),
    });
    await expect(page.getByText(game.title, { exact: false })).toBeVisible();
    await expect(page.locator(`a[href="/games/${game.slug}"]`)).toHaveCount(0);
  }

  expect(PARALLEL_WORLD_BANK.length).toBeGreaterThanOrEqual(6);
  expect(REVERSE_TIME_BANK.length).toBeGreaterThanOrEqual(8);
  expect(SPECTRUM_BANK.length).toBeGreaterThanOrEqual(24);
  expect(new Set(SPECTRUM_BANK.map((pair) => pair.id)).size).toBe(SPECTRUM_BANK.length);
  expect(MEMORY_SYMBOL_BANK.length).toBeGreaterThanOrEqual(4);
  expect(WORD_CODE_BANK.length).toBeGreaterThanOrEqual(12);
  expect(COLOR_RUSH_BANK.length).toBeGreaterThanOrEqual(4);
  expect(new Set(WORD_CODE_BANK.map((item) => item.word)).size).toBe(WORD_CODE_BANK.length);
  expect(new Set(COLOR_RUSH_BANK.map((item) => item.value)).size).toBe(COLOR_RUSH_BANK.length);
  for (const round of PARALLEL_WORLD_BANK) {
    expect(round.variants.length).toBeGreaterThanOrEqual(4);
    expect(round.variants.every((variant) => variant.options.includes(round.answer))).toBe(true);
  }
  for (const round of REVERSE_TIME_BANK) {
    expect(round.answer.trim()).not.toBe('');
    expect(round.hint.trim()).not.toBe('');
  }
  for (const pair of SPECTRUM_BANK) {
    expect(pair.left.trim()).not.toBe('');
    expect(pair.right.trim()).not.toBe('');
    expect(pair.left).not.toBe(pair.right);
  }
});

test('خدعة الألوان تبدأ فورًا وتحتسب الإجابة الصحيحة', async ({ page }) => {
  const mode = 'color-rush';
  expect(INSTANT_GAME_ORDER).toContain(mode);
  await page.goto(`/games/${mode}/`);
  await page.getByRole('button', { name: 'وضع عمى الألوان: إظهار رموز مميزة' }).click();
  await page.getByRole('button', { name: 'ابدأ التحدّي' }).click();
  const symbolLabel = await page.getByLabel(/^رمز الحبر:/).getAttribute('aria-label');
  const answer = COLOR_RUSH_BANK.find((color) => symbolLabel?.endsWith(color.symbolLabel));
  expect(answer).toBeDefined();
  await page.getByRole('button', { name: answer!.label }).click();

  await expect(page.getByLabel('حالة اللعبة')).toContainText('الرصيد 75');
  await expect(page.getByText('إجابة صحيحة')).toBeVisible();
});

test('سطح الألعاب يحافظ على الاستجابة والاتجاه والتركيز في الثيمين', async ({ page }) => {
  await page.goto('/games/');

  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const index = document.querySelector('.game-card__index');
      const chevron = index;
      const button =
        document.querySelector('.gc-chip') ?? document.querySelector('.gc-filter-button');

      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        pageDirection: getComputedStyle(root).direction,
        indexDirection: index ? getComputedStyle(index).direction : null,
        chevronDirection: chevron ? getComputedStyle(chevron).direction : null,
        buttonWhiteSpace: button ? getComputedStyle(button).whiteSpace : null,
      };
    });

    expect(layout.scrollWidth).toBe(layout.clientWidth);
    expect(layout.pageDirection).toBe('rtl');
    expect(layout.indexDirection).toBe('ltr');
    expect(layout.chevronDirection).toBe('ltr');
    expect(layout.buttonWhiteSpace).toBe('nowrap');
  }

  await page.addStyleTag({ content: 'html { scrollbar-gutter: stable; }' });
  await page.setViewportSize({ width: 320, height: 900 });
  const narrowLayout = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body.getBoundingClientRect();
    return {
      clientWidth: root.clientWidth,
      bodyLeft: body.left,
      bodyRight: body.right,
      bodyWidth: body.width,
      bodyScrollWidth: document.body.scrollWidth,
    };
  });
  expect(narrowLayout.bodyLeft).toBeGreaterThanOrEqual(0);
  expect(narrowLayout.bodyRight).toBeLessThanOrEqual(narrowLayout.clientWidth);
  expect(narrowLayout.bodyWidth).toBeLessThanOrEqual(narrowLayout.clientWidth);
  expect(narrowLayout.bodyScrollWidth).toBeLessThanOrEqual(narrowLayout.clientWidth);

  await page.setViewportSize({ width: 360, height: 900 });
  await page.getByRole('combobox', { name: 'ابحث عن لعبة' }).fill('برج');
  const touchTargets = [
    page.getByRole('button', { name: 'رجوع' }),
    page.getByRole('button', { name: 'مسح البحث' }),
    page.getByRole('button', { name: 'عرض شبكي' }),
    page.getByRole('button', { name: 'عرض قائمة' }),
  ];

  for (const target of touchTargets) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'مسح البحث' }).click();

  await page.getByRole('button', { name: 'المظهر الحالي: dark' }).click();
  await page.getByRole('menuitem', { name: 'فاتح' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press('Tab');
    const focusedHref = await page.evaluate(() => document.activeElement?.getAttribute('href'));
    if (focusedHref === `/games/${SPECIAL_GAME_ORDER[0]}/`) break;
  }

  const gameLink = page.getByRole('link', {
    name: SPECIAL_GAME_META[SPECIAL_GAME_ORDER[0]].title,
    exact: true,
  });
  await expect(gameLink).toBeFocused();
  await expect(gameLink).toHaveCSS('outline-style', 'solid');
});

import { expect, test, type Page } from '@playwright/test';
import type { BalootSnapshot } from '../src/components/instant-games/use-baloot-socket';

// Observe the real private snapshots delivered to each browser, without exposing
// socket internals or adding a test endpoint to the application.
function observe(page: Page) {
  let latest: BalootSnapshot | undefined;
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const frame = String(payload);
      if (!frame.startsWith('42/baloot,') && !frame.startsWith('43/baloot,')) return;
      const start = frame.indexOf('[');
      if (start < 0) return;
      const data = JSON.parse(frame.slice(start));
      if (data[0]?.ok === false)
        console.log('Baloot command failed:', data[0].code, data[0].message);
      const candidate = data[0] === 'baloot:state' ? data[1] : data[0]?.data?.snapshot;
      if (
        candidate &&
        (!latest ||
          latest.roomCode !== candidate.roomCode ||
          latest.stateVersion <= candidate.stateVersion)
      )
        latest = candidate;
    }),
  );
  return () => latest;
}

test('four players purchase, reconnect, complete eight tricks and deal the next round', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () => browser.newContext(testInfo.project.use)),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const states = pages.map(observe);
  try {
    for (let seat = 0; seat < 4; seat += 1) {
      await pages[seat].goto('/games/baloot/', { waitUntil: 'domcontentloaded' });
      await expect(pages[seat].getByLabel('اسم اللاعب', { exact: true })).toBeEnabled({
        timeout: 20_000,
      });
      await pages[seat]
        .getByLabel('اسم اللاعب', { exact: true })
        .fill(['المضيف', 'اللاعب الثاني', 'الشريك', 'اللاعب الرابع'][seat]);
      if (seat > 0) {
        await pages[seat].getByRole('button', { name: 'دخول برمز', exact: true }).click();
        await pages[seat].getByLabel('رمز المجلس', { exact: true }).fill(states[0]()!.roomCode);
      }
      await pages[seat]
        .getByLabel('اسم اللاعب', { exact: true })
        .fill(['المضيف', 'اللاعب الثاني', 'الشريك', 'اللاعب الرابع'][seat]);
      await pages[seat]
        .getByRole('button', { name: seat === 0 ? 'أنشئ مجلساً' : 'ادخل المجلس', exact: true })
        .click();
      await expect(
        pages[seat].getByRole('heading', { name: 'طاولة البلوت', exact: true }),
      ).toBeVisible();
      await expect.poll(() => states[seat]()?.yourSeat, { timeout: 15000 }).toBe(seat);
      await pages[seat].getByRole('button', { name: 'أنا جاهز', exact: true }).click();
    }
    await pages[0].getByRole('button', { name: 'ابدأ المباراة', exact: true }).click();
    await expect.poll(() => states[0]()?.phase).toBe('BIDDING');
    for (const state of states) {
      await expect.poll(() => state()?.yourHand.length).toBe(5);
      expect(state()!.seats.every((seat) => !('hand' in seat))).toBe(true);
      expect(state()!).not.toHaveProperty('remainingDeck');
    }
    if (testInfo.project.name === 'mobile') {
      await pages[0].setViewportSize({ width: 320, height: 800 });
      await pages[0].evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await expect
        .poll(() =>
          pages[0]
            .getByLabel('يدك')
            .getByRole('button')
            .evaluateAll((nodes) =>
              Math.min(...nodes.map((node) => node.getBoundingClientRect().width)),
            ),
        )
        .toBeGreaterThanOrEqual(44);
      await expect
        .poll(() => pages[0].evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        .toBe(true);
      await pages[0]
        .locator('[class*="__shell"]')
        .last()
        .screenshot({ path: testInfo.outputPath('table-320-text-200.png') });
      await pages[0].evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      await pages[0].setViewportSize({ width: 390, height: 844 });
    }
    const purchaseVersion = states[0]()!.stateVersion;
    await pages[0].getByRole('button', { name: 'توسيع الطاولة', exact: true }).click();
    await expect(
      pages[0].getByRole('button', { name: 'الحجم العادي', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(states[0]()!.stateVersion).toBe(purchaseVersion);
    await pages[0]
      .locator('[class*="__shell"]')
      .last()
      .screenshot({ path: testInfo.outputPath('expanded-table.png') });
    await pages[0].getByRole('button', { name: 'الحجم العادي', exact: true }).click();
    const fullscreen = pages[0].getByRole('button', { name: 'ملء الشاشة', exact: true });
    if (await fullscreen.count()) {
      await fullscreen.click();
      await expect
        .poll(() => pages[0].evaluate(() => Boolean(document.fullscreenElement)))
        .toBe(true);
      await expect(
        pages[0].getByRole('button', { name: 'إنهاء ملء الشاشة', exact: true }),
      ).toBeVisible();
      await pages[0].getByRole('button', { name: 'إنهاء ملء الشاشة', exact: true }).click();
      await expect
        .poll(() => pages[0].evaluate(() => Boolean(document.fullscreenElement)))
        .toBe(false);
    }
    const floor = states[0]()!.purchaseCard!;
    expect(floor).toBeTruthy();
    await pages[0]
      .getByLabel('ورقة الشراء المكشوفة')
      .screenshot({ path: testInfo.outputPath('purchase-card.png') });
    await pages[0].screenshot({ path: testInfo.outputPath('bidding.png'), fullPage: true });
    await pages[0].getByRole('button', { name: 'صن', exact: true }).click();
    for (let seat = 1; seat < 4; seat += 1) {
      await expect.poll(() => states[seat]()?.bidder).toBe(seat);
      await pages[seat].getByRole('button', { name: 'بس (تمرير)', exact: true }).click();
    }
    await expect.poll(() => states[0]()?.phase).toBe('DOUBLING');
    for (const state of states) await expect.poll(() => state()?.yourHand.length).toBe(8);
    expect(states[0]()!.yourHand).toContainEqual(floor);
    expect(new Set(states.flatMap((state) => state()!.yourHand.map((card) => card.id))).size).toBe(
      32,
    );
    const savedHand = states[2]()!.yourHand;
    await pages[2].reload({ waitUntil: 'domcontentloaded' });
    await expect(
      pages[2].getByRole('heading', { name: 'طاولة البلوت', exact: true }),
    ).toBeVisible();
    await expect.poll(() => states[2]()?.yourHand).toEqual(savedHand);
    await pages[states[0]()!.bidder].getByRole('button', { name: 'قبول', exact: true }).click();
    await expect.poll(() => states[0]()?.phase).toBe('PLAYING');
    await pages[0].screenshot({ path: testInfo.outputPath('playing.png'), fullPage: true });
    for (let play = 0; play < 32; play += 1) {
      const state = states[0]()!;
      const seat = state.turn!;
      const version = state.stateVersion;
      if (play === 2) {
        await pages[seat]
          .locator('[class*="__shell"]')
          .last()
          .screenshot({ path: testInfo.outputPath('inside-table.png') });
      }

      await pages[seat]
        .getByRole('button', { name: /، العب الورقة$/ })
        .first()
        .click();
      await expect.poll(() => states[0]()?.stateVersion).toBeGreaterThan(version);
    }
    await expect.poll(() => states[0]()?.phase).toBe('ROUND_RESULT');
    expect(states[0]()!.trickHistory).toHaveLength(8);
    expect(states[0]()!.roundScore).not.toBeNull();
    // Each client receives its own final snapshot after the host enters ROUND_RESULT.
    for (const state of states) await expect.poll(() => state()?.yourHand.length).toBe(0);
    await pages[0].screenshot({ path: testInfo.outputPath('round-result.png'), fullPage: true });
    await pages[0].getByRole('button', { name: 'ابدأ الصكة التالية', exact: true }).click();
    await expect.poll(() => states[0]()?.phase).toBe('BIDDING');
    expect(states[0]()!.bidder).toBe(1);
    await expect.poll(() => states[0]()?.yourHand.length).toBe(5);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('narrow screens and enlarged Arabic text keep the lobby and rules usable', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/games/baloot/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('اسم اللاعب', { exact: true }).waitFor();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  const rules = page.getByRole('button', { name: 'دليل القوانين', exact: true });
  await rules.click();
  const dialog = page.getByRole('dialog', { name: 'دليل قوانين البلوت' });
  await expect(dialog).toBeVisible();
  const close = page.getByRole('button', { name: 'إغلاق النافذة', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('rules-320-text-200.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(rules).toBeFocused();
});

// Loopback synthetic fixture: real room UI/CSS, mocked audio, no production accounts.
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';

const stage = process.env.VOICE_POLISH_STAGE || 'after';
const output = path.resolve(process.cwd(), '../../docs/voice-polish-evidence', stage);

async function openRoom(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
  await page.goto('/');
  await page.locator('.v-room-controls').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const close = page.locator('[class*="photographicEntrance"] button');
  if (await close.isVisible()) await close.click();
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const selectors = [
      '.v-topbar',
      '[class*="roomHeader"]',
      '.v-main',
      '.v-stage-column',
      '.v-chat-column',
      '.v-room-controls',
      '.v-chat-compose',
      '.v-seats',
    ];
    return {
      width: innerWidth,
      height: innerHeight,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      documentHeight: document.documentElement.scrollHeight,
      direction: getComputedStyle(document.documentElement).direction,
      boxes: Object.fromEntries(
        selectors.map((selector) => {
          const element = document.querySelector(selector);
          const rect = element?.getBoundingClientRect();
          return [
            selector,
            rect && {
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              height: rect.height,
              width: rect.width,
            },
          ];
        }),
      ),
      controls: [...document.querySelectorAll('.v-room-controls button')]
        .filter((element) => element.getClientRects().length)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            name: element.getAttribute('aria-label') || element.textContent,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        }),
    };
  });
}

// Root rem changes alone miss the room's px typography. Snapshot every computed size
// before applying any writes, so descendants are not enlarged twice through inheritance.
async function textScale(page: Page, enlarged: boolean) {
  await page.evaluate((enlarged) => {
    if (enlarged) {
      const elements = [...document.querySelectorAll<HTMLElement>('body *')];
      const sizes = elements.map((element) => parseFloat(getComputedStyle(element).fontSize));
      elements.forEach((element, index) => {
        element.dataset.voicePolishStyle = element.getAttribute('style') ?? '__none__';
        element.style.setProperty('font-size', `${sizes[index] * 2}px`, 'important');
      });
    } else {
      document.querySelectorAll<HTMLElement>('[data-voice-polish-style]').forEach((element) => {
        const original = element.dataset.voicePolishStyle!;
        if (original === '__none__') element.removeAttribute('style');
        else element.setAttribute('style', original);
        delete element.dataset.voicePolishStyle;
      });
    }
  }, enlarged);
}

test('matched room screenshots, geometry, text zoom and keyboard simulation', async ({ page }) => {
  await mkdir(output, { recursive: true });
  await openRoom(page);
  const records = [];
  for (const [width, height] of [
    [320, 700],
    [390, 844],
    [430, 932],
    [1021, 768],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(180);
    records.push({ state: 'normal', ...(await geometry(page)) });
    await page.screenshot({ path: path.join(output, `${width}x${height}.png`), fullPage: true });
    await textScale(page, true);
    await page.waitForTimeout(180);
    records.push({ state: 'text200', ...(await geometry(page)) });
    if (width > 1020 && stage !== 'before') {
      const initial = records.at(-1)!;
      expect
        .soft(initial.boxes['.v-chat-compose']!.bottom, `initial composer visible at${width}`)
        .toBeLessThanOrEqual(initial.boxes['.v-main']!.bottom + 1);
    }
    await page.screenshot({
      path: path.join(output, `${width}x${height}-text200.png`),
      fullPage: true,
    });
    if (width > 1020 && stage !== 'before') {
      if (width < 1280) {
        const member = page.locator('.v-chat-column [data-room-audience-list] button').last();
        await member.scrollIntoViewIfNeeded();
        const audience = await member.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return {
            reachable: hit === element || element.contains(hit),
            top: rect.top,
            bottom: rect.bottom,
          };
        });
        await writeFile(
          path.join(output, `${width}-audience-reachability.json`),
          JSON.stringify(audience, null, 2),
        );
        expect.soft(audience.reachable, 'last synthetic audience member reachable').toBe(true);
      }
      for (const selector of [
        '.v-chat-compose',
        '.v-audio-session > summary',
        '.v-audio-session > button',
      ]) {
        if (selector.endsWith('button')) await page.locator('.v-audio-session > summary').click();
        const target = page.locator(selector);
        await target.scrollIntoViewIfNeeded();
        const bounds = await target.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const dock = document.querySelector('.v-room-controls')!.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return {
            top: rect.top,
            bottom: rect.bottom,
            dockTop: dock.top,
            reachable: hit === element || element.contains(hit),
          };
        });
        await writeFile(
          path.join(
            output,
            `${width}-${selector.includes('compose') ? 'compose' : selector.endsWith('button') ? 'audio-button' : 'audio'}-reachability.json`,
          ),
          JSON.stringify(bounds, null, 2),
        );
        expect
          .soft(bounds.bottom, `${selector} above dock at${width}`)
          .toBeLessThanOrEqual(bounds.dockTop + 1);
        expect.soft(bounds.reachable, `${selector} hit test at${width}`).toBe(true);
        if (selector.includes('compose')) {
          await page.screenshot({
            path: path.join(output, `${width}x${height}-text200-compose-visible.png`),
          });
        }
        if (selector.endsWith('button')) {
          // The settings dialog belongs to AudioSession, replaced by the no-media
          // adapter here. Its real interactions are covered by the audio unit suite.
          await page.locator('.v-audio-session > summary').click();
        }
      }
    }
    await textScale(page, false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#voice-message').scrollIntoViewIfNeeded();
  await page.locator('#voice-message').fill('اختبار كتابة داخل الغرفة');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { value: 420, configurable: true });
    Object.defineProperty(window.visualViewport, 'offsetTop', { value: 0, configurable: true });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(180);
  records.push({ state: 'simulated-inline-keyboard', ...(await geometry(page)) });
  await page.screenshot({ path: path.join(output, '390x844-inline-keyboard.png'), fullPage: true });
  await page.evaluate(() => {
    delete (window.visualViewport as unknown as { height?: number }).height;
    delete (window.visualViewport as unknown as { offsetTop?: number }).offsetTop;
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(180);
  await page.locator('.v-room-controls .v-chat-toggle').click();
  const input = page.locator('#voice-message');
  await input.fill('اختبار لوحة المفاتيح');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { value: 330, configurable: true });
    Object.defineProperty(window.visualViewport, 'offsetTop', { value: 20, configurable: true });
    window.visualViewport!.dispatchEvent(new Event('resize'));
    window.visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(180);
  records.push({ state: 'simulated-keyboard', ...(await geometry(page)) });
  await page.screenshot({ path: path.join(output, '390x844-keyboard.png'), fullPage: true });
  await writeFile(
    path.join(output, 'layout.json'),
    JSON.stringify(
      {
        stage,
        presentationSource:
          stage === 'before'
            ? 'immutable 9132ff95c4db2fa7809e434adae59a111013be9d via fixture load plugin'
            : 'working tree',
        browser: page.context().browser()?.version(),
        scope:
          'Vite room presentation; mocked AudioSession and HTTP; DPR1; text200 simulates 2x captured computed font sizes (including px); visualViewport simulation, not physical keyboard/device.',
        records,
      },
      null,
      2,
    ),
  );
  if (stage !== 'before') {
    for (const record of records) expect.soft(record.overflowX).toBe(false);
    for (const record of records.filter((record) => record.width > 1020)) {
      expect
        .soft(record.boxes['.v-main']!.bottom, `${record.width} ${record.state} content above dock`)
        .toBeLessThanOrEqual(record.boxes['.v-room-controls']!.top + 1);
    }
    const inlineKeyboard = records.find((record) => record.state === 'simulated-inline-keyboard')!;
    expect.soft(inlineKeyboard.boxes['.v-room-controls']!.bottom).toBeLessThanOrEqual(421);
    expect
      .soft(inlineKeyboard.boxes['.v-chat-compose']!.bottom)
      .toBeLessThanOrEqual(inlineKeyboard.boxes['.v-room-controls']!.top + 1);
    await expect(input).toBeFocused();
  }
});

test('separate synthetic API acknowledgement from draft availability', async ({ page }) => {
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoom(page);
  let delayedPosts = 0;
  await page.route('**/api/voice/rooms/responsive-fixture/events{,/}', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const event = route.request().postDataJSON();
    if (event.type !== 'message') return route.continue();
    delayedPosts++;
    const response = await route.fetch();
    const snapshot = await response.json();
    snapshot.cursor++;
    snapshot.messages.push({
      id: `synthetic-ack-${delayedPosts}`,
      userId: 'host',
      name: snapshot.me.name,
      image: null,
      text: event.text,
      createdAt: Date.now(),
      replyTo: null,
      pinned: false,
      reactions: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ response, json: snapshot });
  });
  const input = page.locator('#voice-message');
  await input.fill('synthetic-message-one');
  const started = performance.now();
  await page.locator('.v-send').click();
  await page.waitForTimeout(100);
  const duringAck = await input.evaluate((element: HTMLTextAreaElement) => ({
    disabled: element.disabled,
    value: element.value,
    focused: document.activeElement === element,
  }));
  if (!duringAck.disabled) await input.fill('synthetic-next-draft');
  await expect(page.locator('.v-message').filter({ hasText: 'synthetic-message-one' })).toHaveCount(
    1,
  );
  const deliveryMs = performance.now() - started;
  const afterAck = await input.evaluate((element: HTMLTextAreaElement) => ({
    disabled: element.disabled,
    value: element.value,
  }));
  await writeFile(
    path.join(output, 'delivery.json'),
    JSON.stringify(
      {
        stage,
        syntheticApiDelayMs: 800,
        deliveryMs,
        duringAck,
        afterAck,
        posts: delayedPosts,
        scope: 'Local API acknowledgement only; not network/SFU/receiver delivery.',
      },
      null,
      2,
    ),
  );
  expect(delayedPosts).toBe(1);
  if (stage !== 'before') {
    expect(duringAck.disabled).toBe(false);
    expect(duringAck.focused).toBe(true);
    expect(afterAck.value).toBe('synthetic-next-draft');
  }
});

test('room keyboard access and reduced-motion accessibility audit', async ({ page }) => {
  test.skip(stage === 'before', 'After interactions only; baseline stays observational.');
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoom(page);
  const toggle = page.locator('.v-room-controls .v-chat-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#voice-message')).toBeVisible();
  await page.locator('#voice-message').focus();
  await page.keyboard.type('keyboard draft');
  await expect(page.locator('#voice-message')).toHaveValue('keyboard draft');
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await writeFile(
    path.join(output, 'accessibility.json'),
    JSON.stringify(
      {
        browser: page.context().browser()?.version(),
        reducedMotion: 'reduce',
        violations: result.violations,
        incomplete: result.incomplete,
        scope:
          'Synthetic presentation fixture; keyboard Enter/Escape and focus return; not physical device.',
      },
      null,
      2,
    ),
  );
  expect(
    result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
});

test('pinned message and reply keep the composer reachable at medium text zoom', async ({
  page,
}) => {
  test.skip(stage === 'before', 'Targeted regression for the changed medium layout.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoom(page);
  await page.route(/\/api\/voice\/rooms\/responsive-fixture(?:\/events|\/join)?\/?$/, async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    snapshot.messages[0].pinned = true;
    await route.fulfill({ response, json: snapshot });
  });
  await page.reload();
  await page.locator('.v-pinned').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const first = page.locator('.v-message').first();
  await first.hover();
  await first.locator('.v-message-actions button').first().click();
  await expect(page.locator('.v-reply-preview')).toBeVisible();
  await textScale(page, true);
  await page.setViewportSize({ width: 1021, height: 768 });
  await page.waitForTimeout(180);
  const chat = page.locator('.v-chat');
  await chat.hover();
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(180);
  const result = await page.locator('.v-send').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const main = document.querySelector('.v-main')!.getBoundingClientRect();
    const chat = document.querySelector('.v-chat')!;
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      top: rect.top,
      bottom: rect.bottom,
      mainBottom: main.bottom,
      reachable: hit === element || element.contains(hit),
      chatOverflowY: getComputedStyle(chat).overflowY,
      chatScrollTop: chat.scrollTop,
    };
  });
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'pinned-reply-text200.json'), JSON.stringify(result, null, 2));
  await page.screenshot({ path: path.join(output, '1021x768-text200-pinned-reply.png') });
  expect(result.reachable).toBe(true);
  expect(result.bottom).toBeLessThanOrEqual(result.mainBottom + 1);
});

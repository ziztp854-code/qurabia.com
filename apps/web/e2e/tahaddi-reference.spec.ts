// Production room components, deterministic synthetic HTTP and media adapter.
// This verifies presentation and browser interactions, not authenticated SFU audio.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const evidence = path.resolve(process.cwd(), '../../docs/visual-evidence/tahaddi-live');
const sizes = [
  [320, 700],
  [390, 844],
  [430, 932],
  [1080, 1920],
  [1440, 900],
  [1920, 1080],
];

test('reference sizes preserve RTL, distinct seats and reachable room controls', async ({
  page,
}) => {
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', (route) =>
    /^(http:\/\/127\.0\.0\.1:3417\/|data:|blob:)/.test(route.request().url())
      ? route.continue()
      : route.abort(),
  );
  const records = [];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('.v-room-controls').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const dismiss = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
    if (await dismiss.isVisible()) await dismiss.click();
    await page.screenshot({
      path: path.join(evidence, `after-${width}x${height}.png`),
      fullPage: true,
    });
    const result = await page.evaluate(() => {
      const rect = (element: Element) => {
        const b = element.getBoundingClientRect();
        return {
          x: b.x,
          y: b.y,
          right: b.right,
          bottom: b.bottom,
          width: b.width,
          height: b.height,
        };
      };
      return {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        direction: getComputedStyle(document.documentElement).direction,
        overflowX: document.documentElement.scrollWidth > innerWidth,
        documentHeight: document.documentElement.scrollHeight,
        seats: [...document.querySelectorAll('.v-seat')]
          .filter((e) => e.getClientRects().length)
          .map(rect),
        stageColumn: rect(document.querySelector('.v-stage-column')!),
        controls: [...document.querySelectorAll('.v-room-controls button')]
          .filter((e) => e.getClientRects().length)
          .map((e) => ({
            name: e.getAttribute('aria-label') || e.textContent?.trim(),
            ...rect(e),
          })),
        brokenImages: [...document.images]
          .filter((i) => i.complete && !i.naturalWidth)
          .map((i) => i.currentSrc),
      };
    });
    records.push(result);
    expect.soft(result.direction, `RTL at ${width}`).toBe('rtl');
    expect.soft(result.overflowX, `horizontal page overflow at ${width}`).toBe(false);
    expect.soft(result.brokenImages, `assets at ${width}`).toEqual([]);
    if (width >= 1440) {
      result.seats.forEach((seat) => {
        expect
          .soft(seat.y, `seat top in stage at ${width}`)
          .toBeGreaterThanOrEqual(result.stageColumn.y - 1);
        expect
          .soft(seat.bottom, `seat bottom in stage at ${width}`)
          .toBeLessThanOrEqual(result.stageColumn.bottom + 1);
      });
    }
    for (const control of result.controls) {
      expect.soft(control.x, `${control.name} left at ${width}`).toBeGreaterThanOrEqual(0);
      expect
        .soft(control.right, `${control.name} right at ${width}`)
        .toBeLessThanOrEqual(width + 1);
      expect.soft(control.y, `${control.name} top at ${width}`).toBeGreaterThanOrEqual(0);
      expect
        .soft(control.bottom, `${control.name} bottom at ${width}`)
        .toBeLessThanOrEqual(height + 1);
      expect.soft(control.width, `${control.name} target width`).toBeGreaterThanOrEqual(44);
      expect.soft(control.height, `${control.name} target height`).toBeGreaterThanOrEqual(44);
    }
  }
  await writeFile(
    path.join(evidence, 'after-measurements.json'),
    JSON.stringify(
      {
        browser: page.context().browser()?.version(),
        records,
        errors,
        scope:
          'Actual VoiceRoomView, production CSS/assets, deterministic HTTP fixture, mocked AudioSession; Chromium DPR1, zoom100%, reduced motion; no real microphone/SFU, auth or physical-device proof.',
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

test('occupied nine-seat presentation remains usable', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/voice/rooms/**', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (data.room && data.participants) {
      data.room.seatCount = 9;
      data.participants = data.participants.map((person: Record<string, unknown>, i: number) => ({
        ...person,
        seatIndex: i,
        role: i === 0 ? 'host' : 'speaker',
        name: i === 0 ? 'مضيف تجريبي' : person.name,
        image: null,
      }));
      data.me = data.participants[0];
      data.room.hostName = data.me.name;
      data.room.hostImage = data.me.image;
      data.room.speakers = data.participants;
      await route.fulfill({ response, json: data });
    } else await route.fulfill({ response });
  });
  const records = [];
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('.v-room-controls').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const dismiss = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
    if (await dismiss.isVisible()) await dismiss.click();
    await expect(page.locator('.v-seat')).toHaveCount(9);
    await page.screenshot({
      path: path.join(evidence, `after-occupied-${width}x${height}.png`),
      fullPage: true,
    });
    const record = await page.evaluate(() => {
      const seats = [...document.querySelectorAll('.v-seat')].map((element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      });
      const overlaps = seats.flatMap((a, i) =>
        seats
          .slice(i + 1)
          .filter(
            (b) =>
              a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1,
          ),
      );
      return {
        width: innerWidth,
        height: innerHeight,
        seats,
        overlaps,
        overflowX: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect.soft(record.overlaps, `seat collision at ${width}`).toEqual([]);
    expect.soft(record.overflowX).toBe(false);
    records.push(record);
  }
  await writeFile(
    path.join(evidence, 'occupied-measurements.json'),
    JSON.stringify(
      {
        scope:
          'Synthetic nine-seat presentation only; absent profile photographs remain null. No illustrative substitute, real live user or video.',
        records,
      },
      null,
      2,
    ),
  );
});

test('mobile chat replies send once and restore focus after closing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.locator('.v-room-controls .v-chat-toggle');
  await toggle.waitFor();
  const dismiss = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
  if (await dismiss.isVisible()) await dismiss.click();
  await toggle.click();
  const dialog = page.getByRole('dialog', { name: 'دردشة الغرفة', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'الرد على نورة', exact: true }).click();
  const draft = dialog.getByRole('textbox', { name: 'رسالتك' });
  let outgoing = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/events\/?$/.test(request.url())) outgoing++;
  });
  await draft.fill('رد محلي لاختبار الواجهة 👏');
  expect(outgoing, 'typing remains local').toBe(0);
  const packet = page.waitForRequest((r) => r.method() === 'POST' && /\/events\/?$/.test(r.url()));
  await dialog.getByRole('button', { name: 'إرسال الرسالة', exact: true }).click();
  expect((await packet).postDataJSON()).toMatchObject({
    type: 'message',
    text: 'رد محلي لاختبار الواجهة 👏',
    replyTo: 'm1',
  });
  expect(outgoing).toBe(1);
  await expect(draft).toHaveValue('');
  await page.screenshot({ path: path.join(evidence, 'after-chat-reply-390x844.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(toggle).toBeFocused();
});

test('keyboard viewport and doubled Arabic text preserve composer and controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.locator('.v-room-controls .v-chat-toggle');
  await toggle.waitFor();
  const dismiss = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
  if (await dismiss.isVisible()) await dismiss.click();
  await toggle.click();
  const dialog = page.getByRole('dialog', { name: 'دردشة الغرفة', exact: true });
  await dialog.getByRole('textbox', { name: 'رسالتك' }).fill('لوحة مفاتيح محاكاة');
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, 'height', { value: 330, configurable: true });
    Object.defineProperty(viewport, 'offsetTop', { value: 20, configurable: true });
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
  });
  await expect(dialog.getByRole('button', { name: 'إرسال الرسالة', exact: true })).toBeInViewport();
  await page.screenshot({ path: path.join(evidence, 'after-keyboard-390.png') });
  const keyboard = await dialog.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, focused: element.contains(document.activeElement) };
  });
  expect(keyboard.top).toBeGreaterThanOrEqual(19);
  expect(keyboard.bottom).toBeLessThanOrEqual(351);
  expect(keyboard.focused).toBe(true);
  await page.evaluate(() => {
    delete (window.visualViewport as unknown as { height?: number }).height;
    delete (window.visualViewport as unknown as { offsetTop?: number }).offsetTop;
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const values = [...document.querySelectorAll<HTMLElement>('#root *')].map((element) => ({
      element,
      size: parseFloat(getComputedStyle(element).fontSize),
    }));
    values.forEach(({ element, size }) => {
      element.style.fontSize = `${size * 2}px`;
    });
  });
  const textZoom = await page.locator('.v-chat-compose textarea').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.clientHeight,
      required:
        parseFloat(style.lineHeight) +
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom),
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  await page.screenshot({ path: path.join(evidence, 'after-text200-1440.png') });
  expect(textZoom.overflowX).toBe(false);
  expect(textZoom.height).toBeGreaterThanOrEqual(textZoom.required - 1);
  await writeFile(
    path.join(evidence, 'keyboard-textzoom.json'),
    JSON.stringify(
      {
        keyboard,
        textZoom,
        limitation:
          'VisualViewport and computed font-size emulation, not physical-device keyboard/OS certification.',
      },
      null,
      2,
    ),
  );
});

test('mobile reference ratio renders at native 1080 by 1920 pixels', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3417/');
  await page.locator('.v-room-controls').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const dismiss = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.screenshot({ path: path.join(evidence, 'after-mobile-reference-1080x1920.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await context.close();
});

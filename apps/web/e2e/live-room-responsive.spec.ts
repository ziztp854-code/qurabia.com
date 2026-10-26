// Actual room presentation with synthetic HTTP data; never claims real audio/backend E2E.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VoiceSnapshot } from '../src/lib/voice/types';
const stage = process.env.LIVE_ROOM_STAGE || 'after';
const evidence = process.env.LIVE_ROOM_EVIDENCE_DIR
  ? path.resolve(process.env.LIVE_ROOM_EVIDENCE_DIR)
  : path.resolve(process.cwd(), '../../docs/visual-evidence/live-room-responsive');
const artifact = (name: string) =>
  path.join(evidence, stage === 'final' ? name.replace(/^after-/, 'final-') : name);
const viewports = [
  [320, 700],
  [375, 812],
  [390, 844],
  [430, 932],
  [768, 1024],
  [844, 390],
  [1020, 768],
  [1021, 768],
  [1279, 900],
  [1280, 900],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
];
test('room fits responsive viewports and keeps controls reachable', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    /^(http:\/\/127\.0\.0\.1:3417\/|data:|blob:)/.test(route.request().url())
      ? route.continue()
      : route.abort(),
  );
  await page.goto('/');
  await page.locator('.v-room-controls').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const entranceClose = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
  if (await entranceClose.isVisible()) await entranceClose.click();
  const results = [];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const result = await page.evaluate(() => {
      const bounds = (e: Element) => {
        const r = e.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      };
      const controls = [...document.querySelectorAll('.v-room-controls button')]
        .filter((e) => e.getClientRects().length)
        .map((e) => ({
          name: e.getAttribute('aria-label') || e.textContent?.trim(),
          ...bounds(e),
        }));
      const main = document.querySelector('.v-main');
      const room = document.querySelector('.v-room-scope');
      return {
        width: innerWidth,
        height: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth > innerWidth,
        direction: getComputedStyle(document.documentElement).direction,
        controls,
        main: main && bounds(main),
        room: room && bounds(room),
        brokenImages: [...document.images]
          .filter((i) => i.complete && !i.naturalWidth)
          .map((i) => i.currentSrc),
      };
    });
    results.push(result);
    await page.screenshot({
      path: artifact(`${stage}-${width}x${height}.png`),
      fullPage: true,
    });
    if (stage !== 'before') {
      expect.soft(result.overflowX, `overflow at ${width}`).toBe(false);
      expect.soft(result.direction).toBe('rtl');
      expect.soft(result.brokenImages).toEqual([]);
      for (const c of result.controls) {
        expect.soft(c.x, `${c.name} left at ${width}`).toBeGreaterThanOrEqual(0);
        expect.soft(c.right, `${c.name} right at ${width}`).toBeLessThanOrEqual(width + 1);
        expect.soft(c.y).toBeGreaterThanOrEqual(0);
        expect.soft(c.bottom).toBeLessThanOrEqual(height + 1);
        expect.soft(c.width, `${c.name} target width`).toBeGreaterThanOrEqual(44);
        expect.soft(c.height, `${c.name} target height`).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await writeFile(
    artifact(`${stage}-measurements.json`),
    JSON.stringify(
      {
        stage,
        scope:
          'Actual VoiceRoomView + production CSS/assets, synthetic snapshot/preferences and mocked AudioSession; local headless Chromium; DPR 1; zoom 100%; no authentication, microphone, SFU or physical device proof.',
        browser: page.context().browser()?.version(),
        results,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});

const afterOnly = stage !== 'before';
test('chat remains usable under keyboard viewport resize, focus and text zoom', async ({
  page,
}) => {
  test.skip(!afterOnly, 'Baseline screenshots are read-only.');
  const records = [];
  await page.goto('/');
  await page.locator('.v-room-controls').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const entrance = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
  if (await entrance.isVisible()) await entrance.click();
  for (const [width, height] of [
    [320, 700],
    [390, 844],
    [844, 390],
    [1020, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('.v-room-controls .v-chat-toggle').click();
    const dialog = page.getByRole('dialog', { name: 'دردشة الغرفة', exact: true });
    await expect(dialog).toBeVisible();
    const textbox = dialog.getByRole('textbox', { name: 'رسالتك' });
    await textbox.fill('اختبار تجاوب محلي');
    await expect(textbox).toBeFocused();
    const send = dialog.getByRole('button', { name: 'إرسال الرسالة', exact: true });
    await expect(send).toBeInViewport();
    const packet = page.waitForRequest(
      (request) => /\/events\/?$/.test(request.url()) && request.method() === 'POST',
    );
    await send.click();
    expect((await packet).postDataJSON()).toMatchObject({
      type: 'message',
      text: 'اختبار تجاوب محلي',
    });
    await expect(textbox).toHaveValue('');
    await textbox.fill('لوحة مفاتيح محاكاة');
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      Object.defineProperty(viewport, 'height', { value: 330, configurable: true });
      Object.defineProperty(viewport, 'offsetTop', { value: 20, configurable: true });
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(150);
    const result = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const compose = element.querySelector('.v-chat-compose')!.getBoundingClientRect();
      const button = element.querySelector('.v-send')!.getBoundingClientRect();
      const textarea = element.querySelector('textarea')!.getBoundingClientRect();
      return {
        dialog: { top: rect.top, bottom: rect.bottom },
        compose: { top: compose.top, bottom: compose.bottom },
        textarea: { top: textarea.top, bottom: textarea.bottom },
        send: { top: button.top, bottom: button.bottom },
        focused: element.contains(document.activeElement),
        scroll: getComputedStyle(element.querySelector('.v-messages')!).overflowY,
        viewportVar: getComputedStyle(element).getPropertyValue('--room-viewport-height'),
      };
    });
    records.push({ width, height, keyboardSimulation: result });
    expect.soft(result.dialog.top).toBeGreaterThanOrEqual(19);
    expect.soft(result.dialog.bottom).toBeLessThanOrEqual(351);
    expect.soft(result.send.bottom).toBeLessThanOrEqual(result.dialog.bottom);
    expect.soft(result.textarea.top).toBeGreaterThanOrEqual(result.dialog.top);
    expect.soft(result.focused).toBe(true);
    await page.screenshot({
      path: artifact(`after-keyboard-${width}x${height}.png`),
      fullPage: true,
    });
    await page.evaluate(() => {
      delete (window.visualViewport as unknown as { height?: number }).height;
      delete (window.visualViewport as unknown as { offsetTop?: number }).offsetTop;
      window.visualViewport!.dispatchEvent(new Event('resize'));
    });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.v-room-controls .v-chat-toggle')).toBeFocused();
  }
  await page.setViewportSize({ width: 320, height: 700 });
  const expandSeats = page.getByRole('button', { name: /عرض المقاعد الشاغرة/ });
  if (await expandSeats.count()) await expandSeats.click();
  await expect(page.locator('.v-seats')).toHaveAttribute('data-show-empty', 'true');
  const seats = await page
    .locator('.v-seat')
    .evaluateAll(
      (elements) => elements.filter((element) => element.getClientRects().length).length,
    );
  expect(seats).toBe(8);
  await page.screenshot({
    path: artifact('after-expanded-seats-320.png'),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const zoom = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > innerWidth,
    dockHeight: document.querySelector('.v-room-controls')!.getBoundingClientRect().height,
  }));
  expect.soft(zoom.overflowX).toBe(false);
  records.push({ textZoom200: zoom, visibleSeats: seats });
  await page.screenshot({
    path: artifact('after-text200-reduced-motion-320.png'),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  const cleanup = await page.evaluate(() => {
    const surface = document.querySelector('.v-room-scope') as HTMLElement;
    const before = surface.style.getPropertyValue('--room-viewport-height');
    window.dispatchEvent(new Event('live-room-fixture-unmount'));
    return {
      before,
      after: surface.style.getPropertyValue('--room-viewport-height'),
      remainingRoom: Boolean(document.querySelector('.v-room-controls')),
    };
  });
  expect(cleanup.before).not.toBe('');
  expect(cleanup.after).toBe('');
  expect(cleanup.remainingRoom).toBe(false);
  records.push({ cleanup });
  await writeFile(
    artifact('after-interactions.json'),
    JSON.stringify(
      {
        records,
        limitation:
          'Synthetic HTTP events and simulated visualViewport; no physical OS keyboard, backend or actual audio assertion.',
      },
      null,
      2,
    ),
  );
});

test('inline chat and desktop auxiliary controls remain reachable', async ({ page }) => {
  test.skip(!afterOnly, 'After checks only.');
  const records = [];
  await page.goto('/');
  await page.locator('.v-room-controls').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const entrance = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
  if (await entrance.isVisible()) await entrance.click();
  for (const [width, height] of [
    [320, 700],
    [390, 844],
    [1366, 768],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll('.v-main,.v-stage-column').forEach((element) => {
        element.scrollTop = 0;
      });
    });
    const textarea = page.locator('.v-chat-compose textarea');
    if (width === 390) await page.screenshot({ path: artifact('after-mobile-viewport-top.png') });
    await textarea.scrollIntoViewIfNeeded();
    const inline = await textarea.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const dock = document.querySelector('.v-room-controls')!.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        textarea: { top: rect.top, bottom: rect.bottom },
        dock: { top: dock.top, bottom: dock.bottom },
        hit: element === hit || element.contains(hit),
        windowScroll: scrollY,
      };
    });
    records.push({ width, height, inline });
    if (width === 390) {
      await textarea.click();
      await expect(textarea).toBeFocused();
      await page.screenshot({ path: artifact('after-mobile-viewport-compose.png') });
    }
    expect.soft(inline.hit, `inline textbox reachable at ${width}`).toBe(true);
    if (width > 1020) {
      const measure = () =>
        page.evaluate(() =>
          Object.fromEntries(
            ['.v-stage-column', '.v-stage', '.v-stage-note'].map((selector) => {
              const element = document.querySelector(selector) as HTMLElement | null;
              const rect = element?.getBoundingClientRect();
              const style = element && getComputedStyle(element);
              return [
                selector,
                element && {
                  top: rect?.top,
                  bottom: rect?.bottom,
                  height: rect?.height,
                  clientHeight: element.clientHeight,
                  scrollHeight: element.scrollHeight,
                  scrollTop: element.scrollTop,
                  overflowY: style?.overflowY,
                  flexShrink: style?.flexShrink,
                },
              ];
            }),
          ),
        );
      const initial = await measure();
      await page.locator('.v-stage-note').scrollIntoViewIfNeeded();
      const scrolled = await measure();
      await page.locator('.v-audio-session > summary').click();
      const expanded = await measure();
      const audio = await page.locator('.v-audio-session').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const dock = document.querySelector('.v-room-controls')!.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          dockTop: dock.top,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        };
      });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      const zoomed = await measure();
      await page.screenshot({
        path: artifact(`after-desktop-text200-audio-${width}.png`),
        fullPage: true,
      });
      records.push({ width, initial, scrolled, expanded, audio, zoomed });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      await page.locator('.v-audio-session > summary').click();
    }
  }
  await writeFile(artifact('after-inline-reachability.json'), JSON.stringify(records, null, 2));
});

test('long Arabic identity, speaking indicator and doubled text preserve usable layout', async ({
  page,
}) => {
  test.skip(!afterOnly, 'After stress check only.');
  await page.route('**/api/voice/rooms/**', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (data.room && data.participants) {
      const host = data.participants[0];
      host.name = 'عبدالعزيز بن سلطان بن عبدالرحمن العتيبي صاحب المجلس';
      host.accountBadges = ['verified', 'owner', 'sultan'];
      host.communityIdentity = {
        userId: host.id,
        accountNumber: 123456789012345,
        name: host.name,
        username: 'long-name',
        avatarUrl: null,
        badges: [],
        frame: null,
        effect: null,
        primaryBadge: null,
      };
      data.room.hostName = host.name;
      data.me = host;
      data.room.speakers = [host];
      await route.fulfill({ response, json: data });
    } else await route.fulfill({ response });
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.locator('.v-room-controls').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const entrance = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
  if (await entrance.isVisible()) await entrance.click();
  const seat = page.locator('.v-seat-person').first();
  const before = await seat.boundingBox();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('live-room-speaking', { detail: ['host'] })),
  );
  await expect(page.locator('.v-seat.is-speaking')).toBeVisible();
  const speaking = await seat.boundingBox();
  expect(speaking?.width).toBe(before?.width);
  expect(speaking?.height).toBe(before?.height);
  await page.screenshot({
    path: artifact('after-long-identity-speaking-320.png'),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const records = [];
  for (const [width, height] of [
    [320, 700],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    // Text-only zoom simulation: double computed font sizes in one batch; no CSS transform.
    await page.evaluate(() => {
      const elements = [...document.querySelectorAll<HTMLElement>('#root *')];
      const values = elements.map((element) => ({
        element,
        size: parseFloat(getComputedStyle(element).fontSize),
        original: element.style.fontSize,
      }));
      values.forEach(({ element, size, original }) => {
        element.dataset.fixtureFontSize = original;
        element.style.fontSize = `${size * 2}px`;
      });
    });
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > innerWidth,
      textarea: (() => {
        const element = document.querySelector('.v-chat-compose textarea') as HTMLTextAreaElement;
        const style = getComputedStyle(element);
        return {
          clientHeight: element.clientHeight,
          lineHeight: parseFloat(style.lineHeight),
          padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
        };
      })(),
      dock: [...document.querySelectorAll('.v-room-controls button')]
        .filter((e) => e.getClientRects().length)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
        }),
    }));
    expect.soft(result.overflowX, `200% computed text at ${width}`).toBe(false);
    expect
      .soft(result.textarea.clientHeight, `textarea line and padding fit at ${width}`)
      .toBeGreaterThanOrEqual(result.textarea.lineHeight + result.textarea.padding - 1);
    result.dock.forEach((rect) => {
      expect.soft(rect.top).toBeGreaterThanOrEqual(0);
      expect.soft(rect.bottom).toBeLessThanOrEqual(height);
      expect.soft(rect.left).toBeGreaterThanOrEqual(0);
      expect.soft(rect.right).toBeLessThanOrEqual(width);
    });
    await page.screenshot({
      path: artifact(`after-computed-text200-${width}.png`),
      fullPage: true,
    });
    const seatAtTextZoom = await page
      .locator('.v-seat-person')
      .first()
      .evaluate((element) => {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = element.getBoundingClientRect();
        const column = document.querySelector('.v-stage-column') as HTMLElement;
        const columnRect = column.getBoundingClientRect();
        const mainRect = document.querySelector('.v-main')!.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return {
          reachable: hit === element || element.contains(hit),
          visibleHeight: Math.max(
            0,
            Math.min(rect.bottom, columnRect.bottom, mainRect.bottom, innerHeight) -
              Math.max(rect.top, columnRect.top, mainRect.top, 0),
          ),
          seat: { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
          column: {
            top: columnRect.top,
            bottom: columnRect.bottom,
            clientHeight: column.clientHeight,
            scrollHeight: column.scrollHeight,
            scrollTop: column.scrollTop,
          },
        };
      });
    expect.soft(seatAtTextZoom.reachable, `seat reachable at 200% text and ${width}px`).toBe(true);
    expect
      .soft(seatAtTextZoom.visibleHeight, `visible seat target at ${width}px`)
      .toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: artifact(`final-text200-seat-reachability-${width}.png`) });
    await page.locator('.v-chat-compose textarea').fill('تحقق إرسال مع النص المكبر');
    const sendAtTextZoom = await page.locator('.v-send').evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
      (element as HTMLButtonElement).focus({ preventScroll: true });
      const rect = element.getBoundingClientRect();
      const dock = document.querySelector('.v-room-controls')!.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        reachable: element === hit || element.contains(hit),
        focused: document.activeElement === element,
        send: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        dock: { top: dock.top, bottom: dock.bottom, left: dock.left, right: dock.right },
        windowScroll: scrollY,
      };
    });
    expect.soft(sendAtTextZoom.reachable, `send reachable at 200% and ${width}px`).toBe(true);
    expect.soft(sendAtTextZoom.focused).toBe(true);
    await page.screenshot({ path: artifact(`final-text200-send-reachability-${width}.png`) });
    records.push({ width, height, textOnlyZoom: result, seatAtTextZoom, sendAtTextZoom });
    await page.evaluate(() =>
      document.querySelectorAll<HTMLElement>('[data-fixture-font-size]').forEach((element) => {
        element.style.fontSize = element.dataset.fixtureFontSize || '';
        delete element.dataset.fixtureFontSize;
      }),
    );
  }
  const colors = await page.evaluate(() =>
    Object.fromEntries(
      [
        '.v-chat',
        '.v-message-body',
        '.v-message-body > p',
        '.v-room-controls',
        '.v-room-controls button',
      ].map((selector) => {
        const element = document.querySelector(selector)!;
        const style = getComputedStyle(element);
        return [
          selector,
          {
            color: style.color,
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            outline: style.outline,
            borderColor: style.borderColor,
          },
        ];
      }),
    ),
  );
  await writeFile(
    artifact('after-stress.json'),
    JSON.stringify(
      {
        speakingGeometry: { before, speaking },
        records,
        computedColors: colors,
        limitation:
          'Computed-font-size doubling emulates text-only zoom; no physical browser/OS text scaling certification.',
      },
      null,
      2,
    ),
  );
});

test('arrival decoration preserves header and controls', async ({ page }) => {
  test.skip(!afterOnly, 'After checks only.');
  const records = [];
  for (const [width, height] of [
    [320, 700],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const arrival = page.getByRole('complementary', { name: 'ترحيب بالأعضاء' });
    await expect(arrival).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const record = await arrival.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const header = document.querySelector('.v-main > header')!.getBoundingClientRect();
      const dock = document.querySelector('.v-room-controls')!.getBoundingClientRect();
      return {
        arrival: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        header: { top: header.top, bottom: header.bottom },
        dock: { top: dock.top, bottom: dock.bottom },
        pointerEvents: getComputedStyle(element).pointerEvents,
        dismissPointerEvents: getComputedStyle(element.querySelector('button')!).pointerEvents,
      };
    });
    records.push({ width, height, ...record });
    await page.screenshot({ path: artifact(`after-active-arrival-${width}.png`) });
    expect
      .soft(record.arrival.top, `arrival below header at ${width}`)
      .toBeGreaterThanOrEqual(record.header.bottom);
    expect
      .soft(record.arrival.bottom, `arrival above dock at ${width}`)
      .toBeLessThanOrEqual(record.dock.top);
    expect.soft(record.arrival.left).toBeGreaterThanOrEqual(0);
    expect.soft(record.arrival.right).toBeLessThanOrEqual(width);
    const dismiss = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
    if (await dismiss.isVisible()) {
      await dismiss.click({ timeout: 1000 }).catch(async (error) => {
        if (await arrival.isVisible()) throw error;
      });
    }
    await expect(arrival).not.toBeVisible();
    if (width === 320) {
      const rows = await page
        .locator('.v-room-controls button')
        .evaluateAll(
          (elements) =>
            [
              ...new Set(
                elements
                  .filter((element) => element.getClientRects().length)
                  .map((element) => element.getBoundingClientRect().top),
              ),
            ].length,
        );
      expect(rows).toBe(1);
      await page.screenshot({ path: artifact('after-320x700.png'), fullPage: true });
      await page.screenshot({ path: artifact('after-normal-viewport-320.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: artifact('after-390x844.png'), fullPage: true });
    }
  }
  await writeFile(artifact('after-arrival.json'), JSON.stringify(records, null, 2));
});

test('final requested sizes keep expanded seats, chat and controls separate and reachable', async ({
  page,
}) => {
  test.skip(stage !== 'final', 'Dedicated final verification evidence.');
  const records = [];
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('.v-room-controls').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('complementary', { name: 'ترحيب بالأعضاء' })).not.toBeVisible({
      timeout: 5000,
    });
    await page.screenshot({ path: artifact(`final-requested-resting-${width}x${height}.png`) });
    const expandSeats = page.getByRole('button', { name: /عرض المقاعد الشاغرة/ });
    if (await expandSeats.count()) await expandSeats.click();
    const geometry = await page.evaluate(() => {
      const bounds = (element: Element) => {
        const r = element.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      };
      const intersects = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) =>
        a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1;
      const seats = [...document.querySelectorAll('.v-seat')]
        .filter((element) => element.getClientRects().length)
        .map(bounds);
      const stage = bounds(document.querySelector('.v-stage')!);
      const chat = bounds(document.querySelector('.v-chat')!);
      const dock = bounds(document.querySelector('.v-room-controls')!);
      const main = bounds(document.querySelector('.v-main')!);
      const avatars = [...document.querySelectorAll('.v-seat-avatar,.v-empty-seat > span')].map(
        bounds,
      );
      return {
        seats,
        avatars,
        stage,
        chat,
        dock,
        main,
        seatCollisions: seats.flatMap((a, i) => seats.slice(i + 1).filter((b) => intersects(a, b))),
        stageChatOverlap: intersects(stage, chat),
        pageOverflowX: document.documentElement.scrollWidth > innerWidth,
        documentHeight: document.documentElement.scrollHeight,
        dpr: devicePixelRatio,
        controls: [...document.querySelectorAll('.v-room-controls button')]
          .filter((element) => element.getClientRects().length)
          .map(bounds),
      };
    });
    expect(geometry.seats).toHaveLength(8);
    expect(geometry.seatCollisions).toEqual([]);
    expect(geometry.stageChatOverlap).toBe(false);
    expect(geometry.pageOverflowX).toBe(false);
    geometry.avatars.forEach((avatar) =>
      expect(Math.abs(avatar.width - avatar.height)).toBeLessThanOrEqual(1),
    );
    geometry.seats.forEach((seat) => {
      expect(seat.x).toBeGreaterThanOrEqual(geometry.stage.x - 1);
      expect(seat.right).toBeLessThanOrEqual(geometry.stage.right + 1);
    });
    geometry.controls.forEach((control) => {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.y).toBeGreaterThanOrEqual(0);
      expect(control.bottom).toBeLessThanOrEqual(height);
    });
    await page.screenshot({ path: artifact(`final-requested-expanded-${width}x${height}.png`) });
    const seatReachability = [];
    for (const seat of await page.locator('.v-empty-seat').all()) {
      await seat.scrollIntoViewIfNeeded();
      seatReachability.push(
        await seat.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return {
            reachable: element === hit || element.contains(hit),
            top: rect.top,
            bottom: rect.bottom,
          };
        }),
      );
    }
    expect(seatReachability.every((seat) => seat.reachable)).toBe(true);
    const textarea = page.locator('.v-chat-compose textarea');
    await textarea.scrollIntoViewIfNeeded();
    await textarea.click();
    await expect(textarea).toBeFocused();
    await textarea.fill('تحقق نهائي محلي');
    const composer = await textarea.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const dock = document.querySelector('.v-room-controls')!.getBoundingClientRect();
      return { reachable: hit === element, top: rect.top, bottom: rect.bottom, dockTop: dock.top };
    });
    expect(composer.reachable).toBe(true);
    expect(composer.bottom).toBeLessThanOrEqual(composer.dockTop + 1);
    await page.screenshot({ path: artifact(`final-requested-compose-${width}x${height}.png`) });
    let note: Record<string, number> | null = null;
    if (width > 1020) {
      await page.locator('.v-stage-note').scrollIntoViewIfNeeded();
      note = await page.locator('.v-stage-note').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const main = document.querySelector('.v-main')!.getBoundingClientRect();
        const column = document.querySelector('.v-stage-column')!.getBoundingClientRect();
        const dock = document.querySelector('.v-room-controls')!.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          mainTop: main.top,
          mainBottom: main.bottom,
          columnTop: column.top,
          columnBottom: column.bottom,
          dockTop: dock.top,
        };
      });
      expect(note.top).toBeGreaterThanOrEqual(note.mainTop - 1);
      expect(note.bottom).toBeLessThanOrEqual(note.dockTop + 1);
      if (width > 1020) expect(note.bottom).toBeLessThanOrEqual(note.columnBottom + 1);
      await page.screenshot({ path: artifact(`final-requested-note-${width}x${height}.png`) });
    }
    records.push({ width, height, geometry, seatReachability, composer, note });
  }
  await writeFile(
    artifact('final-browser-verification.json'),
    JSON.stringify(
      {
        browser: page.context().browser()?.version(),
        scope:
          'Actual VoiceRoomView and production CSS/assets, synthetic HTTP data and AudioSession adapter. Local Chromium, DPR1; no real microphone, SFU, hardware keyboard or physical-device validation.',
        records,
      },
      null,
      2,
    ),
  );
});

// Reconnection UX with synthetic HTTP and mocked media, never production WebRTC.
test('rejoin preserves draft reply and retry identity after a lost acknowledgement', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let snapshot: VoiceSnapshot | undefined;
  let revokeOnce = false;
  const writes = new Map<string, unknown>();
  const requestIds: string[] = [];
  await page.route('**/api/voice/rooms/responsive-fixture/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!snapshot) snapshot = await (await route.fetch()).json();
    if (!snapshot?.me) throw new Error('Fixture must return an admitted viewer');
    const current = snapshot;
    const self = snapshot.me;
    if (request.method() === 'POST' && url.pathname.endsWith('/events/')) {
      const event = request.postDataJSON();
      if (event.type === 'message') {
        requestIds.push(event.requestId);
        if (!writes.has(event.requestId)) {
          writes.set(event.requestId, event);
          snapshot = {
            ...snapshot,
            cursor: current.cursor + 1,
            messages: [
              ...current.messages,
              {
                id: `confirmed-${event.requestId}`,
                userId: self.id,
                name: self.name,
                image: null,
                text: event.text,
                replyTo: event.replyTo ?? null,
                createdAt: Date.now(),
                pinned: false,
                reactions: {},
              },
            ],
          };
          revokeOnce = true;
          await route.abort('failed');
          return;
        }
      }
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/events/') && revokeOnce) {
      revokeOnce = false;
      await route.fulfill({ status: 403, json: { error: 'انتهت جلسة الاختبار' } });
      return;
    }
    await route.fulfill({ json: snapshot });
  });
  await page.goto('/');
  await page.locator('.v-room-controls').waitFor();
  await page.locator('.v-chat-toggle').click();
  await page.getByRole('button', { name: 'الرد على عبدالعزيز بن سلطان', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'رسالتك', exact: true });
  await input.fill('مسودة مستمرة بعد إعادة الانضمام');
  await page.getByRole('button', { name: 'إرسال الرسالة', exact: true }).click();
  const rejoin = page.getByRole('button', { name: 'الانضمام للغرفة', exact: true });
  await expect(rejoin).toBeVisible();
  await expect(input).toHaveCount(0);
  await rejoin.click();
  await expect(input).toHaveValue('مسودة مستمرة بعد إعادة الانضمام');
  await expect(page.locator('.v-reply-preview')).toContainText('عبدالعزيز بن سلطان');
  expect(requestIds).toHaveLength(1); // Rejoining must never send automatically.
  await page.getByRole('button', { name: 'إرسال الرسالة', exact: true }).click();
  await expect(input).toHaveValue('');
  expect(requestIds).toHaveLength(2);
  expect(requestIds[1]).toBe(requestIds[0]);
  expect(writes.size).toBe(1);
  await expect(
    page.getByRole('log').getByText('مسودة مستمرة بعد إعادة الانضمام', { exact: true }),
  ).toHaveCount(1);
});

test('HTTP recovery clears only its Arabic connection status', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/voice/rooms/responsive-fixture/events/', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({ status: 500, json: { error: 'فشل إرسال تجريبي' } });
    else await route.continue();
  });
  await page.goto('/');
  await page.locator('.v-room-controls').waitFor();
  await page.locator('.v-chat-toggle').click();
  const input = page.getByRole('textbox', { name: 'رسالتك', exact: true });
  await input.fill('مسودة عند انقطاع الشبكة');
  await page.getByRole('button', { name: 'إرسال الرسالة', exact: true }).click();
  await expect(page.getByText('فشل إرسال تجريبي', { exact: true })).toBeAttached();
  await context.setOffline(true);
  const connection = page.getByText('انقطع تحديث الغرفة. نحاول إعادة الاتصال…', { exact: true });
  await expect(connection).toBeAttached({ timeout: 15000 });
  await context.setOffline(false);
  await expect(connection).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByText('فشل إرسال تجريبي', { exact: true })).toBeAttached();
  await expect(input).toHaveValue('مسودة عند انقطاع الشبكة');
});

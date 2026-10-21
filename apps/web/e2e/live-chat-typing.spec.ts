// Actual VoiceRoomView/CSS; mutable synthetic HTTP and the existing mocked AudioSession.
// These tests do not establish SFU, real microphone, physical keyboard or device behavior.
import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { VoiceEvent, VoiceSnapshot } from '../src/lib/voice/types';

const evidence = path.resolve(process.cwd(), '../../docs/performance-evidence/live-chat-typing/qa');

async function room(page: Page, viewport = { width: 1440, height: 900 }) {
  let snapshot: VoiceSnapshot;
  const posts: VoiceEvent[] = [];
  let eventReads = 0;
  await page.setViewportSize(viewport);
  await page.route('**/api/community/me', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: { settings: { entranceEnabled: true, reduceEffects: false } },
      },
    }),
  );
  await page.route('**/api/voice/rooms/responsive-fixture{,/events}', async (route) => {
    if (!snapshot) snapshot = (await (await route.fetch()).json()) as VoiceSnapshot;
    if (route.request().method() === 'POST') {
      const event = route.request().postDataJSON() as VoiceEvent;
      posts.push(event);
      if (event.type === 'message') {
        snapshot.cursor++;
        snapshot.messages.push({
          id: `qa-message-${snapshot.cursor}`,
          userId: 'host',
          name: snapshot.me!.name,
          image: null,
          text: event.text,
          createdAt: Date.now(),
          replyTo: event.replyTo || null,
          pinned: false,
          reactions: {},
        });
      }
    } else if (route.request().url().endsWith('/events')) eventReads++;
    await route.fulfill({ json: snapshot });
  });
  await page.goto('/');
  await page.locator('.v-room-controls').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const entrance = page.getByRole('button', { name: 'إخفاء شارة الدخول' });
  if (await entrance.isVisible()) await entrance.click();
  if (viewport.width <= 1020) await page.locator('.v-room-controls .v-chat-toggle').click();
  const input = page.getByRole('textbox', { name: 'رسالتك', exact: true });
  await expect(input).toBeVisible();
  await input.focus();
  return {
    input,
    posts,
    get snapshot() {
      return snapshot;
    },
    get eventReads() {
      return eventReads;
    },
  };
}

async function caret(page: Page) {
  return page.locator('#voice-message').evaluate((element: HTMLTextAreaElement) => ({
    value: element.value,
    start: element.selectionStart,
    end: element.selectionEnd,
    focused: document.activeElement === element,
  }));
}

async function save(name: string, data: Record<string, unknown>) {
  await mkdir(evidence, { recursive: true });
  const sourceSha256 = Object.fromEntries(
    await Promise.all(
      ['voice-chat.tsx', 'voice-room.tsx'].map(async (name) => [
        name,
        createHash('sha256')
          .update(await readFile(path.resolve(process.cwd(), 'src/components/voice', name)))
          .digest('hex'),
      ]),
    ),
  );
  await writeFile(
    path.join(evidence, `${name}.json`),
    JSON.stringify({ sourceSha256, ...data }, null, 2),
  );
}

test('rapid English/Arabic, native clipboard, deletion, caret and IME preserve draft and exactly-once send', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const app = await room(page);
  const hundred = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    .repeat(2)
    .slice(0, 100);
  await page.keyboard.type(hundred, { delay: 0 });
  await expect(app.input).toHaveValue(hundred);
  expect(await caret(page)).toMatchObject({ start: 100, end: 100, focused: true });
  // A real keyboard insertion into the middle must preserve the native caret.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const beforeInsert = await caret(page);
  await page.keyboard.insertText('ع');
  const afterInsert = await caret(page);
  expect(afterInsert.start).toBe(beforeInsert.start + 1);
  expect(afterInsert.end).toBe(afterInsert.start);
  await app.input.fill('');
  const arabic =
    'هذه رسالة عربية طويلة لاختبار الكتابة السلسة دون فقدان الحروف والتشكيل ١٢٣. '.repeat(10);
  await page.keyboard.insertText(arabic);
  await expect(app.input).toHaveValue(arabic);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const paste = 'لصق سريع — paste 123 ✨ '.repeat(20);
  await page.evaluate((text) => navigator.clipboard.writeText(text), paste);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+V');
  await expect(app.input).toHaveValue(paste);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await expect(app.input).toHaveValue('');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'اختبار', selectionStart: 6, selectionEnd: 6 });
  await cdp.send('Input.insertText', { text: 'اختبار' });
  await expect(app.input).toHaveValue('اختبار');
  await cdp.detach();
  expect(app.posts.filter((event) => event.type === 'message')).toHaveLength(0);
  await page.getByRole('button', { name: 'إرسال الرسالة', exact: true }).click();
  await expect(app.input).toHaveValue('');
  expect(app.posts.filter((event) => event.type === 'message')).toEqual([
    { type: 'message', text: 'اختبار' },
  ]);
  await expect(
    page
      .getByRole('log')
      .locator('article')
      .filter({ has: page.locator('p', { hasText: /^اختبار$/ }) }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
  await save('desktop-input', {
    browser: page.context().browser()?.version(),
    viewport: page.viewportSize(),
    rapidCharacters: hundred.length,
    arabicCharacters: arabic.length,
    pasteCharacters: paste.length,
    nativeClipboard: true,
    syntheticCDPIME: true,
    beforeInsert,
    afterInsert,
    posts: app.posts,
    errors,
  });
});

test('incoming message, multiple users, unmuted UI, animated active speaker and owner entrance do not interrupt typing', async ({
  page,
}) => {
  const app = await room(page);
  app.snapshot.me!.muted = false;
  app.snapshot.participants[0].muted = false;
  app.snapshot.cursor++;
  app.snapshot.messages.push({
    id: 'qa-incoming',
    userId: 'guest1',
    name: 'نورة',
    image: null,
    text: 'رسالة وصلت أثناء الكتابة',
    createdAt: Date.now(),
    replyTo: null,
    pinned: false,
    reactions: {},
  });
  app.snapshot.participants.push({
    ...app.snapshot.participants[1],
    id: 'royal-guest',
    name: 'المالك ضيف الاختبار',
    accountBadges: ['owner', 'verified'],
    joinedAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  app.snapshot.room.participantCount++;
  app.snapshot.room.listenerCount++;
  const text = 'الكتابة مستمرة أثناء وصول الرسائل ودخول الأعضاء وحركة المتحدث النشط. '.repeat(3);
  await page.evaluate(() => {
    (window as unknown as { qaSpeakingTimer?: number }).qaSpeakingTimer = window.setInterval(() => {
      window.dispatchEvent(new CustomEvent('live-room-speaking', { detail: ['host'] }));
    }, 160);
  });
  const updates: { kind: string; draftLength: number }[] = [];
  await Promise.all([
    page.keyboard.type(text, { delay: 25 }),
    expect(page.getByRole('log').getByText('رسالة وصلت أثناء الكتابة', { exact: true }))
      .toBeVisible({ timeout: 7000 })
      .then(async () => {
        updates.push({ kind: 'message', draftLength: (await app.input.inputValue()).length });
      }),
    expect(page.locator('[data-rank="owner"]'))
      .toBeVisible({ timeout: 7000 })
      .then(async () => {
        updates.push({
          kind: 'owner-entrance',
          draftLength: (await app.input.inputValue()).length,
        });
      }),
  ]);
  await expect(app.input).toHaveValue(text);
  for (const update of updates) {
    expect(update.draftLength).toBeGreaterThan(0);
    expect(update.draftLength).toBeLessThan(text.length);
  }
  expect(await caret(page)).toMatchObject({ start: text.length, end: text.length, focused: true });
  const speaker = page.locator('.v-seat.is-speaking');
  await expect(speaker).toHaveCount(1);
  const animation = await speaker.evaluate((element) => ({
    animations: element.getAnimations({ subtree: true }).map((animation) => ({
      playState: animation.playState,
      duration: animation.effect?.getTiming().duration,
    })),
    label: element.querySelector('button')?.getAttribute('aria-label'),
  }));
  expect(animation.animations.some((item) => item.playState === 'running')).toBe(true);
  expect(app.posts.filter((event) => event.type === 'message')).toHaveLength(0);
  await page.evaluate(() =>
    window.clearInterval((window as unknown as { qaSpeakingTimer?: number }).qaSpeakingTimer),
  );
  await save('concurrent-updates', {
    browser: page.context().browser()?.version(),
    characters: text.length,
    participantCount: app.snapshot.participants.length,
    heartbeatReads: app.eventReads,
    updates,
    animation,
    draft: await caret(page),
    audioScope:
      'UI muted=false and mocked AudioSession connected; no microphone capture, actual audio or SFU',
  });
});

test('390x844 focus and synthetic keyboard viewport retain text; desktop/mobile text at 200% preserves seats and controls', async ({
  page,
}) => {
  const app = await room(page, { width: 390, height: 844 });
  const text = 'نص عربي محفوظ عند فتح لوحة المفاتيح وإغلاقها';
  await page.keyboard.insertText(text);
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, 'height', { value: 330, configurable: true });
    Object.defineProperty(viewport, 'offsetTop', { value: 20, configurable: true });
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
  });
  await expect
    .poll(async () => app.input.evaluate((element) => element.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(351);
  await expect(app.input).toBeFocused();
  await expect(app.input).toHaveValue(text);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: path.join(evidence, 'after-keyboard-simulation-390x844.png') });
  await page.evaluate(() => {
    delete (window.visualViewport as unknown as { height?: number }).height;
    delete (window.visualViewport as unknown as { offsetTop?: number }).offsetTop;
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(app.input).toHaveValue(text);
  await expect(app.input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.v-room-controls .v-chat-toggle')).toBeFocused();
  const geometry = [];
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('live-room-speaking', { detail: ['host'] })),
    );
    await page.evaluate(() => {
      const root = document.documentElement;
      const computed = parseFloat(getComputedStyle(root).fontSize);
      root.style.fontSize = `${computed * 2}px`;
    });
    await page.locator('.v-seat-person').first().scrollIntoViewIfNeeded();
    const result = await page.evaluate(() => {
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
      const seat = document.querySelector('.v-seat-person')!;
      const main = document.querySelector('.v-main')!;
      const a = seat.getBoundingClientRect(),
        b = main.getBoundingClientRect();
      const seats = [...document.querySelectorAll('.v-seat')]
        .filter((el) => el.getClientRects().length)
        .map(bounds);
      const overlaps = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) =>
        a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1;
      return {
        width: innerWidth,
        height: innerHeight,
        fontSize: getComputedStyle(document.documentElement).fontSize,
        overflowX: document.documentElement.scrollWidth > innerWidth,
        visibleSeatHeight: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
        seat: bounds(seat),
        seatCollisions: seats.flatMap((a, i) => seats.slice(i + 1).filter((b) => overlaps(a, b))),
        avatarAspectRatios: [...document.querySelectorAll('.v-seat-avatar')].map((el) => {
          const r = el.getBoundingClientRect();
          return Math.abs(r.width - r.height);
        }),
        controls: [...document.querySelectorAll('.v-room-controls button')]
          .filter((el) => el.getClientRects().length)
          .map(bounds),
      };
    });
    expect(result.overflowX).toBe(false);
    expect(result.seatCollisions).toEqual([]);
    for (const difference of result.avatarAspectRatios) expect(difference).toBeLessThanOrEqual(1);
    expect(result.visibleSeatHeight).toBeGreaterThanOrEqual(44);
    for (const control of result.controls) {
      expect(control.x).toBeGreaterThanOrEqual(0);
      expect(control.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(control.bottom).toBeLessThanOrEqual(viewport.height + 1);
    }
    await page.screenshot({
      path: path.join(evidence, `after-text200-${viewport.width}x${viewport.height}.png`),
    });
    geometry.push(result);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
  }
  await save('mobile-and-text-zoom', {
    browser: page.context().browser()?.version(),
    dpr: 1,
    keyboard: 'Synthetic visualViewport resize only; physical OS keyboard untested',
    geometry,
  });
});

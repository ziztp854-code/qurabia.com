import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('../../docs/visual-evidence/voice-effects');
const effect = '[role="status"][data-effects-reduced] [data-gift]';
const endpoint = '/api/voice/rooms/responsive-fixture/events';
async function open(page: Page, viewer = 'host') {
  await page.goto(`/?viewer=${viewer}`);
  await page.locator('.v-room-controls').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function send(page: Page, giftId: string, viewer: string) {
  const response = await page.request.post(endpoint, {
    headers: { Cookie: `effects-viewer=${viewer}` },
    data: { type: 'gift', giftId, recipientId: 'host', requestId: crypto.randomUUID() },
  });
  expect(response.ok()).toBe(true);
}

test('two viewers: ordered burst, bounded effects, heart synchronization and reconnect deduplication', async ({
  browser,
}) => {
  await mkdir(output, { recursive: true });
  const first = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await first.newPage();
  const guest = await second.newPage();
  await Promise.all([open(host), open(guest, 'guest1')]);
  await host.evaluate(() => {
    (window as unknown as { giftOrder: string[] }).giftOrder = [];
    const observer = new MutationObserver(() => {
      const gift = document
        .querySelector('[role="status"][data-effects-reduced] [data-gift]')
        ?.getAttribute('data-gift');
      const record = (window as unknown as { giftOrder: string[] }).giftOrder;
      if (gift && record.at(-1) !== gift) record.push(gift);
    });
    observer.observe(document.body, { subtree: true, childList: true });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  });
  await send(host, 'crown', 'guest2');
  await expect(host.locator(effect)).toHaveAttribute('data-gift', 'crown');
  await expect(guest.locator(effect)).toHaveAttribute('data-gift', 'crown');
  await host.locator(`${effect} img`).evaluate((image: HTMLImageElement) => image.decode());
  await guest.locator(`${effect} img`).evaluate((image: HTMLImageElement) => image.decode());
  await host.waitForTimeout(350);
  await Promise.all([
    host.screenshot({ path: path.join(output, 'desktop-gift.png') }),
    guest.screenshot({ path: path.join(output, 'mobile-gift.png') }),
  ]);
  await send(host, 'car', 'guest3');
  await send(host, 'rose', 'guest4');
  await expect(host.locator(effect)).toHaveAttribute('data-gift', 'car', { timeout: 8000 });
  await expect(host.locator(effect)).toHaveAttribute('data-gift', 'rose', { timeout: 8000 });
  expect(
    await host.evaluate(() => (window as unknown as { giftOrder: string[] }).giftOrder),
  ).toEqual(['crown', 'car', 'rose']);
  expect(await host.locator(effect).count()).toBe(1);
  await host.getByRole('button', { name: 'إرسال قلوب' }).click();
  await expect(host.locator('[data-room-reactions] span')).toHaveCount(1);
  await expect(guest.locator('[data-room-reactions] span')).toHaveCount(1);
  await guest.screenshot({ path: path.join(output, 'mobile-hearts.png') });
  await guest.reload();
  await guest.locator('.v-room-controls').waitFor();
  await expect(guest.locator(effect)).toHaveCount(0);
  await guest.waitForTimeout(4200);
  await expect(guest.locator(effect)).toHaveCount(0);
  await expect(guest.locator('[data-room-reactions] span')).toHaveCount(0);
  const layout = [];
  for (const width of [320, 390, 1440]) {
    await host.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await host.waitForTimeout(120);
    layout.push(
      await host.evaluate(() => ({
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
      })),
    );
    await host.screenshot({ path: path.join(output, `${width}-room.png`), fullPage: true });
  }
  expect(layout.every((item) => !item.overflow)).toBe(true);
  await host.getByRole('button', { name: 'تخفيف المؤثرات', exact: true }).click();
  await expect(host.locator('[data-room-visible]')).toHaveAttribute('data-effects-reduced', 'true');
  await host.emulateMedia({ reducedMotion: 'reduce' });
  await host.locator('.v-gift-control').click();
  await expect(host.getByRole('dialog')).toBeVisible();
  await host.getByRole('radio', { name: /تنين/ }).check();
  await host
    .getByRole('dialog')
    .locator('[aria-label="معاينة الهدية"] img')
    .evaluate((image: HTMLImageElement) => image.decode());
  await host.waitForTimeout(120);
  await host.screenshot({ path: path.join(output, 'store.png') });
  await host.keyboard.press('Escape');
  await writeFile(
    path.join(output, 'browser-checks.json'),
    JSON.stringify(
      {
        browser: browser.version(),
        layout,
        scope:
          'Two isolated browser contexts, loopback HTTP, real room-state reducer, mocked AudioSession. Does not establish production SFU or physical device performance.',
      },
      null,
      2,
    ),
  );
  await first.close();
  await second.close();
});

test('audio rendering continues during a gift; mobile frame timing', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole('button', { name: 'إرسال قلوب' }).click();
  await page.evaluate(async () => {
    const context = new AudioContext();
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0.001;
    const destination = context.createMediaStreamDestination();
    const analyser = context.createAnalyser();
    oscillator.connect(gain);
    gain.connect(analyser);
    analyser.connect(destination);
    oscillator.start();
    (window as unknown as { effectAudio: unknown }).effectAudio = {
      samples: () => context.currentTime * context.sampleRate,
      live: () => destination.stream.getAudioTracks()[0].readyState,
      close: async () => {
        oscillator.stop();
        destination.stream.getTracks().forEach((track) => track.stop());
        await context.close();
      },
    };
  });
  const samples = () =>
    page.evaluate(() =>
      (window as unknown as { effectAudio: { samples: () => number } }).effectAudio.samples(),
    );
  await expect.poll(samples).toBeGreaterThan(0);
  const before = await samples();
  await send(page, 'dragon', 'guest5');
  await expect(page.locator(effect)).toHaveAttribute('data-gift', 'dragon');
  await page.locator(`${effect} img`).evaluate((image: HTMLImageElement) => image.decode());
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, 'mobile-dragon.png') });
  const timing = await page.evaluate(
    () =>
      new Promise<{ mean: number; p95: number; over50ms: number }>((resolve) => {
        const frames: number[] = [];
        let previous = performance.now();
        const tick = (now: number) => {
          frames.push(now - previous);
          previous = now;
          if (frames.length < 120) requestAnimationFrame(tick);
          else {
            const sorted = [...frames].sort((a, b) => a - b);
            resolve({
              mean: frames.reduce((a, b) => a + b) / frames.length,
              p95: sorted[Math.floor(sorted.length * 0.95)],
              over50ms: frames.filter((value) => value > 50).length,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  const after = await samples();
  expect(after).toBeGreaterThan(before);
  expect(
    await page.evaluate(() =>
      (window as unknown as { effectAudio: { live: () => string } }).effectAudio.live(),
    ),
  ).toBe('live');
  const hitTests = await page.locator('.v-room-controls button').evaluateAll((buttons) =>
    buttons
      .filter((button) => button.getClientRects().length)
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { name: button.textContent, reachable: button === hit || button.contains(hit) };
      }),
  );
  expect(hitTests.every((button) => button.reachable)).toBe(true);
  await page.evaluate(() =>
    (window as unknown as { effectAudio: { close: () => Promise<void> } }).effectAudio.close(),
  );
  await writeFile(
    path.join(output, 'audio-performance.json'),
    JSON.stringify(
      {
        browser: browser.version(),
        viewport: '390x844 DPR1, headless Chromium software rendering',
        renderedSamplesBefore: before,
        renderedSamplesAfter: after,
        timing,
        hitTests,
        scope:
          'Real WebAudio oscillator/gain/analyser rendering to a live MediaStreamDestination during a gift. Room AudioSession remains a fixture adapter. Local RTCPeerConnection had no ICE candidates in this environment; production LiveKit, microphone and physical-device performance remain unverified.',
      },
      null,
      2,
    ),
  );
});

test('reduced motion, mobile gift selection, accessibility and doubled text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.locator('.v-gift-control').click();
  await page.getByRole('radio', { name: /سيارة/ }).check();
  const animations = await page
    .getByRole('dialog')
    .locator('[data-effect-art="car"]')
    .first()
    .evaluate(
      (element) =>
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === 'running').length,
    );
  expect(animations).toBe(0);
  const audit = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: path.join(output, 'mobile-store-reduced.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLElement>('body *')];
    const sizes = elements.map((element) => parseFloat(getComputedStyle(element).fontSize));
    elements.forEach((element, index) =>
      element.style.setProperty('font-size', `${sizes[index] * 2}px`, 'important'),
    );
  });
  await page.screenshot({ path: path.join(output, 'mobile-text200.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await writeFile(
    path.join(output, 'accessibility.json'),
    JSON.stringify(
      {
        animationsUnderReducedMotion: animations,
        text200Width320Overflow: overflow,
        violations: audit.violations,
        incomplete: audit.incomplete,
        scope:
          'Gift dialog axe audit; computed text sizes doubled at 320px, not physical browser accessibility zoom.',
      },
      null,
      2,
    ),
  );
});

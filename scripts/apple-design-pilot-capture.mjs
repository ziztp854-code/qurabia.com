// Local, synthetic visual evidence only. Never targets a deployed service.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const { chromium, expect } = requireWeb('@playwright/test');
const { AxeBuilder } = requireWeb('@axe-core/playwright');
const stage = process.env.APPLE_DESIGN_STAGE;
if (!['before', 'after'].includes(stage))
  throw new Error('Set APPLE_DESIGN_STAGE=before or after.');
const origin = 'http://127.0.0.1:3400';
const output = path.join(root, 'docs/visual-evidence/apple-design-pilot');
const fixtureFile = '/tmp/apple-design-pilot-fixture.json';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    return url.startsWith(origin) || /^(data:|blob:)/.test(url) ? route.continue() : route.abort();
  });
  const csrf = (await (await context.request.get(`${origin}/api/auth/csrf`)).json()).csrfToken;
  await context.request.post(`${origin}/api/auth/callback/credentials`, {
    form: {
      csrfToken: csrf,
      email: 'owner@example.test',
      password: 'Qurabia-QA-2026!',
      json: 'true',
      callbackUrl: `${origin}/profile`,
    },
  });
  let fixture;
  if (stage === 'before') {
    const response = await context.request.post(`${origin}/api/voice/rooms`, {
      headers: { origin },
      data: {
        name: 'المجلس الملكي · تجربة التصميم',
        description: 'غرفة محلية ببيانات اختبار اصطناعية',
        seatCount: 6,
        cover: '/voice/covers/studio.webp',
      },
    });
    expect(response.status()).toBe(201);
    fixture = { roomId: (await response.json()).room.id };
    await writeFile(fixtureFile, JSON.stringify(fixture));
  } else fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
  const page = await context.newPage();
  async function chooseTheme(theme, surface) {
    const returnURL = page.url();
    // The full-screen voice stage hides the site theme menu; use the profile menu.
    if (surface === 'room') {
      await page.goto(`${origin}/profile`);
      await page.getByRole('button', { name: 'تعديل البروفايل', exact: true }).waitFor();
    }
    await page
      .getByRole('button', { name: /^المظهر الحالي:/ })
      .first()
      .click();
    await page
      .getByRole('menuitem', { name: theme === 'light' ? 'فاتح' : 'داكن', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForTimeout(200);
    if (surface === 'room') {
      await page.goto(returnURL);
      await page.locator('.v-seat').first().waitFor({ timeout: 60000 }).catch(async (error) => {
        console.error('Room return failed:', page.url(), await page.locator('body').innerText());
        await page.screenshot({ path: '/tmp/apple-design-room-return-failed.png' });
        throw error;
      });
      await page.waitForTimeout(3500);
    }
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const measurements = [];
  for (const [surface, route] of [
    ['room', `/voice/${fixture.roomId}`],
    ['profile', '/profile'],
    ['public-profile', '/people/1'],
  ]) {
    await page.goto(origin + route);
    if (surface === 'room') await page.locator('.v-seat').first().waitFor({ timeout: 60000 });
    else
      await page
        .getByText('عبدالعزيز · حساب اختبار', { exact: true })
        .first()
        .waitFor({ timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    if (stage === 'after' && surface === 'room') {
      await page.locator('[data-entrance-tier="royal"]').waitFor({ state: 'visible' });
      await page.waitForTimeout(850);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.screenshot({
          path: path.join(output, `after-room-active-entrance-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.waitForTimeout(3500);
    for (const width of stage === 'before' ? [390, 1440] : [320, 390, 430, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(100);
      const measure = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        brokenImages: [...document.images].filter((i) => i.complete && !i.naturalWidth).length,
        controls: [...document.querySelectorAll('.v-room-controls button')]
          .filter((e) => e.getClientRects().length)
          .map((e) => ({
            name: e.getAttribute('aria-label') || e.textContent.trim(),
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
          })),
      }));
      expect(measure.overflow, `${surface} at ${width}px`).toBe(false);
      expect(measure.brokenImages).toBe(0);
      for (const control of measure.controls) {
        expect(control.width, control.name).toBeGreaterThanOrEqual(44);
        expect(control.height, control.name).toBeGreaterThanOrEqual(44);
      }
      measurements.push({ stage, surface, width, ...measure });
      await page.screenshot({
        path: path.join(output, `${stage}-${surface}-${width}.png`),
        fullPage: true,
      });
    }
    if (stage === 'after') {
      await page.setViewportSize({ width: 390, height: 1000 });
      if (surface === 'profile') {
        const edit = page.getByRole('button', { name: 'تعديل البروفايل', exact: true });
        await edit.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).not.toBeVisible();
        await expect(edit).toBeFocused();
      }
      if (surface === 'public-profile') {
        for (const name of ['الشارات', 'الإنجازات', 'المقتنيات', 'الرئيسية']) {
          const tab = page.getByRole('button', { name, exact: true });
          if (await tab.count()) {
            await tab.click();
            await expect(tab).toHaveAttribute('aria-current', 'page');
          }
        }
      }
      const interactive = page
        .locator('main button, main a, .v-room-scope button')
        .filter({ visible: true })
        .first();
      await interactive.focus();
      await expect(interactive).toBeFocused();
      await page.keyboard.press('Tab');
      measurements.push({
        surface,
        keyboardFocusInsideApp: await page.evaluate(
          () => !!document.activeElement?.closest('main,.v-room-scope'),
        ),
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        `${surface} root font 200%`,
      ).toBe(false);
      await page.screenshot({
        path: path.join(output, `after-${surface}-text200-reduced-motion.png`),
        fullPage: true,
      });
      await page.evaluate(() => (document.documentElement.style.fontSize = ''));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const scope =
        surface === 'room'
          ? '.v-room-scope'
          : surface === 'profile'
            ? 'section[aria-labelledby="social-profile-name"]'
            : 'main';
      const audit = await new AxeBuilder({ page })
        .include(scope)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      measurements.push({
        surface,
        axeViolations: audit.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        })),
        axeIncomplete: audit.incomplete.map((v) => v.id),
      });
      await chooseTheme('light', surface);
      await page.screenshot({
        path: path.join(output, `after-${surface}-light-390.png`),
        fullPage: true,
      });
      const lightAudit = await new AxeBuilder({ page })
        .include(scope)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      measurements.push({
        surface,
        lightAxeViolations: lightAudit.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        })),
      });
      await chooseTheme('dark', surface);
      if (surface === 'room') {
        // Presentation-only speaking state: no audio capture or media-state mutation.
        await page
          .locator('.v-seat')
          .first()
          .evaluate((e) => e.classList.add('is-speaking'));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', {
          features: [
            { name: 'prefers-reduced-motion', value: 'reduce' },
            { name: 'prefers-reduced-transparency', value: 'reduce' },
          ],
        });
        const fallback = await page.locator('.v-room-controls').evaluate((e) => ({
          backdrop: getComputedStyle(e).backdropFilter,
          background: getComputedStyle(e).backgroundColor,
        }));
        expect(fallback.backdrop).toBe('none');
        const reducedSpeakingAnimation = await page
          .locator('.v-seat-avatar')
          .first()
          .evaluate((e) => getComputedStyle(e, '::after').animationName);
        expect(reducedSpeakingAnimation).toBe('none');
        measurements.push({ surface, reducedTransparency: fallback, reducedSpeakingAnimation });
        await page.screenshot({
          path: path.join(output, 'after-room-speaking-reduced-transparency.png'),
          fullPage: true,
        });
        await cdp.send('Emulation.setEmulatedMedia', { features: [] });
        await page
          .locator('.v-seat')
          .first()
          .evaluate((e) => e.classList.remove('is-speaking'));
      }
    }
  }
  expect(errors).toEqual([]);
  await writeFile(
    path.join(output, `${stage}-measurements.json`),
    JSON.stringify(
      { browser: browser.version(), dpr: 1, height: 1000, errors, measurements },
      null,
      2,
    ),
  );
  console.log(
    `${stage}: ${measurements.length} recorded checks; no overflow, broken images or page errors.`,
  );
} finally {
  await browser.close();
}

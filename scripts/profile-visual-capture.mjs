// Local, synthetic visual evidence only. Never targets a deployed service.
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const { chromium, expect } = requireWeb('@playwright/test');
const { AxeBuilder } = requireWeb('@axe-core/playwright');
const stage = process.env.PROFILE_VISUAL_STAGE;
if (!['before', 'after'].includes(stage))
  throw new Error('Set PROFILE_VISUAL_STAGE=before or after.');
const origin = 'http://127.0.0.1:3400';
const output = await mkdtemp(path.join(tmpdir(), 'tahaddi-profile-visual-'));
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
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
  const page = await context.newPage();
  async function chooseTheme(theme) {
    await page
      .getByRole('button', { name: /^المظهر الحالي:/ })
      .first()
      .click();
    await page
      .getByRole('menuitem', { name: theme === 'light' ? 'فاتح' : 'داكن', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForTimeout(200);
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const measurements = [];
  for (const [surface, route] of [
    ['profile', '/profile'],
    ['public-profile', '/people/1'],
  ]) {
    await page.goto(origin + route);
    await page
      .getByText('عبدالعزيز · حساب اختبار', { exact: true })
      .first()
      .waitFor({ timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(3500);
    for (const width of stage === 'before' ? [390, 1440] : [320, 390, 430, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(100);
      const measure = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        brokenImages: [...document.images].filter((i) => i.complete && !i.naturalWidth).length,
      }));
      expect(measure.overflow, `${surface} at ${width}px`).toBe(false);
      expect(measure.brokenImages).toBe(0);
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
        .locator('main button, main a')
        .filter({ visible: true })
        .first();
      await interactive.focus();
      await expect(interactive).toBeFocused();
      await page.keyboard.press('Tab');
      measurements.push({
        surface,
        keyboardFocusInsideApp: await page.evaluate(
          () => !!document.activeElement?.closest('main'),
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
        surface === 'profile' ? 'section[aria-labelledby="social-profile-name"]' : 'main';
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
      await chooseTheme('light');
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
      await chooseTheme('dark');
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
    `${measurements.length} profile visual checks recorded in ${output}.`,
  );
} finally {
  await browser.close();
}

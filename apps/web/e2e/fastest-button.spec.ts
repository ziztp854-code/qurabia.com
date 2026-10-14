import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createPrismaClient, type DatabaseClient } from '@tahaddi/database';
import { hashPassword } from '../src/lib/auth/password';
const databaseUrl = process.env.FASTEST_TEST_DATABASE_URL;
test.skip(
  !databaseUrl,
  'Requires an explicitly isolated local test database and running web/realtime/Redis servers.',
);
let db: DatabaseClient;
const ids: string[] = [];
const password = randomUUID() + 'Aa42!';
const evidenceDir = process.env.FASTEST_EVIDENCE_DIR;
test.beforeAll(async () => {
  const url = new URL(databaseUrl!);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/(test|review|e2e)/i.test(url.pathname)
  )
    throw new Error('Fastest E2E requires an isolated loopback test database.');
  db = createPrismaClient(databaseUrl!);
});
test.afterAll(async () => {
  if (db) {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
async function host(page: Page) {
  const email = `fastest-${randomUUID()}@example.test`;
  const id = `fastest_e2e_${randomUUID()}`;
  ids.push(id);
  await db.user.create({
    data: {
      id,
      email,
      name: 'مضيف المنافسة',
      passwordHash: await hashPassword(password),
      role: 'USER',
      status: 'ACTIVE',
    },
  });
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const signIn = await page.request.post('/api/auth/callback/credentials', {
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password,
      json: 'true',
      callbackUrl: '/games/fastest-button/host',
    },
  });
  expect(signIn.ok()).toBe(true);
  const session = await (await page.request.get('/api/auth/session')).json();
  expect(session.user?.email).toBe(email);
  await page.goto('/games/fastest-button/host/');
  await expect(page.getByRole('heading', { name: 'أهلًا، مضيف المنافسة' })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText('متصل بالخادم', { exact: true })).toBeVisible();
}
async function capture(page: Page, name: string, project: string) {
  if (!evidenceDir) return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${evidenceDir}/${name}-${project}.png`, fullPage: true });
}
async function join(
  browser: Browser,
  baseURL: string,
  code: string,
  name: string,
  mobile: boolean,
) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}/games/fastest-button/join/${code}/`);
  await expect(page.getByText('متصل بالخادم', { exact: true })).toBeVisible();
  await page.getByLabel('اسم اللاعب').fill(name);
  await page.getByRole('button', { name: 'انضم للسباق' }).click();
  await expect(page.getByRole('heading', { name: 'المنافسة تبدأ بكم' })).toBeVisible();
  return { context, page };
}
async function start(page: Page) {
  await page
    .getByRole('button', { name: /^(ابدأ الجولة|الجولة التالية|ابدأ الجولة الفاصلة)$/ })
    .click();
}
async function press(page: Page) {
  const button = page.getByRole('button', { name: 'اضغط زر المنافسة' });
  await expect(button).toBeEnabled({ timeout: 12000 });
  await button.click();
}
test('classic: authenticated host, mobile players, read-only OBS display, one winner and reconnect', async ({
  page,
  browser,
  baseURL,
}, info) => {
  const contexts: BrowserContext[] = [];
  try {
    await page.goto('/games/fastest-button/');
    await capture(page, 'entry', info.project.name);
    await host(page);
    await capture(page, 'host-create', info.project.name);
    await page.getByRole('button', { name: 'أنشئ غرفة المنافسة' }).click();
    await expect(page.getByRole('heading', { name: 'المنافسة تبدأ بكم' })).toBeVisible();
    const code = (await page
      .locator('[dir="ltr"]')
      .filter({ hasText: /^\d{6}$/ })
      .last()
      .textContent())!.trim();
    expect(code).toMatch(/^\d{6}$/);
    const first = await join(browser, baseURL!, code, 'ليان', true);
    contexts.push(first.context);
    const second = await join(browser, baseURL!, code, 'سلطان', false);
    contexts.push(second.context);
    await capture(page, 'host-lobby', info.project.name);
    await capture(first.page, 'player-lobby', info.project.name);
    const displayContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    contexts.push(displayContext);
    const display = await displayContext.newPage();
    await display.goto(`${baseURL}/games/fastest-button/display/${code}/`);
    await expect(display.getByRole('heading', { name: 'المنافسة تبدأ بكم' })).toBeVisible();
    expect(await display.getByRole('button', { name: 'ابدأ الجولة', exact: true }).count()).toBe(0);
    expect(await display.getByRole('navigation').count()).toBe(0);
    await capture(display, 'display-lobby', info.project.name);
    await start(page);
    await expect(first.page.getByRole('heading', { name: 'استعدّ… انتظر الإشارة' })).toBeVisible();
    await expect(first.page.getByRole('button', { name: 'اضغط زر المنافسة' })).toHaveCount(0);
    await capture(page, 'host-countdown', info.project.name);
    await expect(first.page.getByRole('button', { name: 'اضغط زر المنافسة' })).toBeEnabled({
      timeout: 12000,
    });
    await capture(first.page, 'player-active', info.project.name);
    await capture(second.page, 'player-active-wide', info.project.name);
    await press(first.page);
    for (const screen of [page, first.page, second.page, display]) {
      await expect(
        screen.getByRole('region', { name: 'إعلان الفائز' }).getByText('ليان', { exact: true }),
      ).toBeVisible();
    }
    await capture(page, 'host-winner', info.project.name);
    await capture(first.page, 'player-winner', info.project.name);
    await capture(second.page, 'player-winner-wide', info.project.name);
    await capture(display, 'display-winner-1080', info.project.name);
    expect(
      await display.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
    ).toBe(true);
    for (const [width, height, label] of [
      [2560, 1440, '1440'],
      [3840, 2160, '2160'],
    ] as const) {
      await display.setViewportSize({ width, height });
      await capture(display, `display-winner-${label}`, info.project.name);
      expect(await display.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await display.setViewportSize({ width: 390, height: 844 });
    await capture(display, 'display-winner-mobile', info.project.name);
    await first.context.setOffline(true);
    await expect(first.page.getByText('جارٍ الاتصال', { exact: true })).toBeVisible();
    await first.context.setOffline(false);
    await expect(first.page.getByText('متصل بالخادم', { exact: true })).toBeVisible({
      timeout: 12000,
    });
    await first.page.goto(`${baseURL}/games/fastest-button/`);
    await first.page.reload();
    await expect(
      first.page.getByRole('region', { name: 'إعلان الفائز' }).getByText('ليان', { exact: true }),
    ).toBeVisible();
    await start(page);
    const keyboardButton = second.page.getByRole('button', { name: 'اضغط زر المنافسة' });
    await expect(keyboardButton).toBeEnabled({ timeout: 12000 });
    await keyboardButton.focus();
    await second.page.keyboard.press('Space');
    await expect(
      page.getByRole('region', { name: 'إعلان الفائز' }).getByText('سلطان', { exact: true }),
    ).toBeVisible();
    for (const screen of [page, first.page]) {
      await screen.setViewportSize({ width: 320, height: 844 });
      expect(await screen.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await screen.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      expect(await screen.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await capture(
        screen,
        screen === page ? 'host-text-zoom' : 'player-text-zoom',
        info.project.name,
      );
    }
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test('points: two rounds tie the leaders, then a read-only broadcast shows the tiebreak champion', async ({
  page,
  browser,
  baseURL,
}, info) => {
  const contexts: BrowserContext[] = [];
  try {
    await host(page);
    await page.getByRole('radio', { name: /النقاط/ }).check();
    await page.getByLabel('عدد الجولات', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'أنشئ غرفة المنافسة' }).click();
    await expect(page.getByRole('heading', { name: 'المنافسة تبدأ بكم' })).toBeVisible();
    const code = (await page
      .locator('[dir="ltr"]')
      .filter({ hasText: /^\d{6}$/ })
      .last()
      .textContent())!.trim();
    const a = await join(browser, baseURL!, code, 'ليان', true);
    const b = await join(browser, baseURL!, code, 'سلطان', false);
    contexts.push(a.context, b.context);
    await start(page);
    await press(a.page);
    await expect(a.page.getByText(/سُجلت ضغطتك في المركز 1/)).toBeVisible();
    await press(b.page);
    await expect(page.getByRole('button', { name: 'الجولة التالية', exact: true })).toBeVisible();
    await capture(page, 'points-results', info.project.name);
    await start(page);
    await press(b.page);
    await expect(b.page.getByText(/سُجلت ضغطتك في المركز 1/)).toBeVisible();
    await press(a.page);
    await expect(page.getByRole('button', { name: 'ابدأ الجولة الفاصلة' })).toBeVisible();
    await capture(page, 'points-tie', info.project.name);
    await start(page);
    await press(b.page);
    await expect(page.getByRole('heading', { name: 'بطل المنافسة', exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'إعلان الفائز' }).getByText('سلطان', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'إعلان الفائز' }).getByText('17 نقطة'),
    ).toBeVisible();
    await capture(page, 'points-champion', info.project.name);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test('elimination: removes the last responder and enters a two-player final; stopped rounds do not eliminate', async ({
  page,
  browser,
  baseURL,
}, info) => {
  const contexts: BrowserContext[] = [];
  try {
    await host(page);
    await page.getByRole('radio', { name: /الإقصاء/ }).check();
    await page.getByRole('button', { name: 'أنشئ غرفة المنافسة' }).click();
    await expect(page.getByRole('heading', { name: 'المنافسة تبدأ بكم' })).toBeVisible();
    const code = (await page
      .locator('[dir="ltr"]')
      .filter({ hasText: /^\d{6}$/ })
      .last()
      .textContent())!.trim();
    const a = await join(browser, baseURL!, code, 'ليان', true);
    const b = await join(browser, baseURL!, code, 'سلطان', false);
    const c = await join(browser, baseURL!, code, 'نورة', true);
    contexts.push(a.context, b.context, c.context);
    await start(page);
    await page.getByRole('button', { name: 'أوقف الجولة' }).click();
    await expect(page.getByRole('heading', { name: 'الجولة ملغاة', exact: true })).toBeVisible();
    expect(await page.getByText('مقصى · يمكنك متابعة البطولة', { exact: true }).count()).toBe(0);
    await start(page);
    await press(a.page);
    await expect(a.page.getByText(/سُجلت ضغطتك في المركز 1/)).toBeVisible();
    await press(b.page);
    await expect(b.page.getByText(/سُجلت ضغطتك في المركز 2/)).toBeVisible();
    await press(c.page);
    await expect(c.page.getByText('مقصى · يمكنك متابعة البطولة', { exact: true })).toBeVisible();
    await capture(page, 'elimination-results', info.project.name);
    await start(page);
    await expect(page.getByText('الإقصاء · النهائي', { exact: true })).toBeVisible();
    await press(b.page);
    await press(a.page);
    await expect(page.getByRole('heading', { name: 'بطل المنافسة', exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'إعلان الفائز' }).getByText('سلطان', { exact: true }),
    ).toBeVisible();
    await capture(page, 'elimination-champion', info.project.name);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test('host route requires a real session', async ({ page }) => {
  await page.goto('/games/fastest-button/host/');
  await expect(page).toHaveURL(/auth\/sign-in.*next=/);
});

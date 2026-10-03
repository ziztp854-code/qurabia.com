import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { createPrismaClient, type DatabaseClient } from '@tahaddi/database';
import { hashPassword } from '../src/lib/auth/password';
import { defaultKingdomsConfig, resources } from '../src/lib/kingdoms/config';
import type { KingdomsView } from '../src/lib/kingdoms/types';

const password = randomUUID() + 'Aa42!';
const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;
test.skip(!databaseUrl, 'Requires an explicitly isolated local Kingdoms test database.');
let db: DatabaseClient;
const userIds: string[] = [];
const worldIds: string[] = [];

test.beforeAll(async () => {
  const target = new URL(databaseUrl!);
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(target.pathname) ||
    target.search ||
    target.hash
  )
    throw new Error('Refusing to seed a non-isolated database.');
  db = createPrismaClient(databaseUrl!);
  await db.$connect();
});

test.afterAll(async () => {
  if (!db) return;
  try {
    await db.kingdomCommand.deleteMany({ where: { worldId: { in: worldIds } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await db.kingdomWorld.deleteMany({ where: { id: { in: worldIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await db.$disconnect();
  }
});

async function signIn(request: APIRequestContext, email: string) {
  const csrf = await request.get('/api/auth/csrf');
  const { csrfToken } = await csrf.json();
  const result = await request.post('/api/auth/callback/credentials', {
    form: { csrfToken, email, password, json: 'true', callbackUrl: '/games/kingdoms' },
  });
  expect(result.ok()).toBeTruthy();
  const session = await request.get('/api/auth/session');
  expect((await session.json()).user.email).toBe(email);
}

test('administrator opens a world; a signed-in player builds and trains with persisted results', async ({
  page,
  playwright,
  baseURL,
}, testInfo) => {
  const suffix = randomUUID();
  const adminEmail = `kingdom-admin-${suffix}@example.test`;
  const playerEmail = `kingdom-player-${suffix}@example.test`;
  const passwordHash = await hashPassword(password);
  for (const [email, role] of [
    [adminEmail, 'ADMIN'],
    [playerEmail, 'USER'],
  ] as const) {
    const id = `kingdom_e2e_${randomUUID()}`;
    userIds.push(id);
    await db.user.create({
      data: {
        id,
        email,
        name: 'اختبار الممالك',
        role,
        status: 'ACTIVE',
        passwordHash,
        tokenVersion: 0,
      },
    });
  }
  const admin = await playwright.request.newContext({ baseURL });
  await signIn(admin, adminEmail);
  const config = {
    ...defaultKingdomsConfig,
    secondsPerTile: 3,
    baseProduction: resources(),
    buildings: Object.fromEntries(
      Object.entries(defaultKingdomsConfig.buildings).map(([key, value]) => [
        key,
        { ...value, seconds: 1 },
      ]),
    ),
    units: Object.fromEntries(
      Object.entries(defaultKingdomsConfig.units).map(([key, value]) => [
        key,
        { ...value, seconds: 1 },
      ]),
    ),
  };
  const create = await admin.post('/api/admin/kingdoms', {
    headers: { Origin: baseURL! },
    data: {
      action: 'create',
      idempotencyKey: randomUUID(),
      name: `عالم الاختبار ${suffix.slice(0, 8)}`,
      config,
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  const worldId = (await create.json()).data.id as string;
  worldIds.push(worldId);
  const neighbor = await admin.post('/api/kingdoms', {
    headers: { Origin: baseURL! },
    data: {
      worldId,
      idempotencyKey: randomUUID(),
      command: { type: 'found', name: 'مملكة الجوار' },
    },
  });
  expect(neighbor.ok(), await neighbor.text()).toBeTruthy();
  await admin.dispose();

  // Block only external requests; all game, authentication and database traffic is real.
  await page.context().route('**/*', (route) => {
    const target = new URL(route.request().url());
    return target.hostname === '127.0.0.1' || target.hostname === 'localhost'
      ? route.continue()
      : route.abort();
  });
  await page.goto('/auth/sign-in/?next=%2Fgames%2Fkingdoms');
  await page.getByLabel('البريد الإلكتروني').fill(playerEmail);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'دخول بالبريد' }).click();
  await expect(page).toHaveURL(/\/games\/kingdoms\/?$/);
  await page.getByLabel('العالم والموسم').selectOption(worldId);
  await page.getByLabel('اسم المملكة').fill('مملكة الرحلة الحقيقية');
  await page.getByRole('button', { name: 'أسّس مملكتي' }).click();
  await expect(page.getByRole('region', { name: 'موارد القرية' })).toBeVisible();
  const read = async () => {
    const result = await page.request.get(`/api/kingdoms?worldId=${worldId}`);
    expect(result.ok()).toBeTruthy();
    return (await result.json()).data as KingdomsView;
  };
  const initial = await read();
  expect(initial.villages).toHaveLength(1);
  await page.getByRole('button', { name: 'القرية', exact: true }).click();
  const villageMap = page.getByRole('region', { name: 'خريطة القرية' });
  await expect(villageMap).toBeVisible();
  await expect
    .poll(() =>
      villageMap
        .locator('img')
        .first()
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await expect(villageMap.getByRole('button', { name: /^الثكنة، لم يُبنَ$/ })).toHaveCount(1);
  await expect(villageMap.getByRole('button', { name: /^الإسطبل،/ })).toHaveCount(1);
  await villageMap.getByRole('button', { name: /^الثكنة، لم يُبنَ$/ }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: testInfo.outputPath('kingdoms-authenticated-village.png'),
    fullPage: true,
  });
  const barracks = page.getByRole('article', { name: 'المبنى المختار: الثكنة' });
  await barracks.getByRole('button', { name: 'ابنِ المبنى', exact: true }).click();
  await expect.poll(async () => (await read()).villages[0].buildings.barracks).toBe(1);
  await page.reload();
  await page.getByLabel('العالم والموسم').selectOption(worldId);
  await page.getByRole('button', { name: 'الجيش', exact: true }).click();
  await page.getByLabel('عدد حارس').fill('2');
  const guard = page.locator('article').filter({ has: page.getByLabel('عدد حارس') });
  await guard.getByRole('button', { name: 'درّب الوحدات' }).click();
  await expect.poll(async () => (await read()).villages[0].troops.guard).toBe(2);
  const final = await read();
  expect(final.villages[0].resources.wood).toBe(
    initial.villages[0].resources.wood -
      config.buildings.barracks.cost.wood -
      config.units.guard.cost.wood * 2,
  );
  const commanders = page.getByRole('region', { name: 'الأمراء والقادة', exact: true });
  await expect(commanders).toBeVisible();
  await commanders.getByLabel('اسم القائد').fill('بيبرس الرحلة');
  await commanders.getByLabel('تخصص القائد').selectOption('infantry');
  await commanders.getByRole('button', { name: 'وظّف القائد', exact: true }).click();
  await expect.poll(async () => (await read()).commanders?.length).toBe(1);
  const commanderId = (await read()).commanders![0].id;
  await expect(
    commanders.getByRole('heading', { name: 'بيبرس الرحلة', exact: true }),
  ).toBeVisible();
  await commanders.getByRole('button', { name: 'عيّن للدفاع هنا', exact: true }).click();
  await expect.poll(async () => (await read()).villages[0].commanderId).toBe(commanderId);
  await commanders.getByRole('button', { name: 'أخلِ التعيين', exact: true }).click();
  await expect.poll(async () => (await read()).commanders![0].status).toBe('available');
  await page.reload();
  await page.getByLabel('العالم والموسم').selectOption(worldId);
  await page.getByRole('button', { name: 'الجيش', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'بيبرس الرحلة', exact: true })).toBeVisible();
  const rejected = await page.request.post('/api/admin/kingdoms', {
    headers: { Origin: baseURL! },
    data: { action: 'pause', worldId, idempotencyKey: randomUUID(), paused: true },
  });
  expect(rejected.status()).toBe(403);
  await page.reload();
  await page.getByLabel('العالم والموسم').selectOption(worldId);
  await page.getByRole('button', { name: 'خريطة العالم', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'خريطة العالم', exact: true })).toBeVisible();
  await page.getByLabel('قائد الحملة').selectOption(commanderId);
  await expect(page.getByLabel('قائد الحملة')).toHaveValue(commanderId);
  await page.getByRole('button', { name: 'تكبير الخريطة', exact: true }).click();
  await page.getByRole('button', { name: 'تحريك الخريطة شرقًا', exact: true }).click();
  await page.getByRole('button', { name: 'تصغير الخريطة', exact: true }).click();
  const other = initial.map.find((item) => item.ownerId !== initial.player!.id)!;
  await page.getByLabel('ابحث عن قرية أو مملكة').fill('مملكة الجوار');
  await page.getByRole('button', { name: `اعرض ${other.name} على الخريطة` }).click();
  await expect(
    page.getByRole('button', { name: `${other.name}، X ${other.x}، Y ${other.y}` }),
  ).toHaveAttribute('aria-pressed', 'true');
  const destinationBounds = await page
    .getByRole('button', { name: `${other.name}، X ${other.x}، Y ${other.y}` })
    .boundingBox();
  expect(destinationBounds?.width).toBeGreaterThanOrEqual(44);
  expect(destinationBounds?.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('region', { name: 'خريطة الأراضي', exact: true }).screenshot({
    path: testInfo.outputPath('kingdoms-terrain-map.png'),
    // Keep the sticky site header from obscuring the isolated map capture.
    style: '.site-header { visibility: hidden !important; }',
  });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: testInfo.outputPath('kingdoms-authenticated-map.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: /^غابة الخشب،.*X 2، Y 2$/ }).click();
  const gathering = page.getByRole('region', { name: 'جمع الموارد', exact: true });
  await gathering.getByLabel('قائد الحملة').selectOption(commanderId);
  await gathering.getByLabel(/^حارس \(/).fill('1');
  await gathering.getByRole('button', { name: 'أرسل الجيش لجمع الموارد', exact: true }).click();
  await expect
    .poll(async () =>
      (await read()).movements.some((movement) => movement.commanderId === commanderId),
    )
    .toBe(true);
  await expect.poll(async () => (await read()).commanders![0].status).toBe('marching');
  await expect(
    gathering.getByLabel('قائد الحملة').getByRole('option', { name: /بيبرس الرحلة/ }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await read()).commanders![0].status, { timeout: 40000 })
    .toBe('available');
  expect((await read()).villages[0].troops.guard).toBe(2);
  await page.getByRole('button', { name: 'الجيش', exact: true }).click();
  // The existing client refreshes every 15 seconds when realtime is unavailable.
  // Verify the displayed state catches up with the authoritative return as well.
  await expect(commanders.getByText('متاح', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(
    commanders.getByRole('button', { name: 'عيّن للدفاع هنا', exact: true }),
  ).toBeEnabled();
  await commanders.getByRole('heading', { name: 'الأمراء والقادة', exact: true }).click();
  await page.getByRole('region', { name: 'الأمراء والقادة', exact: true }).screenshot({
    path: testInfo.outputPath('kingdoms-commanders.png'),
    style: '.site-header { visibility: hidden !important; }',
  });
});

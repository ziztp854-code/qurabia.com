import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createPrismaClient, type DatabaseClient, type Prisma } from '@tahaddi/database';
import { hashPassword } from '../src/lib/auth/password';
import { createWorld, executeCommand } from '../src/lib/kingdoms/engine';
import { resources } from '../src/lib/kingdoms/config';
import { emptyTroops } from '../src/lib/kingdoms/simulation';
import { withAbandonedVillages } from '../src/lib/kingdoms/abandoned-village-layout';
import { abandonedPlacementDomain } from '../src/lib/kingdoms/abandoned-village-geography';
import mask from '../src/lib/kingdoms/data/abandoned-middle-east-geography.json';
import {
  ABANDONED_ROLLOUT_WORLD_ID,
  ABANDONED_ROLLOUT_WORLD_NAME,
} from '../src/lib/kingdoms/abandoned-village-policy';
import type { WorldView } from '../src/components/kingdoms/shared';
const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL!;
let db: DatabaseClient;
const users: string[] = [];
test.beforeAll(async () => {
  const target = new URL(databaseUrl);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(target.pathname) ||
    target.search ||
    target.hash
  )
    throw new Error('Isolated local database only');
  db = createPrismaClient(databaseUrl);
  await db.$connect();
});
test.afterEach(async () => {
  await db.kingdomCommand.deleteMany({ where: { worldId: ABANDONED_ROLLOUT_WORLD_ID } });
  await db.kingdomWorld.deleteMany({ where: { id: ABANDONED_ROLLOUT_WORLD_ID } });
  await db.user.deleteMany({ where: { id: { in: users } } });
});
test.afterAll(async () => {
  await db.$disconnect();
});
test('real sign-in, world map marker and five-resource collection use the production player route', async ({
  page,
}, testInfo) => {
  const id = `abandoned_e2e_${randomUUID()}`,
    email = `${id}@example.test`,
    password = `${randomUUID()}Aa42!`;
  users.push(id);
  await db.user.create({
    data: {
      id,
      email,
      name: 'لاعب اختبار محلي',
      role: 'USER',
      status: 'ACTIVE',
      tokenVersion: 0,
      passwordHash: await hashPassword(password),
    },
  });
  const [{ now }] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  let state = createWorld(now!.getTime());
  state.config.secondsPerTile = 0.01;
  state.config.baseProduction = resources();
  state.config.units.guard = { ...state.config.units.guard, speed: 100, upkeep: 0 };
  state = executeCommand(state, id, { type: 'found', name: 'قرية اختبار محلية' }, now!.getTime());
  const home = Object.values(state.villages)[0]!;
  home.troops = { ...emptyTroops(), guard: 20 };
  home.resources = resources();
  home.buildings.warehouse = 20;
  state = withAbandonedVillages(
    state,
    ABANDONED_ROLLOUT_WORLD_ID,
    'production_e2e_isolated_seed',
    abandonedPlacementDomain(mask),
    [{ longitude: 31.24967, latitude: 30.06263 }],
    'kingdom-world',
  );
  await db.kingdomWorld.create({
    data: {
      id: ABANDONED_ROLLOUT_WORLD_ID,
      name: ABANDONED_ROLLOUT_WORLD_NAME,
      state: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue,
      nextEventAt: new Date(state.season.endsAt),
    },
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // A separate loopback address keeps other tasks' 127.0.0.1:3000 untouched.
  // Chrome alone resolves localhost to this fixture; the app's existing local auth rules apply.
  await page.goto('/auth/sign-in/?next=%2Fgames%2Fkingdoms');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'دخول بالبريد', exact: true }).click();
  await expect(page).toHaveURL(/\/games\/kingdoms\/?$/);
  expect(
    await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user.email),
  ).toBe(email);
  const read = async () => {
    return (await page.evaluate(async (worldId) => {
      const response = await fetch(`/api/kingdoms?worldId=${worldId}`, { cache: 'no-store' }),
        body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(`Kingdoms read failed: ${response.status}`);
      return body.data;
    }, ABANDONED_ROLLOUT_WORLD_ID)) as WorldView;
  };
  const initial = await read();
  expect(initial.abandonedVillages).toHaveLength(48);
  await page.goto(
    `/games/kingdoms/world-map/?worldId=${ABANDONED_ROLLOUT_WORLD_ID}&villageId=${home.id}`,
  );
  const panel = page.getByRole('region', { name: 'القرى المهجورة', exact: true });
  await expect(panel.getByRole('heading', { name: 'القرى المهجورة · ٤٨' })).toBeVisible();
  const directory = panel.getByRole('group', { name: 'دليل القرى المهجورة' });
  const row = directory.getByRole('button').first();
  await row.click();
  const gather = panel.getByRole('region', { name: 'جمع موارد القرية المهجورة' });
  await expect(gather).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('real-player-selected.png'), fullPage: true });
  await panel.getByRole('button', { name: 'إغلاق تفاصيل القرية' }).click();
  await expect(gather).toBeHidden();
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
  await expect(gather).toBeVisible();
  await gather
    .getByRole('spinbutton', { name: new RegExp(state.config.units.guard.name) })
    .fill('10');
  const [commandResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        (response.status()<300 || response.status()>=400) &&
        /^\/api\/kingdoms\/?$/.test(new URL(response.url()).pathname),
    ),
    gather.getByRole('button', { name: 'إرسال بعثة جمع' }).click(),
  ]);
  expect(commandResponse.ok(), await commandResponse.text()).toBeTruthy();
  const body = commandResponse.request().postDataJSON();
  expect(body.worldId).toBe(ABANDONED_ROLLOUT_WORLD_ID);
  expect(body.command.targetId).toBe(initial.abandonedVillages![0]!.id);
  expect(body.command).not.toHaveProperty('targetX');
  expect(body.command).not.toHaveProperty('stock');
  await expect
    .poll(
      async () => {
        const view = await read();
        return {
          movements: view.movements.length,
          resources: view.villages[0]!.resources,
          troops: view.villages[0]!.troops.guard,
        };
      },
      { timeout: 15000 },
    )
    .toEqual({ movements: 0, resources: resources(80, 80, 80, 80, 80), troops: 20 });
  const returned = await read();
  expect(
    returned.abandonedVillages!.map((site) => ({
      id: site.id,
      longitude: site.longitude,
      latitude: site.latitude,
    })),
  ).toEqual(
    initial.abandonedVillages!.map((site) => ({
      id: site.id,
      longitude: site.longitude,
      latitude: site.latitude,
    })),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.reload();
  await expect(panel.getByRole('heading', { name: 'القرى المهجورة · ٤٨' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('real-player-returned.png'), fullPage: true });
});

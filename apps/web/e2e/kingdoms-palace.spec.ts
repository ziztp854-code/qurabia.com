import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createPrismaClient } from '@tahaddi/database';
import { randomUUID } from 'node:crypto';
import { createWorld, executeCommand } from '../src/lib/kingdoms/engine';
import { hashPassword } from '../src/lib/auth/password';
const base = 'http://127.0.0.1:3000';
const dbUrl = process.env.KINGDOMS_TEST_DATABASE_URL ?? '';
test.skip(!dbUrl, 'Requires an explicitly isolated local Kingdoms test database.');
const suffix = randomUUID(), worldId = `palace-test-${suffix}`, alice = `palace-alice-${suffix}`, bob = `palace-bob-${suffix}`;
const password = randomUUID() + 'Aa42!';
const data = (slots: unknown[]) => ({ worldId, villageId: 'v1', slots });
async function signIn(request: APIRequestContext, player: string) {
  const csrf = await request.get('/api/auth/csrf');
  expect(csrf.ok()).toBeTruthy(); const { csrfToken } = await csrf.json();
  const result = await request.post('/api/auth/callback/credentials', { form: { csrfToken,
    email: `${player}@example.test`, password, json: 'true', callbackUrl: '/games/kingdoms' } });
  expect(result.ok()).toBeTruthy();
  expect((await (await request.get('/api/auth/session')).json()).user.id).toBe(player);
}
async function enter(page: Page) {
  const hit = await page.locator('[aria-label^="دار الحكم، المستوى"]').boundingBox(); expect(hit).not.toBeNull();
  await page.mouse.click(hit!.x + hit!.width / 2, hit!.y + hit!.height / 2);
  const scene = page.locator('[data-city-scene="palace"]');
  await expect(scene).toHaveAttribute('data-phase', 'active');
  await expect(scene.locator('[data-sultan-palace]')).toHaveAttribute('data-pixi-garden', 'true'); return scene;
}
test('real Next session, garden colour persistence, ownership and village conservation', async ({ page, playwright }, info) => {
  const request = page.request;
  const checked = new URL(dbUrl);
  const localTaskDatabase = checked.hostname === '127.0.0.1' && checked.port === '5548' && checked.pathname === '/palace_scene_test';
  if (!['postgres:', 'postgresql:'].includes(checked.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(checked.hostname) ||
    (!/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(checked.pathname) && !localTaskDatabase) || checked.search || checked.hash)
    throw Error('Refusing a non-isolated test database');
  const db = createPrismaClient(dbUrl); const errors: string[] = []; const missingAssets: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().includes('/game-art/') && r.status() >= 400) missingAssets.push(`${r.status()} ${r.url()}`); });
  const now = Date.now(), passwordHash = await hashPassword(password);
  for (const id of [alice, bob]) await db.user.create({ data: { id, email: `${id}@example.test`, name: 'لاعب اختبار القصر',
    passwordHash, role: 'USER', status: 'ACTIVE', tokenVersion: 0, villageOnboardingCompletedAt: new Date(now) } });
  let initial = executeCommand(createWorld(now), alice, { type: 'found', name: 'قصر الاختبار المعزول' }, now);
  initial = executeCommand(initial, bob, { type: 'found', name: 'قرية اختبار أخرى' }, now);
  const owned = Object.values(initial.villages).find(v => v.ownerId === alice)!;
  initial = { ...initial, villages: { ...initial.villages, [owned.id]: { ...owned,
    buildings: { ...owned.buildings, hall: 7, barracks: 2, stable: 2, market: 1 },
    resources: { wood: 60000, stone: 60000, iron: 60000, food: 60000, gold: 60000 },
    progression: { ...owned.progression!, xp: 2175, signature: '' } } } };
  expect(owned.id).toBe('v1');
  await db.kingdomWorld.create({ data: { id: worldId, name: 'عالم اختبار القصر', state: JSON.parse(JSON.stringify(initial)),
    revision: 1, paused: false, nextEventAt: new Date(now + 86400000) } });
  // Regular players see open worlds; keep the cosmetic transaction conservation
  // assertion before the live page starts ordinary world-clock polling.
  const before = await db.kingdomWorld.findUniqueOrThrow({ where: { id: worldId } });
  const beforeState = JSON.parse(JSON.stringify(before.state));
  const bobRequest = await playwright.request.newContext({ baseURL: base });
  const anonymous = await playwright.request.newContext({ baseURL: base });
  try {
    await signIn(request, alice); await signIn(bobRequest, bob);
    expect((await anonymous.get(`/api/kingdoms/palace-garden?worldId=${worldId}&villageId=v1`)).status()).toBe(401);
    expect((await bobRequest.get(`/api/kingdoms/palace-garden?worldId=${worldId}&villageId=v1`)).status()).toBe(403);
    expect((await bobRequest.put('/api/kingdoms/palace-garden', { headers: { origin: base }, data: data([]) })).status()).toBe(403);
    expect((await request.put('/api/kingdoms/palace-garden', { headers: { origin: 'https://invalid.test' }, data: data([]) })).status()).toBe(403);
    expect((await request.put('/api/kingdoms/palace-garden', { headers: { origin: base }, data: data([{ slotId: 0, itemId: 'red-roses', color: 'purple' }]) })).status()).toBe(400);
    const cosmetic = await request.put('/api/kingdoms/palace-garden', { headers: { origin: base },
      data: data(['red-roses', 'yellow-roses', 'white-roses', 'pink-roses', 'tulips', 'purple-flowers', 'jasmine',
        'green-shrub', 'cypress-tree', 'fountain', 'bench', 'red-roses'].map((itemId, slotId) => ({ slotId, itemId,
          ...(slotId < 6 ? { color: ['brown', 'yellow', 'blue', 'green', 'orange', 'brown'][slotId] } : {}) }))) });
    expect(cosmetic.status()).toBe(200);
    const afterCosmetic = await db.kingdomWorld.findUniqueOrThrow({ where: { id: worldId } });
    const cosmeticState = JSON.parse(JSON.stringify(afterCosmetic.state));
    delete beforeState.villages.v1.palaceGarden; delete cosmeticState.villages.v1.palaceGarden;
    expect(cosmeticState).toEqual(beforeState); expect(afterCosmetic.paused).toBe(before.paused);
    expect(afterCosmetic.nextEventAt).toEqual(before.nextEventAt);
    await page.goto(`/games/kingdoms?worldId=${worldId}&villageId=v1&tab=village`);
    await expect(page.locator('[data-village-scene]')).toHaveAttribute('data-pixi-ready', 'true');
    const scene = await enter(page);
    await scene.getByLabel('وجهة كاميرا القصر').selectOption('GARDEN');
    await scene.getByRole('button', { name: 'تخصيص الحديقة', exact: true }).click();
    await scene.getByLabel('اختيار مساحة الحديقة').selectOption('0');
    await scene.getByRole('button', { name: 'ورد أحمر', exact: true }).click();
    await scene.getByRole('button', { name: 'أزرق', exact: true }).click();
    await scene.getByRole('button', { name: 'حفظ الحديقة', exact: true }).click();
    await expect(scene.getByText('حُفظت حديقتك.')).toBeVisible();
    const saved = await request.get(`/api/kingdoms/palace-garden?worldId=${worldId}&villageId=v1`);
    expect(saved.status()).toBe(200); expect(saved.headers()['cache-control']).toBe('no-store');
    expect((await saved.json()).data.slots).toContainEqual({ slotId: 0, itemId: 'red-roses', color: 'blue' });
    await scene.getByRole('button', { name: 'العودة إلى المدينة', exact: true }).click();
    await expect(page.locator('[data-city-scene]')).toHaveCount(0);
    await page.reload(); await expect(page.locator('[data-village-scene]')).toHaveAttribute('data-pixi-ready', 'true');
    const returned = await enter(page);
    await returned.getByRole('button', { name: 'تخصيص الحديقة', exact: true }).click();
    await returned.getByLabel('اختيار مساحة الحديقة').selectOption('0');
    await expect(returned.getByRole('button', { name: 'أزرق', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await returned.getByRole('button', { name: 'إلغاء التعديل', exact: true }).click();
    await returned.getByLabel('وجهة كاميرا القصر').selectOption('GARDEN');
    await page.waitForTimeout(1000); await page.screenshot({ path: info.outputPath('next-real-garden-blue.png'), fullPage: true });
    await returned.getByLabel('وجهة كاميرا القصر').selectOption('FOUNTAIN');
    await page.waitForTimeout(800); await returned.getByLabel('وجهة كاميرا القصر').selectOption('FULLPALACE');
    await page.waitForTimeout(800); await page.screenshot({ path: info.outputPath('next-real-palace.png'), fullPage: true });
    const canvas = returned.locator('[data-sultan-palace] canvas');
    await returned.getByRole('button', { name: 'إيقاف الحركة', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-palace-running', 'false');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await returned.getByRole('button', { name: 'تشغيل الحركة', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-palace-running', 'false');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(canvas).toHaveAttribute('data-palace-running', 'true');
    for (const quality of ['medium', 'low', 'high']) {
      await returned.getByLabel('جودة القصر', { exact: true }).selectOption(quality);
      await expect(canvas).toHaveAttribute('data-palace-quality', quality);
    }
    for (let index = 0; index < 3; index++) {
      await page.getByRole('button', { name: 'العودة إلى المدينة', exact: true }).click();
      await expect(page.locator('[data-city-scene]')).toHaveCount(0); await enter(page);
      await expect(page.locator('[data-sultan-palace] canvas')).toHaveCount(1);
    }
    const after = await db.kingdomWorld.findUniqueOrThrow({ where: { id: worldId } });
    const afterState = JSON.parse(JSON.stringify(after.state));
    for (const id of Object.keys(beforeState.villages)) {
      for (const key of ['ownerId', 'troops', 'buildings', 'build', 'train', 'x', 'y'])
        expect(afterState.villages[id][key]).toEqual(beforeState.villages[id][key]);
    }
    const bobVillage = Object.values(beforeState.villages).find((v: unknown) => (v as { ownerId: string }).ownerId === bob) as { id: string };
    expect(afterState.villages[bobVillage.id].palaceGarden).toEqual(beforeState.villages[bobVillage.id].palaceGarden);
    expect(after.paused).toBe(before.paused);
    expect((await db.kingdomCommand.count({ where: { worldId } }))).toBe(0);
    expect(errors).toEqual([]); expect(missingAssets).toEqual([]);
    await info.attach('real-next-integration', { contentType: 'application/json', body: JSON.stringify({
      realNext: true, realPostgres: true, port: checked.port, credentialSignIn: true, colourReload: true,
      ownership403: true, anonymous401: true, origin403: true, invalidColour400: true,
      preservedGameplayState: true, persistedCommandCount: 0, errors, missingAssets, project: info.project.name }) });
  } finally { await bobRequest.dispose(); await anonymous.dispose();
    await db.kingdomWorld.deleteMany({ where: { id: worldId } });
    await db.user.deleteMany({ where: { id: { in: [alice, bob] } } }); await db.$disconnect(); }
});

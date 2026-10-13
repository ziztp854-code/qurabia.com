import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createPrismaClient, type DatabaseClient, Prisma } from '@tahaddi/database';
import { createWorld, executeCommand, advanceWorld } from './engine';
import { defaultKingdomsConfig, resources } from './config';
import { report, emptyTroops } from './simulation';
import { publicReport, reportOutbox } from './report-events';
import { reportArchiveRows, archiveKingdomReports } from './reports-store';
import { listRoyalReports, readRoyalReport, markRoyalReportRead } from './reports-repository';
import { commandKingdomWorld, tickKingdomWorlds } from './repository';
const url = process.env.KINGDOMS_TEST_DATABASE_URL;
describe.skipIf(!url)('Royal Reports durable PostgreSQL archive', { timeout: 60000 }, () => {
  let db: DatabaseClient;
  let worldId: string;
  const owner = { id: `reports_${randomUUID()}`, tokenVersion: 0 };
  const enemy = { id: `reports_${randomUUID()}`, tokenVersion: 0 };
  const outsider = { id: `reports_${randomUUID()}`, tokenVersion: 0 };
  const at = 1700000000000;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (
      !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
      !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(parsed.pathname)
    )
      throw Error('Isolated local DB required');
    db = createPrismaClient(url!);
    await db.user.createMany({
      data: [owner, enemy, outsider].map((u) => ({
        id: u.id,
        name: 'اختبار ملكي',
        status: 'ACTIVE',
        tokenVersion: 0,
      })),
    });
    let world = createWorld(at, { ...defaultKingdomsConfig, seasonSeconds: 365 * 86400 });
    world = executeCommand(world, owner.id, { type: 'found', name: 'مملكة الياقوت' }, at);
    world = executeCommand(world, enemy.id, { type: 'found', name: 'مملكة النخيل' }, at);
    report(world, at + 100, [owner.id], 'تقرير الاستطلاع', 'نجح الاستطلاع', {
      intel: {
        resources: resources(55),
        troops: { ...emptyTroops(), guard: 123 },
        buildings: { ...Object.values(world.villages)[0].buildings },
      },
    });
    const row = await db.kingdomWorld.create({
      data: {
        name: 'تقارير اختبار معزولة',
        state: JSON.parse(JSON.stringify(world)) as Prisma.InputJsonValue,
      },
    });
    worldId = row.id;
  }, 60000);
  afterAll(async () => {
    if (!db) return;
    if (worldId) await db.kingdomWorld.deleteMany({ where: { id: worldId } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, enemy.id, outsider.id] } } });
    await db.$disconnect();
  }, 60000);
  it('backfills retained reports once, excludes other recipients and rejects IDOR', async () => {
    const a = await listRoyalReports({ worldId }, owner, db);
    const b = await listRoyalReports({ worldId }, enemy, db);
    const intel = a.items.find((r) => r.eventKey === 'scout.result')!;
    expect(intel).toBeTruthy();
    expect(b.items.some((r) => r.id === intel.id)).toBe(false);
    expect((await readRoyalReport(worldId, intel.id, owner, db)).intel?.troops.guard).toBe(123);
    await expect(readRoyalReport(worldId, intel.id, enemy, db)).rejects.toMatchObject({
      status: 404,
    });
    await expect(listRoyalReports({ worldId }, outsider, db)).rejects.toMatchObject({
      status: 403,
    });
    const count = await db.kingdomReportEntry.count({ where: { worldId } });
    await listRoyalReports({ worldId }, owner, db);
    expect(await db.kingdomReportEntry.count({ where: { worldId } })).toBe(count);
  });
  it('keeps read receipt idempotent and recipient-owned across concurrent tabs and reconnect', async () => {
    const page = await listRoyalReports({ worldId }, owner, db);
    const id = page.items[0].id;
    const [a, b] = await Promise.all([
      markRoyalReportRead({ worldId, reportId: id }, owner, db),
      markRoyalReportRead({ worldId, reportId: id }, owner, db),
    ]);
    expect(a.readAt).toBe(b.readAt);
    expect((await readRoyalReport(worldId, id, owner, db)).readAt).toBe(a.readAt);
    await expect(markRoyalReportRead({ worldId, reportId: id }, enemy, db)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await listRoyalReports({ worldId, unread: 'read' }, owner, db)).items.some(
        (r) => r.id === id,
      ),
    ).toBe(true);
    expect(
      (await listRoyalReports({ worldId, unread: 'unread' }, owner, db)).items.some(
        (r) => r.id === id,
      ),
    ).toBe(false);
  });
  it('archives >2000 events, handles repeated saves, stable pagination, search and category indexes at 5000 records', async () => {
    const stored = await db.kingdomWorld.findUniqueOrThrow({ where: { id: worldId } });
    const world = stored.state as unknown as ReturnType<typeof createWorld>;
    for (let n = 0; n < 5000; n++)
      report(
        world,
        at + 1000 + Math.floor(n / 5),
        [owner.id],
        `اكتمل البناء ${n}`,
        `برج الياقوت رقم ${n}`,
        { event: { key: 'building.completed', category: 'buildings' } },
      );
    expect(world.reports).toHaveLength(2000);
    expect(reportOutbox(world)).toHaveLength(5000);
    await db.$transaction(
      async (tx) => {
        await archiveKingdomReports(tx, { id: worldId, reportsArchived: true }, world);
        await archiveKingdomReports(tx, { id: worldId, reportsArchived: true }, world);
      },
      { timeout: 30000 },
    );
    expect(
      await db.kingdomReportEntry.count({
        where: { worldId, category: 'buildings', playerId: owner.id },
      }),
    ).toBeGreaterThanOrEqual(5000);
    const started = performance.now();
    const first = await listRoyalReports({ worldId, category: 'buildings', limit: 25 }, owner, db);
    const elapsed = performance.now() - started;
    expect(first.items).toHaveLength(25);
    const second = await listRoyalReports(
      { worldId, category: 'buildings', limit: 25, cursor: first.nextCursor! },
      owner,
      db,
    );
    expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(50);
    expect(first.items[0].ordinal).toBeGreaterThan(second.items[0].ordinal);
    expect(
      (await listRoyalReports({ worldId, q: 'الياقوت رقم 4999' }, owner, db)).items,
    ).toHaveLength(1);
    expect(
      (await listRoyalReports({ worldId, category: 'military', q: 'الياقوت' }, owner, db)).items,
    ).toHaveLength(0);
    expect((await listRoyalReports({ worldId, order: 'oldest' }, owner, db)).items[0].at).toBe(at);
    expect((await listRoyalReports({ worldId, q: '%' }, owner, db)).items).toHaveLength(0);
    expect((await listRoyalReports({ worldId, q: '_' }, owner, db)).items).toHaveLength(0);
    expect(elapsed).toBeLessThan(2000);
    console.log(`Royal reports 5000-row page: ${elapsed.toFixed(1)}ms, 25 rows`);
    const indexes = await db.$queryRaw<
      { indexname: string }[]
    >`SELECT indexname FROM pg_indexes WHERE tablename = 'KingdomReportEntry'`;
    expect(indexes.map((i) => i.indexname)).toContain('royal_report_search_idx');
  });
  it('archives command effects in the same transaction and a replay creates no reports', async () => {
    const world = executeCommand(
      createWorld(Date.now()),
      owner.id,
      { type: 'found', name: 'مملكة جديدة' },
      Date.now(),
    );
    const v = Object.values(world.villages)[0];
    v.resources = resources(10000, 10000, 10000, 10000, 10000);
    const row = await db.kingdomWorld.create({
      data: {
        name: 'أوامر محلية',
        state: JSON.parse(JSON.stringify(world)) as Prisma.InputJsonValue,
      },
    });
    try {
      const key = randomUUID();
      await commandKingdomWorld(
        row.id,
        owner,
        key,
        { type: 'build', villageId: v.id, building: 'farm' },
        db,
      );
      const count = await db.kingdomReportEntry.count({ where: { worldId: row.id } });
      await commandKingdomWorld(
        row.id,
        owner,
        key,
        { type: 'build', villageId: v.id, building: 'farm' },
        db,
      );
      expect(await db.kingdomReportEntry.count({ where: { worldId: row.id } })).toBe(count);
      const pending = await db.kingdomWorld.findUniqueOrThrow({ where: { id: row.id } });
      const state = pending.state as unknown as typeof world;
      const due = Date.now() - 1;
      state.villages[v.id].build!.endsAt = due;
      state.villages[v.id].constructionQueue![0].endsAt = due;
      await db.kingdomWorld.update({
        where: { id: row.id },
        data: { state: JSON.parse(JSON.stringify(state)), nextEventAt: new Date(0) },
      });
      await tickKingdomWorlds(db);
      expect(
        await db.kingdomReportEntry.count({
          where: { worldId: row.id, eventKey: 'building.completed' },
        }),
      ).toBe(1);
    } finally {
      await db.kingdomWorld.delete({ where: { id: row.id } });
    }
  });
  it('archives actual aggregated production with the command and does not duplicate on retry', async () => {
    const from = Date.now() - 6 * 3600000 - 1000;
    const world = executeCommand(
      createWorld(from),
      owner.id,
      { type: 'found', name: 'مملكة الإنتاج' },
      from,
    );
    const village = Object.values(world.villages)[0];
    const row = await db.kingdomWorld.create({
      data: {
        name: 'إنتاج محلي معزول',
        state: JSON.parse(JSON.stringify(world)) as Prisma.InputJsonValue,
      },
    });
    try {
      const key = randomUUID();
      const command = { type: 'build' as const, villageId: village.id, building: 'farm' as const };
      await commandKingdomWorld(row.id, owner, key, command, db);
      const records = await db.kingdomReportEntry.findMany({
        where: { worldId: row.id, playerId: owner.id, eventKey: 'production.summary' },
      });
      expect(records).toHaveLength(1);
      const detail = await readRoyalReport(row.id, records[0].reportId, owner, db);
      expect(detail.event?.resources?.received?.wood).toBeGreaterThan(0);
      expect(detail.event?.timeline?.[0].at).toBe(from);
      await commandKingdomWorld(row.id, owner, key, command, db);
      expect(
        await db.kingdomReportEntry.count({
          where: { worldId: row.id, eventKey: 'production.summary' },
        }),
      ).toBe(1);
    } finally {
      await db.kingdomWorld.delete({ where: { id: row.id } });
    }
  });
  it('never records Tick noise, strips recipient lists and private enemy commanders', () => {
    const world = executeCommand(
      createWorld(at),
      owner.id,
      { type: 'found', name: 'هدوء المملكة' },
      at,
    );
    const count = world.reports.length;
    expect(advanceWorld(world, at + 10000).reports).toHaveLength(count);
    const r = {
      id: 'r999',
      at,
      title: 'معركة',
      detail: 'حدث',
      recipients: [owner.id],
      event: {
        key: 'battle.resolved',
        category: 'military' as const,
        commanders: [{ playerId: enemy.id, name: 'قائد سري' }],
      },
    };
    expect(publicReport(r, enemy.id)).toBeNull();
    expect(publicReport(r, owner.id)).not.toHaveProperty('recipients');
    expect(publicReport(r, owner.id)?.event?.commanders).toEqual([]);
    expect(reportArchiveRows(worldId, [r, r])).toHaveLength(1);
  });
  it('revalidates revoked session on the server', async () => {
    await db.user.update({ where: { id: outsider.id }, data: { tokenVersion: 1 } });
    await expect(listRoyalReports({ worldId }, outsider, db)).rejects.toMatchObject({
      status: 401,
    });
  });
});

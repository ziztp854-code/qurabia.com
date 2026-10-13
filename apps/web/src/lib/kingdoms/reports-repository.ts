import 'server-only';
import { Prisma, type DatabaseClient } from '@tahaddi/database';
import { kingdomTransaction, type KingdomIdentity } from './repository';
import { KingdomsHttpError } from './http';
import { archiveKingdomReports } from './reports-store';
import { reportCategories, type PublicKingdomReport } from './report-events';
import {
  reportCursorSchema,
  reportsQuerySchema,
  readReportSchema,
  type RoyalReportDetail,
  type RoyalReportsPage,
} from './reports-schema';
import type { KingdomsWorld } from './types';
async function authorize(tx: Prisma.TransactionClient, identity: KingdomIdentity, worldId: string) {
  const user = await tx.user.findUnique({
    where: { id: identity.id },
    select: { status: true, tokenVersion: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
    throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
  const [row] = await tx.$queryRaw<
    { id: string; reportsArchived: boolean; member: boolean }[]
  >`SELECT id, "reportsArchived", (state->'players') ? ${identity.id} AS member FROM "KingdomWorld" WHERE id = ${worldId}`;
  if (!row) throw new KingdomsHttpError(404, 'العالم غير موجود.');
  if (!row.member) throw new KingdomsHttpError(403, 'لا تملك مملكة في هذا العالم.');
  if (!row.reportsArchived) {
    const [locked] = await tx.$queryRaw<
      { id: string; state: KingdomsWorld; reportsArchived: boolean }[]
    >`SELECT id, state, "reportsArchived" FROM "KingdomWorld" WHERE id = ${worldId} FOR UPDATE`;
    const current = await tx.user.findUnique({
      where: { id: identity.id },
      select: { status: true, tokenVersion: true },
    });
    if (!current || current.status !== 'ACTIVE' || current.tokenVersion !== identity.tokenVersion)
      throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
    if (!locked || !Object.hasOwn(locked.state.players, identity.id))
      throw new KingdomsHttpError(403, 'لا تملك مملكة في هذا العالم.');
    if (!locked.reportsArchived) {
      await archiveKingdomReports(tx, locked, locked.state);
      await tx.kingdomWorld.update({ where: { id: worldId }, data: { reportsArchived: true } });
    }
  }
}
function decodeCursor(value: string) {
  try {
    return reportCursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new KingdomsHttpError(400, 'مؤشر صفحة غير صالح.');
  }
}
export async function listRoyalReports(
  input: unknown,
  identity: KingdomIdentity,
  db?: DatabaseClient,
): Promise<RoyalReportsPage> {
  const q = reportsQuerySchema.parse(input);
  const actor = Object.freeze({ ...identity });
  return kingdomTransaction(async (tx) => {
    await authorize(tx, actor, q.worldId);
    const scope = { worldId: q.worldId, playerId: actor.id };
    const filter: Prisma.KingdomReportEntryWhereInput = {
      ...scope,
      ...(q.category !== 'all' ? { category: q.category } : {}),
      ...(q.unread === 'unread'
        ? { readAt: null }
        : q.unread === 'read'
          ? { readAt: { not: null } }
          : {}),
      ...(q.q
        ? {
            searchText: {
              contains: q.q.replace(/[\\%_]/g, (char) => `\\${char}`),
              mode: 'insensitive',
            },
          }
        : {}),
    };
    const dir = q.order === 'newest' ? 'desc' : 'asc';
    const cmp = dir === 'desc' ? 'lt' : 'gt';
    const c = q.cursor ? decodeCursor(q.cursor) : null;
    const where: Prisma.KingdomReportEntryWhereInput = c
      ? {
          AND: [
            filter,
            {
              OR: [
                { eventAt: { [cmp]: new Date(c.at) } },
                { eventAt: new Date(c.at), ordinal: { [cmp]: c.ordinal } },
                { eventAt: new Date(c.at), ordinal: c.ordinal, reportId: { [cmp]: c.id } },
              ],
            },
          ],
        }
      : filter;
    const [rows, total, unreadCount, counts] = await Promise.all([
      tx.kingdomReportEntry.findMany({
        where,
        take: q.limit + 1,
        orderBy: [{ eventAt: dir }, { ordinal: dir }, { reportId: dir }],
        select: {
          reportId: true,
          eventAt: true,
          ordinal: true,
          category: true,
          eventKey: true,
          title: true,
          preview: true,
          readAt: true,
        },
      }),
      tx.kingdomReportEntry.count({ where: filter }),
      tx.kingdomReportEntry.count({ where: { ...scope, readAt: null } }),
      tx.kingdomReportEntry.groupBy({ by: ['category'], where: scope, _count: { _all: true } }),
    ]);
    const items = rows.slice(0, q.limit).map((r) => ({
      id: r.reportId,
      at: r.eventAt.getTime(),
      ordinal: r.ordinal,
      category: r.category as (typeof reportCategories)[number],
      eventKey: r.eventKey,
      title: r.title,
      preview: r.preview,
      readAt: r.readAt?.getTime() ?? null,
    }));
    const last = items.at(-1);
    return {
      items,
      total,
      unreadCount,
      categories: Object.fromEntries(
        reportCategories.map((category) => [
          category,
          counts.find((c) => c.category === category)?._count._all ?? 0,
        ]),
      ) as RoyalReportsPage['categories'],
      nextCursor:
        rows.length > q.limit && last
          ? Buffer.from(
              JSON.stringify({ at: last.at, ordinal: last.ordinal, id: last.id }),
            ).toString('base64url')
          : null,
    };
  }, db);
}
export async function readRoyalReport(
  worldId: string,
  reportId: string,
  identity: KingdomIdentity,
  db?: DatabaseClient,
): Promise<RoyalReportDetail> {
  readReportSchema.parse({ worldId, reportId });
  return kingdomTransaction(async (tx) => {
    await authorize(tx, identity, worldId);
    const r = await tx.kingdomReportEntry.findUnique({
      where: { worldId_playerId_reportId: { worldId, playerId: identity.id, reportId } },
    });
    if (!r) throw new KingdomsHttpError(404, 'التقرير غير موجود.');
    return { ...(r.payload as PublicKingdomReport), readAt: r.readAt?.getTime() ?? null };
  }, db);
}
export async function markRoyalReportRead(
  input: unknown,
  identity: KingdomIdentity,
  db?: DatabaseClient,
) {
  const { worldId, reportId } = readReportSchema.parse(input);
  return kingdomTransaction(async (tx) => {
    await authorize(tx, identity, worldId);
    const key = { worldId, playerId: identity.id, reportId };
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    await tx.kingdomReportEntry.updateMany({
      where: { ...key, readAt: null },
      data: { readAt: clock.now },
    });
    const row = await tx.kingdomReportEntry.findUnique({
      where: { worldId_playerId_reportId: key },
      select: { readAt: true },
    });
    if (!row) throw new KingdomsHttpError(404, 'التقرير غير موجود.');
    return { reportId, readAt: row.readAt!.getTime() };
  }, db);
}

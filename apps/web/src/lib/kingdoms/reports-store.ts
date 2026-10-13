import { captureSiegeTransitions } from './reports-siege';
import type { Prisma } from '@tahaddi/database';
import type { KingdomReport, KingdomsWorld } from './types';
import { classifyReport, publicReport, reportOutbox, type ReportEvent } from './report-events';
export function reportArchiveRows(worldId: string, reports: readonly KingdomReport[]) {
  const seen = new Set<string>();
  return reports.flatMap((report) => {
    if (!report.id || !Number.isSafeInteger(report.at) || !Array.isArray(report.recipients))
      return [];
    const event: ReportEvent =
      report.event ?? classifyReport(report.title, Boolean(report.combat), Boolean(report.intel));
    return [...new Set(report.recipients)].flatMap((playerId) => {
      // Include event time so an admin season reset cannot collide with reused rN IDs.
      const archiveId = `${report.id}_${report.at}`;
      const key = `${playerId}:${archiveId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const content = publicReport({ ...report, id: archiveId, event }, playerId)!;
      const sequence = Number(report.id.replace(/^r/, ''));
      return [
        {
          worldId,
          playerId,
          reportId: archiveId,
          eventAt: new Date(report.at),
          ordinal:
            Number.isSafeInteger(sequence) && sequence >= 0 && sequence <= 2147483647
              ? sequence
              : 0,
          category: event.category,
          eventKey: event.key,
          title: report.title.slice(0, 240),
          preview: report.detail.slice(0, 400),
          searchText: `${report.title} ${report.detail} ${event.location?.name ?? ''} ${(event.parties ?? []).map((p) => p.name).join(' ')}`,
          payload: JSON.parse(JSON.stringify(content)) as Prisma.InputJsonValue,
        },
      ];
    });
  });
}
export async function archiveKingdomReports(
  tx: Prisma.TransactionClient,
  row: { id: string; reportsArchived?: boolean; state?: unknown },
  world: KingdomsWorld,
) {
  if (row.state && row.state !== world) captureSiegeTransitions(row.state as KingdomsWorld, world);
  const rows = reportArchiveRows(
    row.id,
    row.reportsArchived ? reportOutbox(world) : [...world.reports, ...reportOutbox(world)],
  );
  if (!rows.length) return;
  // NPC and deleted owners have no authenticated inbox or live User foreign key.
  const users = await tx.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.playerId))] } },
    select: { id: true },
  });
  const ids = new Set(users.map((user) => user.id));
  const accepted = rows.filter((r) => ids.has(r.playerId));
  for (let i = 0; i < accepted.length; i += 500)
    await tx.kingdomReportEntry.createMany({
      data: accepted.slice(i, i + 500),
      skipDuplicates: true,
    });
}

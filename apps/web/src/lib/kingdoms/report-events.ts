import type { KingdomReport, KingdomsWorld, Resources } from './types';
export const reportCategories = ['military', 'economy', 'buildings', 'diplomacy'] as const;
export type ReportCategory = (typeof reportCategories)[number];
export type ReportEvent = {
  key: string;
  sourceId?: string;
  category: ReportCategory;
  outcome?: 'victory' | 'defeat' | 'warning' | 'neutral';
  attackerId?: string;
  location?: { villageId?: string; name: string; x: number; y: number };
  parties?: { role: 'attacker' | 'defender' | 'merchant'; name: string }[];
  commanders?: { playerId: string; name: string }[];
  construction?: { building: string; from: number; to: number };
  resources?: { sent?: Resources; received?: Resources };
  transfers?: { playerId: string; sent: Resources; received: Resources }[];
  timeline?: { at: number; text: string }[];
  siege?: { stage: string; wallDamage: number; buildingDamage: Record<string, number> };
};
const known: Record<string, [ReportCategory, string]> = {
  'اكتمل البناء': ['buildings', 'building.completed'],
  'تعذّر إكمال البناء': ['buildings', 'building.failed'],
  'ميلاد المملكة': ['buildings', 'kingdom.founded'],
  'اكتمل التدريب': ['military', 'training.completed'],
  'انتصار المهاجم': ['military', 'battle.attackerWon'],
  'صمود الدفاع': ['military', 'battle.defenderWon'],
  'تقرير الاستطلاع': ['military', 'scout.result'],
  'رصد كشافة': ['military', 'scout.detected'],
  'تم التبادل': ['economy', 'trade.completed'],
  'حصاد المزرعة': ['economy', 'farm.harvested'],
  'عودة حملة جمع الموارد': ['economy', 'gather.returned'],
  'تعذّرت عودة حملة جمع الموارد': ['economy', 'gather.returnFailed'],
  'جمع الموارد': ['economy', 'gather.collected'],
  'تعذّر جمع الموارد': ['economy', 'gather.failed'],
  'عودة بعثة القرية المهجورة': ['economy', 'abandoned.returned'],
  'جمع موارد القرية المهجورة': ['economy', 'abandoned.collected'],
  'تعذر جمع موارد القرية المهجورة': ['economy', 'abandoned.failed'],
  'اعتراض قافلة': ['military', 'caravan.interceptRequested'],
  'ضم أرض': ['buildings', 'territory.claimed'],
};
export function classifyReport(
  title: string,
  combat = false,
  intel = false,
): Pick<ReportEvent, 'category' | 'key'> {
  if (known[title]) return { category: known[title][0], key: known[title][1] };
  const category: ReportCategory =
    combat || intel || /حصار|جيش|حملة|كشافة|تعزيزات|قوات/.test(title)
      ? 'military'
      : /تحالف|عهد|عضوية|دبلوماس/.test(title)
        ? 'diplomacy'
        : /بناء|مبنى|تطوير|قرية جديدة/.test(title)
          ? 'buildings'
          : 'economy';
  return { category, key: `${category}.event` };
}
// Transaction-local outbox: preserves all events beyond the bounded legacy ring; never serialized.
const outboxes = new WeakMap<KingdomsWorld, KingdomReport[]>();
export function captureReport(world: KingdomsWorld, entry: KingdomReport) {
  const box = outboxes.get(world) ?? [];
  box.push(entry);
  outboxes.set(world, box);
}
export function reportOutbox(world: KingdomsWorld) {
  return outboxes.get(world) ?? [];
}
export function carryReportOutbox(from: KingdomsWorld, to: KingdomsWorld) {
  if (from !== to) outboxes.set(to, [...reportOutbox(from), ...reportOutbox(to)]);
  return to;
}
export type PublicKingdomReport = Omit<KingdomReport, 'recipients'>;
export function publicReport(report: KingdomReport, playerId: string): PublicKingdomReport | null {
  if (!report.recipients.includes(playerId)) return null;
  const { recipients, ...value } = structuredClone(report);
  void recipients;
  if (value.event?.commanders)
    value.event.commanders = value.event.commanders.filter((c) => c.playerId === playerId);
  if (value.event?.transfers) {
    const own = value.event.transfers.find((t) => t.playerId === playerId);
    value.event.resources = own ? { sent: own.sent, received: own.received } : undefined;
    delete value.event.transfers;
  }
  if (value.combat && value.event?.attackerId && value.event.outcome) {
    value.event.outcome =
      (value.event.attackerId === playerId) === (value.event.outcome === 'victory')
        ? 'victory'
        : 'defeat';
  }
  return value;
}

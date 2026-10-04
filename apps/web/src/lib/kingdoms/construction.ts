import { creditAllianceEvent, stampAllianceEvent } from './alliance-events';
import { defaultConstructionConfig } from './construction-config';
import { resources } from './config';
import { awardVillageXp, progressionConfig } from './progression';
import { stableUnlockVillageLevel } from './training';
import { assertRule, credit, deadline, nextId, report, scaleResources, spend } from './simulation';
import {
  resourceKeys,
  type Resources,
  type Building,
  type ConstructionItem,
  type KingdomsWorld,
  type Village,
} from './types';

export const constructionConfig = (w: KingdomsWorld) =>
  w.config.construction ?? defaultConstructionConfig;
const pending = (item: ConstructionItem) => item.status === 'BUILDING' || item.status === 'QUEUED';

/** Read legacy active work without charging again or guessing its historical paid cost. */
export function normalizeConstruction(v: Village) {
  if (!v.build || v.constructionQueue?.some((item) => item.status === 'BUILDING')) return;
  const build = v.build;
  v.constructionQueue = [
    ...(v.constructionQueue ?? []),
    {
      id: `legacy-${v.id}-${build.endsAt}`,
      villageId: v.id,
      building: build.building,
      fromLevel: build.level - 1,
      targetLevel: build.level,
      queuedAt: build.startedAt ?? Math.min(v.updatedAt, build.endsAt),
      startedAt: build.startedAt ?? Math.min(v.updatedAt, build.endsAt),
      endsAt: build.endsAt,
      cost: resources(),
      status: 'BUILDING',
      legacy: true,
      ...(build.allianceEvent ? { allianceEvent: build.allianceEvent } : {}),
    },
  ];
}

function trimHistory(w: KingdomsWorld, v: Village) {
  const queue = v.constructionQueue ?? [];
  const history = queue.filter((item) => !pending(item));
  const keep = new Set(
    history
      .slice(Math.max(0, history.length - constructionConfig(w).historyLimit))
      .map((item) => item.id),
  );
  v.constructionQueue = queue.filter((item) => pending(item) || keep.has(item.id));
}

function activate(v: Village, at: number) {
  const next = v.constructionQueue?.find((item) => item.status === 'QUEUED');
  if (!next) {
    delete v.build;
    return;
  }
  const item = {
    ...next,
    status: 'BUILDING' as const,
    startedAt: at,
    endsAt: deadline(at, next.endsAt - next.startedAt),
  };
  v.constructionQueue = v.constructionQueue!.map((old) => (old.id === item.id ? item : old));
  v.build = {
    building: item.building,
    level: item.targetLevel,
    startedAt: item.startedAt,
    endsAt: item.endsAt,
    ...(item.allianceEvent ? { allianceEvent: item.allianceEvent } : {}),
  };
}

export function queueConstruction(w: KingdomsWorld, v: Village, building: Building, at: number) {
  normalizeConstruction(v);
  const queue = v.constructionQueue ?? [];
  const active = queue.filter(pending);
  assertRule(active.length < constructionConfig(w).maxPending, 'طابور البناء ممتلئ');
  if (building === 'stable') {
    assertRule(v.buildings.barracks >= 1, 'ابنِ الثكنة أولاً');
    assertRule(
      (v.progression?.level ?? 1) >= stableUnlockVillageLevel,
      `يُفتح الإسطبل عند مستوى القرية ${stableUnlockVillageLevel}`,
    );
  }
  const spec = w.config.buildings[building];
  const level =
    active.filter((item) => item.building === building).at(-1)?.targetLevel ??
    v.buildings[building];
  assertRule(level < spec.maxLevel, 'بلغ المبنى الحد الأعلى');
  const factor = spec.growth ** level;
  const cost = scaleResources(spec.cost, factor);
  const startedAt = active.at(-1)?.endsAt ?? at;
  const endsAt = deadline(startedAt, spec.seconds * factor * 1000);
  spend(v, cost);
  const allianceEvent = stampAllianceEvent(w, v.ownerId, at);
  const item: ConstructionItem = {
    id: nextId(w, 'c'),
    villageId: v.id,
    building,
    fromLevel: level,
    targetLevel: level + 1,
    queuedAt: at,
    startedAt,
    endsAt,
    cost,
    status: active.length ? 'QUEUED' : 'BUILDING',
    ...(allianceEvent ? { allianceEvent } : {}),
  };
  v.constructionQueue = [...queue, item];
  if (item.status === 'BUILDING')
    v.build = { building, level: item.targetLevel, startedAt, endsAt, ...(allianceEvent ? { allianceEvent } : {}) };
  trimHistory(w, v);
}

export function completeConstruction(w: KingdomsWorld, v: Village, at: number) {
  const item = v.constructionQueue?.find((entry) => entry.status === 'BUILDING');
  assertRule(item && item.endsAt === at, 'حالة البناء غير متطابقة');
  if (v.buildings[item.building] !== item.fromLevel) {
    v.constructionQueue = v.constructionQueue!.map((entry) => {
      if (!pending(entry) || entry.building !== item.building) return entry;
      credit(w, v, entry.cost);
      return { ...entry, status: 'FAILED', refundedCost: { ...entry.cost } };
    });
    report(
      w,
      at,
      [v.ownerId],
      'تعذّر إكمال البناء',
      `تغير مستوى المبنى في ${v.name}؛ أُعيدت التكاليف المحجوزة`,
    );
    activate(v, at);
    reschedule(v, at);
    trimHistory(w, v);
    return;
  }
  v.buildings = { ...v.buildings, [item.building]: item.targetLevel };
  awardVillageXp(v, item.targetLevel * progressionConfig(w).buildingXp);
  if (item.allianceEvent) creditAllianceEvent(w, v.ownerId, 'build', 5, at, item.allianceEvent);
  v.constructionQueue = v.constructionQueue!.map((entry) =>
    entry.id === item.id ? { ...entry, status: 'COMPLETED' } : entry,
  );
  report(w, at, [v.ownerId], 'اكتمل البناء', `اكتمل تطوير مبنى في ${v.name}`);
  activate(v, at);
  trimHistory(w, v);
}

function reschedule(v: Village, at: number) {
  let previousEnd = v.build?.endsAt ?? at;
  v.constructionQueue = v.constructionQueue!.map((item) => {
    if (item.status !== 'QUEUED') return item;
    const startedAt = previousEnd;
    previousEnd = deadline(startedAt, item.endsAt - item.startedAt);
    return { ...item, startedAt, endsAt: previousEnd };
  });
}

export function cancelConstruction(w: KingdomsWorld, v: Village, itemId: string, at: number) {
  normalizeConstruction(v);
  const target = v.constructionQueue?.find((item) => item.id === itemId);
  assertRule(target && pending(target), 'مشروع البناء غير قابل للإلغاء');
  const config = constructionConfig(w);
  v.constructionQueue = v.constructionQueue!.map((item) => {
    if (
      !pending(item) ||
      (item.id !== target.id &&
        !(item.building === target.building && item.targetLevel > target.targetLevel))
    )
      return item;
    const fraction = item.legacy
      ? 0
      : item.status === 'BUILDING'
        ? config.activeRefund
        : config.queuedRefund;
    const refundedCost = Object.fromEntries(
      resourceKeys.map((key) => [key, Math.floor(item.cost[key] * fraction)]),
    ) as Resources;
    credit(w, v, refundedCost);
    return { ...item, status: 'CANCELLED', refundedCost };
  });
  if (target.status === 'BUILDING') activate(v, at);
  reschedule(v, at);
  report(
    w,
    at,
    [v.ownerId],
    'أُلغي البناء',
    `أُلغي مشروع البناء والمستويات التابعة له في ${v.name}`,
  );
  trimHistory(w, v);
}

import { creditAllianceEvent } from './alliance-events';
import {
  gatherPreview,
  pruneResourceSiteStocks,
  resourceSiteAt,
  resourceSiteResourceNames,
  resourceSiteSupply,
} from './resource-sites';
import { resources } from './config';
import {
  buildingKeys,
  resourceKeys,
  unitKeys,
  type KingdomsConfig,
  type KingdomsWorld,
  type Movement,
  type Resources,
  type Troops,
  type Village,
  type KingdomReport,
} from './types';
export const emptyTroops = (): Troops => ({ guard: 0, rider: 0, scout: 0, settler: 0 });
export const nextId = (w: KingdomsWorld, prefix: string) => `${prefix}${w.nextId++}`;
export function assertRule(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export const total = (r: Resources | Troops) => Object.values(r).reduce((a, b) => a + b, 0);
const gatherAmountLabel = (amount: number) => Number(amount.toFixed(2)).toString();

export const nonAggression = (w: KingdomsWorld, a?: string, b?: string) =>
  Boolean(
    a &&
    b &&
    (a === b ||
      (w.alliances[a]?.diplomacy[b] === 'ally' && w.alliances[b]?.diplomacy[a] === 'ally') ||
      (w.alliances[a]?.diplomacy[b] === 'peace' && w.alliances[b]?.diplomacy[a] === 'peace')),
  );
export function deadline(at: number, duration: number) {
  const result = at + Math.max(1000, Math.ceil(duration));
  assertRule(
    Number.isSafeInteger(result) && duration <= 365 * 86400000,
    'مدة العملية تتجاوز الحد المسموح',
  );
  return result;
}
export const scaleResources = (r: Resources, factor: number): Resources =>
  Object.fromEntries(resourceKeys.map((k) => [k, Math.ceil(r[k] * factor)])) as Resources;
export const capacity = (w: KingdomsWorld, v: Village) => storageCapacity(w.config, v);

/** سعة التخزين في القرية. قاعدة واحدة يستخدمها المحرك والعرض معًا. */
export const storageCapacity = (config: KingdomsConfig, village: Pick<Village, 'buildings'>) =>
  config.storageBase + village.buildings.warehouse * config.storagePerLevel;
export function spend(v: Village, c: Resources) {
  assertRule(
    resourceKeys.every((k) => Number.isFinite(c[k]) && c[k] >= 0 && v.resources[k] >= c[k]),
    'الموارد غير كافية',
  );
  v.resources = Object.fromEntries(
    resourceKeys.map((k) => [k, v.resources[k] - c[k]]),
  ) as Resources;
}
export function credit(w: KingdomsWorld, v: Village, r: Resources) {
  v.resources = Object.fromEntries(
    resourceKeys.map((k) => [k, Math.min(capacity(w, v), v.resources[k] + r[k])]),
  ) as Resources;
}
export function report(
  w: KingdomsWorld,
  at: number,
  recipients: string[],
  title: string,
  detail: string,
  extra: Partial<KingdomReport> = {},
) {
  w.reports = [
    ...w.reports,
    { id: nextId(w, 'r'), at, recipients: [...new Set(recipients)], title, detail, ...extra },
  ].slice(-2000);
}
export function makeVillage(
  w: KingdomsWorld,
  ownerId: string,
  name: string,
  x: number,
  y: number,
  at: number,
  initial = true,
): Village {
  return {
    id: nextId(w, 'v'),
    ownerId,
    name,
    x,
    y,
    resources: initial ? { ...w.config.startingResources } : resources(),
    updatedAt: at,
    buildings: Object.fromEntries(
      buildingKeys.map((k) => [k, k === 'hall' ? 1 : 0]),
    ) as Village['buildings'],
    troops: emptyTroops(),
    reinforcements: {},
  };
}
export function deployedTroops(w: KingdomsWorld): Map<string, Troops> {
  const bySource = new Map<string, Troops>();
  const add = (sourceId: string, troops: Troops) => {
    const previous = bySource.get(sourceId) ?? emptyTroops();
    bySource.set(
      sourceId,
      Object.fromEntries(unitKeys.map((k) => [k, previous[k] + troops[k]])) as Troops,
    );
  };
  for (const movement of w.movements) add(movement.sourceId, movement.troops);
  for (const village of Object.values(w.villages)) {
    for (const [sourceId, troops] of Object.entries(village.reinforcements)) add(sourceId, troops);
  }
  return bySource;
}

export function production(
  w: KingdomsWorld,
  v: Village,
  away = deployedTroops(w).get(v.id) ?? emptyTroops(),
): Resources {
  return productionRate(w.config, v, away);
}

/**
 * معدل الإنتاج في الساعة. قاعدة واحدة يستخدمها المحرك والعرض معًا، فتعرض الواجهة
 * الرقم نفسه الذي يحتسبه الخادم بلا نسخة ثانية من المعادلة.
 */
export function productionRate(
  config: KingdomsConfig,
  village: Village,
  away: Troops = emptyTroops(),
): Resources {
  const levels = {
    wood: village.buildings.lumber,
    stone: village.buildings.quarry,
    iron: village.buildings.mine,
    food: village.buildings.farm,
    gold: village.buildings.treasury,
  };
  const upkeep = unitKeys.reduce(
    (sum, key) => sum + (village.troops[key] + away[key]) * config.units[key].upkeep,
    0,
  );
  return Object.fromEntries(
    resourceKeys.map((key) => [
      key,
      Math.max(
        0,
        config.baseProduction[key] * (1 + levels[key] * config.productionPerLevel) -
          (key === 'food' ? upkeep : 0),
      ),
    ]),
  ) as Resources;
}
function accrue(w: KingdomsWorld, to: number) {
  const deployed = deployedTroops(w);
  for (const v of Object.values(w.villages)) {
    const elapsed = Math.max(0, to - v.updatedAt) / 3600000;
    const rate = production(w, v, deployed.get(v.id) ?? emptyTroops());
    credit(w, v, Object.fromEntries(resourceKeys.map((k) => [k, rate[k] * elapsed])) as Resources);
    v.updatedAt = to;
  }
}
export function returnMovement(w: KingdomsWorld, m: Movement, at: number) {
  const home = w.villages[m.sourceId];
  if (!home || !total(m.troops)) return;
  w.movements.push({
    ...m,
    id: nextId(w, 'm'),
    mission: 'return',
    departedAt: at,
    arrivesAt: at + m.travelMs,
    targetX: home.x,
    targetY: home.y,
  });
}
const survivors = (t: Troops, loss: number): Troops =>
  Object.fromEntries(
    unitKeys.map((k) => [k, Math.max(0, t[k] - Math.ceil(t[k] * loss))]),
  ) as Troops;
function combat(w: KingdomsWorld, m: Movement, v: Village, at: number) {
  const before = { ...v.troops };
  const owners = Object.entries(v.reinforcements)
    .filter(([, troops]) => total(troops) > 0)
    .map(([id]) => w.villages[id]?.ownerId)
    .filter((ownerId): ownerId is string => Boolean(ownerId));
  const defenders = Object.values(v.reinforcements).reduce(
    (acc, t) => Object.fromEntries(unitKeys.map((k) => [k, acc[k] + t[k]])) as Troops,
    before,
  );
  const attack = unitKeys.reduce((s, k) => s + m.troops[k] * w.config.units[k].attack, 0);
  const defense =
    unitKeys.reduce((s, k) => s + defenders[k] * w.config.units[k].defense, 0) *
    (1 + v.buildings.wall * w.config.wallDefensePerLevel);
  const won = attack > defense;
  const attackLoss =
    defense === 0
      ? 0
      : won
        ? Math.min(1, (defense / attack) ** w.config.combatLossExponent)
        : m.mission === 'raid'
          ? Math.min(1, defense / (attack + defense))
          : 1;
  const defenseLoss = won
    ? 1
    : Math.min(1, (attack / Math.max(defense, 1)) ** w.config.combatLossExponent);
  const remaining = survivors(m.troops, attackLoss);
  v.troops = survivors(before, defenseLoss);
  v.reinforcements = Object.fromEntries(
    Object.entries(v.reinforcements)
      .map(([k, t]): [string, Troops] => [k, survivors(t, defenseLoss)])
      .filter(([, troops]) => total(troops) > 0),
  );
  const defenderAfter = Object.values(v.reinforcements).reduce(
    (acc, t) => Object.fromEntries(unitKeys.map((k) => [k, acc[k] + t[k]])) as Troops,
    { ...v.troops },
  );
  const carry = unitKeys.reduce((s, k) => s + remaining[k] * w.config.units[k].carry, 0);
  const available = total(v.resources);
  const loot = Object.fromEntries(
    resourceKeys.map((k) => [
      k,
      available ? Math.floor(v.resources[k] * Math.min(1, carry / available)) : 0,
    ]),
  ) as Resources;
  spend(v, loot);
  report(
    w,
    at,
    [m.ownerId, v.ownerId, ...owners],
    won ? 'انتصار المهاجم' : 'صمود الدفاع',
    `${m.mission === 'raid' ? 'غارة' : 'معركة'} عند (${v.x}، ${v.y})`,
    {
      combat: {
        attack,
        defense,
        attackerBefore: m.troops,
        attackerAfter: remaining,
        defenderBefore: defenders,
        defenderAfter,
        loot,
      },
    },
  );
  w.players[m.ownerId].score += Math.floor(total(defenders) - total(defenderAfter));
  returnMovement(w, { ...m, troops: remaining, loot }, at);
}
function arrive(w: KingdomsWorld, m: Movement, at: number) {
  const target = Object.values(w.villages).find((v) => v.x === m.targetX && v.y === m.targetY);
  if (m.mission === 'return') {
    const home = w.villages[m.sourceId];
    if (home?.ownerId === m.ownerId) {
      const before = m.gather ? home.resources[m.gather.resource] : 0;
      home.troops = Object.fromEntries(
        unitKeys.map((k) => [k, home.troops[k] + m.troops[k]]),
      ) as Troops;
      credit(w, home, m.loot);
      if (m.gather) {
        const received = home.resources[m.gather.resource] - before;
        const overflow = m.loot[m.gather.resource] - received;
        const resourceName = resourceSiteResourceNames[m.gather.resource];
        report(
          w,
          at,
          [m.ownerId],
          'عودة حملة جمع الموارد',
          `عادت القوات إلى ${home.name}؛ استلمت ${gatherAmountLabel(received)} ${resourceName}${overflow > 0 ? `؛ لم يتسع المخزن لـ ${gatherAmountLabel(overflow)} ${resourceName}` : ''}`,
        );
      }
    } else if (m.gather) {
      report(
        w,
        at,
        [m.ownerId],
        'تعذّرت عودة حملة جمع الموارد',
        'القرية الأصلية لم تعد تابعة لمملكتك؛ لم تُسلّم الموارد إلى مملكة أخرى',
      );
    }
    return;
  }
  if (m.mission === 'gather') {
    const site = resourceSiteAt(w.config.worldRadius, m.targetX, m.targetY);
    const key = `${m.targetX},${m.targetY}`;
    if (!site || target || w.territories[key]) {
      report(
        w,
        at,
        [m.ownerId],
        'تعذّر جمع الموارد',
        'الموقع لم يعد متاحًا؛ تعود القوات دون موارد',
      );
      returnMovement(w, { ...m, loot: resources() }, at);
      return;
    }
    const supply = resourceSiteSupply(w, m.targetX, m.targetY, at);
    const carry = gatherPreview(w.config, { x: m.targetX, y: m.targetY }, site, m.troops).carry;
    const amount = Math.min(Math.floor(supply), carry);
    w.resourceSiteStocks = {
      ...w.resourceSiteStocks,
      [key]: { available: supply - amount, updatedAt: at },
    };
    const loot = { ...resources(), [site.resource]: amount };
    report(
      w,
      at,
      [m.ownerId],
      'جمع الموارد',
      `${site.name}: جُمعت ${gatherAmountLabel(amount)} ${resourceSiteResourceNames[site.resource]}؛ القوات في طريق العودة`,
    );
    returnMovement(w, { ...m, loot, gather: { siteId: site.id, resource: site.resource } }, at);
    return;
  }
  if (m.mission === 'settle') {
    const count = Object.values(w.villages).filter((v) => v.ownerId === m.ownerId).length;
    if (
      !target &&
      count < w.config.maxVillages &&
      (!w.territories[`${m.targetX},${m.targetY}`] ||
        w.territories[`${m.targetX},${m.targetY}`] === m.ownerId)
    ) {
      const v = makeVillage(w, m.ownerId, `قرية ${count + 1}`, m.targetX, m.targetY, at, false);
      v.troops = { ...m.troops, settler: m.troops.settler - 1 };
      w.villages[v.id] = v;
      w.players[m.ownerId].achievements = [
        ...new Set([...w.players[m.ownerId].achievements, 'founder']),
      ];
      report(w, at, [m.ownerId], 'قرية جديدة', 'وصل المستوطنون وأسسوا القرية');
      return;
    }
    credit(w, w.villages[m.sourceId], m.loot);
    returnMovement(w, { ...m, loot: resources() }, at);
    return;
  }
  if (m.mission === 'occupy') {
    const key = `${m.targetX},${m.targetY}`;
    if (!target && (!w.territories[key] || w.territories[key] === m.ownerId)) {
      w.territories[key] = m.ownerId;
      report(w, at, [m.ownerId], 'ضم أرض', 'أضيفت الأرض إلى حدود المملكة');
    }
    returnMovement(w, m, at);
    return;
  }
  if (!target) {
    returnMovement(w, m, at);
    return;
  }
  if (m.mission === 'reinforce') {
    const a = w.players[m.ownerId].allianceId,
      b = w.players[target.ownerId].allianceId;
    if (target.ownerId === m.ownerId || (a && a === b)) {
      const old = target.reinforcements[m.sourceId] ?? emptyTroops();
      target.reinforcements[m.sourceId] = Object.fromEntries(
        unitKeys.map((k) => [k, old[k] + m.troops[k]]),
      ) as Troops;
      report(w, at, [m.ownerId, target.ownerId], 'وصول تعزيزات', 'وصل الجيش للدفاع عن القرية');
      return;
    }
    returnMovement(w, m, at);
    return;
  }
  const a = w.players[m.ownerId].allianceId,
    b = w.players[target.ownerId].allianceId;
  if (
    w.players[target.ownerId].protectionUntil > at ||
    target.ownerId === m.ownerId ||
    nonAggression(w, a, b)
  ) {
    returnMovement(w, m, at);
    return;
  }
  if (m.mission === 'scout') {
    const defense =
      target.troops.scout + Object.values(target.reinforcements).reduce((s, t) => s + t.scout, 0);
    const survived = m.troops.scout > defense;
    report(
      w,
      at,
      [m.ownerId],
      'تقرير الاستطلاع',
      survived ? 'نجح الاستطلاع' : 'كشف الدفاع الكشافة',
      survived
        ? {
            intel: {
              resources: { ...target.resources },
              troops: { ...target.troops },
              buildings: { ...target.buildings },
            },
          }
        : {},
    );
    if (!survived) report(w, at, [target.ownerId], 'رصد كشافة', 'أحبط الدفاع استطلاعاً معادياً');
    returnMovement(
      w,
      { ...m, troops: survived ? { ...m.troops, scout: m.troops.scout - defense } : emptyTroops() },
      at,
    );
    return;
  }
  combat(w, m, target, at);
}
/** Internal simulation operates exclusively on the caller's fresh structured clone. */
export function earliestDeadline(w: KingdomsWorld, fallback = Infinity): number {
  const villageDeadline = Object.values(w.villages).reduce(
    (earliest, v) =>
      Math.min(earliest, v.build?.endsAt ?? Infinity, v.training?.endsAt ?? Infinity),
    fallback,
  );
  return w.movements.reduce(
    (earliest, movement) => Math.min(earliest, movement.arrivesAt),
    villageDeadline,
  );
}

export function advanceDraft(w: KingdomsWorld, now: number) {
  const end = Math.min(now, w.season.endsAt);
  if (end < w.updatedAt) return;
  while (true) {
    const next = earliestDeadline(w);
    if (next > end) break;
    accrue(w, next);
    for (const v of Object.values(w.villages)) {
      if (v.build && v.build.endsAt === next) {
        if (v.build.allianceEvent) {
          creditAllianceEvent(w, v.ownerId, 'build', 5, next, v.build.allianceEvent);
        }
        v.buildings = { ...v.buildings, [v.build.building]: v.build.level };
        delete v.build;
        report(w, next, [v.ownerId], 'اكتمل البناء', `اكتمل تطوير مبنى في ${v.name}`);
      }
      if (v.training && v.training.endsAt === next) {
        if (v.training.allianceEvent) {
          creditAllianceEvent(
            w,
            v.ownerId,
            'train',
            v.training.count,
            next,
            v.training.allianceEvent,
          );
        }
        v.troops = { ...v.troops, [v.training.unit]: v.troops[v.training.unit] + v.training.count };
        delete v.training;
        report(w, next, [v.ownerId], 'اكتمل التدريب', `انضمت قوات جديدة في ${v.name}`);
      }
    }
    const due = w.movements
      .filter((m) => m.arrivesAt === next)
      .sort((a, b) => a.id.localeCompare(b.id));
    w.movements = w.movements.filter((m) => m.arrivesAt !== next);
    for (const m of due) arrive(w, m, next);
  }
  accrue(w, end);
  w.updatedAt = end;
  pruneResourceSiteStocks(w, end);
  if (now >= w.season.endsAt && w.season.status === 'active') {
    const ranking = Object.values(w.players).sort(
      (a, b) => b.throne - a.throne || b.score - a.score || a.id.localeCompare(b.id),
    );
    const alliances = Object.values(w.alliances)
      .map((a) => ({
        id: a.id,
        score: Object.keys(a.members).reduce((s, id) => s + (w.players[id]?.throne ?? 0), 0),
      }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    w.season = {
      ...w.season,
      status: 'ended',
      ...(ranking[0] ? { winnerId: ranking[0].id } : {}),
      ...(alliances[0]?.score ? { winnerAllianceId: alliances[0].id } : {}),
    };
    report(
      w,
      end,
      Object.keys(w.players),
      'ختام عرش تحدي',
      'حُسم العرش بمجموع مساهمات الممالك والتحالفات',
    );
  }
}

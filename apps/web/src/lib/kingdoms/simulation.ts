import { awardVillageXp, progressionConfig, refreshProgression } from './progression';
import { completeConstruction, normalizeConstruction } from './construction';
import { creditAllianceEvent } from './alliance-events';
import {
  gatherPreview,
  pruneResourceSiteStocks,
  resourceSiteAt,
  resourceSiteResourceNames,
  resourceSiteSupply,
} from './resource-sites';
import { defaultKingdomsConfig, resources } from './config';
import { abandonedLayout, abandonedResourceNames, abandonedVillage, collectAbandonedResources } from './abandoned-villages';
import { awardBattleExperience, commanderCombatPower, releaseCommander, setCommander } from './commanders';
import {
  buildingKeys,
  resourceKeys,
  unitKeys,
  type EnemySighting,
  type KingdomsConfig,
  type KingdomsWorld,
  type Movement,
  type Resource,
  type Resources,
  type Troops,
  type Village,
  type KingdomReport,
  isIncomingMission,
} from './types';
export const emptyTroops = (): Troops => Object.fromEntries(unitKeys.map((key) => [key, 0])) as Troops;
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
      Object.fromEntries(unitKeys.map((k) => [k, previous[k] + (troops[k] ?? 0)])) as Troops,
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

const producerLevel = {
  wood: 'lumber',
  stone: 'quarry',
  iron: 'mine',
  food: 'farm',
  gold: 'treasury',
} as const;

/** إنتاج المبنى بالساعة قبل الإعاشة. نفس معامل المحرك. */
export function hourlyYield(config: KingdomsConfig, resource: Resource, level: number) {
  return config.baseProduction[resource] * (1 + level * config.productionPerLevel);
}

export function netAfterUpkeep(gross: number, upkeep: number) {
  return Math.max(0, gross - upkeep);
}

/** إعاشة الغذاء بالساعة لكل القوات في القرية وخارجها. */
export function foodUpkeep(config: KingdomsConfig, village: Village, away: Troops = emptyTroops()) {
  return unitKeys.reduce(
    (sum, key) => {
      const count = (village.troops[key] ?? 0) + (away[key] ?? 0);
      return count === 0 ? sum : sum + count * config.units[key].upkeep;
    },
    0,
  );
}

export function grossResources(config: KingdomsConfig, village: Pick<Village, 'buildings'>): Resources {
  return Object.fromEntries(
    resourceKeys.map((key) => [key, hourlyYield(config, key, village.buildings[producerLevel[key]])]),
  ) as Resources;
}

export type FoodEconomy = { gross: number; upkeep: number; net: number };

/** إجمالي الغذاء والإعاشة والصافي. الصافي هو ما يطبّقه المحرك. */
export function foodEconomy(
  config: KingdomsConfig,
  village: Village,
  away: Troops = emptyTroops(),
  farmLevel = village.buildings.farm,
): FoodEconomy {
  const gross = hourlyYield(config, 'food', farmLevel);
  const upkeep = foodUpkeep(config, village, away);
  return { gross, upkeep, net: netAfterUpkeep(gross, upkeep) };
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
  const upkeep = foodUpkeep(config, village, away);
  return Object.fromEntries(
    resourceKeys.map((key) => [
      key,
      netAfterUpkeep(
        hourlyYield(config, key, village.buildings[producerLevel[key]]),
        key === 'food' ? upkeep : 0,
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
  if (!home || !total(m.troops)) {
    releaseCommander(w, m.commanderId, at, true);
    return;
  }
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
  const reinforcementsBefore = v.reinforcements;
  const owners = Object.entries(v.reinforcements)
    .filter(([, troops]) => total(troops) > 0)
    .map(([id]) => w.villages[id]?.ownerId)
    .filter((ownerId): ownerId is string => Boolean(ownerId));
  const defenders = Object.values(v.reinforcements).reduce(
    (acc, t) => Object.fromEntries(unitKeys.map((k) => [k, acc[k] + t[k]])) as Troops,
    before,
  );
  const attackerCommander = m.commanderId ? w.commanders?.[m.commanderId] : undefined;
  const defenseCommander = v.commanderId ? w.commanders?.[v.commanderId] : undefined;
  const attack = commanderCombatPower(w, m.troops, 'attack', attackerCommander?.playerId === m.ownerId ? attackerCommander : undefined);
  const reinforcementPower = Object.entries(v.reinforcements).reduce((sum, [sourceId, troops]) => {
    const id = v.reinforcementCommanders?.[sourceId];
    const commander = id ? w.commanders?.[id] : undefined;
    return sum + commanderCombatPower(w, troops, 'defense', commander?.playerId === w.villages[sourceId]?.ownerId ? commander : undefined);
  }, 0);
  const defense =
    (commanderCombatPower(w, before, 'defense', defenseCommander?.playerId === v.ownerId ? defenseCommander : undefined) + reinforcementPower) *
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
  const defenderCommanders = [
    ...(v.commanderId ? [{ commanderId: v.commanderId, casualties: total(before) - total(v.troops) }] : []),
    ...Object.entries(v.reinforcementCommanders ?? {}).map(([sourceId, commanderId]) => ({
      commanderId,
      casualties: total(reinforcementsBefore[sourceId] ?? emptyTroops()) - total(v.reinforcements[sourceId] ?? emptyTroops()),
    })),
  ];
  const enemyDefenderLoss = total(before) - total(v.troops) + Object.entries(reinforcementsBefore)
    .filter(([sourceId]) => w.villages[sourceId]?.ownerId !== m.ownerId)
    .reduce((sum, [sourceId, troops]) => sum + total(troops) - total(v.reinforcements[sourceId] ?? emptyTroops()), 0);
  awardBattleExperience(w, m.id, at, m.ownerId, v.ownerId, m.commanderId, defenderCommanders,
    total(m.troops) - total(remaining), enemyDefenderLoss, won);
  // A defeated contingent releases its commander with recovery, without resurrecting units.
  if (v.commanderId && total(v.troops) === 0) {
    releaseCommander(w, v.commanderId, at, true);
    delete v.commanderId;
  }
  for (const [sourceId, commanderId] of Object.entries(v.reinforcementCommanders ?? {})) {
    if (!v.reinforcements[sourceId]) {
      releaseCommander(w, commanderId, at, true);
      delete v.reinforcementCommanders![sourceId];
    }
  }
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
    releaseCommander(w, m.commanderId, at);
    const home = w.villages[m.sourceId];
    if (home?.ownerId === m.ownerId) {
      const before = m.gather ? home.resources[m.gather.resource] : 0;
      const beforeAbandoned = m.abandonedGather ? { ...home.resources } : undefined;
      home.troops = Object.fromEntries(
        unitKeys.map((k) => [k, home.troops[k] + m.troops[k]]),
      ) as Troops;
      credit(w, home, m.loot);
      if (beforeAbandoned) {
        const received = resourceKeys.map(key => `${gatherAmountLabel(home.resources[key] - beforeAbandoned[key])} ${abandonedResourceNames[key]}`).join('، ');
        const overflow = resourceKeys.reduce((sum, key) => sum + m.loot[key] - (home.resources[key] - beforeAbandoned[key]), 0);
        report(w, at, [m.ownerId], 'عودة بعثة القرية المهجورة',
          `عادت القوات إلى ${home.name}؛ وصلت ${received}${overflow > 0 ? `؛ فائض سعة المخزن ${gatherAmountLabel(overflow)}` : ''}`);
      }
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
    } else if (m.gather || m.abandonedGather) {
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
  if (m.mission === 'gather' && m.abandonedGather) {
    const site = abandonedVillage(w, m.abandonedGather.targetId);
    if (!site || abandonedLayout(w)?.worldId !== m.abandonedGather.worldId ||
      site.x !== m.targetX || site.y !== m.targetY || target || w.territories[`${m.targetX},${m.targetY}`]) {
      report(w, at, [m.ownerId], 'تعذر جمع موارد القرية المهجورة', 'الهدف لم يعد متاحًا؛ تعود القوات دون موارد');
      returnMovement(w, { ...m, loot: resources() }, at);
      return;
    }
    const carry = gatherPreview(w.config, site, site, m.troops).carry;
    const loot = collectAbandonedResources(w, site.id, at, carry);
    const collected = resourceKeys.map(key => `${loot[key]} ${abandonedResourceNames[key]}`).join('، ');
    report(w, at, [m.ownerId], 'جمع موارد القرية المهجورة', `${site.name}: جُمعت ${collected}؛ القوات في طريق العودة`);
    returnMovement(w, { ...m, loot }, at);
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
      releaseCommander(w, m.commanderId, at);
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
      if (!w.territories[key]) awardVillageXp(w.villages[m.sourceId], progressionConfig(w).territoryXp);
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
      if (m.commanderId) {
        const commander = w.commanders?.[m.commanderId];
        if (commander && commander.playerId === m.ownerId) {
          target.reinforcementCommanders = { ...target.reinforcementCommanders, [m.sourceId]: commander.id };
          setCommander(w, { ...commander, status: 'deployed', villageId: target.id, homeVillageId: m.sourceId });
        }
      }
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
  const movementDeadline = w.movements.reduce(
    (earliest, movement) => Math.min(earliest, movement.arrivesAt),
    villageDeadline,
  );
  return (w.caravans ?? []).reduce(
    (earliest, caravan) => caravan.status === 'traveling'
      ? Math.min(earliest, caravan.arrivesAt) : earliest,
    movementDeadline,
  );
}

/** Old worlds predate the stable key. Level 0 adds no XP, troops, or movement changes. */
export function normalizeStable(w: KingdomsWorld) {
  if (!w.config.buildings.stable) {
    const spec = defaultKingdomsConfig.buildings.stable;
    w.config.buildings = {
      ...w.config.buildings,
      stable: { ...spec, cost: { ...spec.cost } },
    };
  }
  for (const village of Object.values(w.villages)) {
    const level = village.buildings.stable;
    if (typeof level !== 'number' || !Number.isFinite(level) || level < 0)
      village.buildings = { ...village.buildings, stable: 0 };
  }
}

export function advanceDraft(w: KingdomsWorld, now: number) {
  normalizeStable(w);
  for (const v of Object.values(w.villages)) normalizeConstruction(v);
  refreshProgression(w, deployedTroops(w));
  const end = Math.min(now, w.season.endsAt);
  if (end < w.updatedAt) return;
  while (true) {
    const next = earliestDeadline(w);
    if (next > end) break;
    accrue(w, next);
    for (const v of Object.values(w.villages)) {
      if (v.build && v.build.endsAt === next) {
        completeConstruction(w, v, next);
      }
      if (v.training && v.training.endsAt === next) {
        awardVillageXp(v, v.training.count * progressionConfig(w).trainingXp);
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
    advanceCaravan(w, next);
  }
  accrue(w, end);
  refreshProgression(w, deployedTroops(w));
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

/** Caravan simulation: advances traveling caravans, handles arrivals, and supports interception. */
export function advanceCaravan(state: KingdomsWorld, now: number) {
  if (!state.caravans?.length) return;
  for (const caravan of state.caravans) {
    if (caravan.status !== 'traveling') continue;
    if (now >= caravan.arrivesAt) {
      caravan.status = 'arrived';
      const target = Object.values(state.villages).find(
        (v) => v.id === caravan.targetVillageId,
      );
      const recipient = target ?? state.villages[caravan.originVillageId];
      if (recipient) {
        credit(state, recipient, caravan.resources);
        caravan.resources = Object.fromEntries(
          resourceKeys.map((k) => [k, 0]),
        ) as Resources;
      }
    }
  }
  state.caravans = state.caravans.filter(
    (c) => c.status !== 'returned' && c.status !== 'intercepted',
  );
}

export function canInterceptCaravan(state: KingdomsWorld, carrierId: string): boolean {
  const caravan = state.caravans?.find((c) => c.id === carrierId);
  if (!caravan || caravan.status !== 'traveling' || !caravan.exposed) return false;
  const window = state.config.caravans?.interceptWindowSeconds ?? 60;
  return (
    Date.now() >= caravan.departsAt - window * 1000 &&
    Date.now() <= caravan.arrivesAt + window * 1000
  );
}

export function interceptCaravan(
  state: KingdomsWorld,
  carrierId: string,
  interceptorVillageId: string,
  interceptorPlayerId: string,
  troops: Troops,
) {
  const caravan = state.caravans?.find((c) => c.id === carrierId);
  if (!caravan || caravan.status !== 'traveling') return;
  const escortDefense = (state.config.caravans?.escortDefenseBonus ?? 0.25);
  const escortStrength = Object.entries(caravan.resources).reduce((sum, [, v]) => sum + v, 0) * escortDefense;
  const attackerStrength = Object.values(troops).reduce((sum, v) => sum + v, 0);
  if (attackerStrength > escortStrength) {
    caravan.status = 'intercepted';
    const target = state.villages[interceptorVillageId];
    if (target?.ownerId === interceptorPlayerId) {
      credit(state, target, caravan.resources);
    }
    caravan.resources = Object.fromEntries(
      resourceKeys.map((k) => [k, 0]),
    ) as Resources;
  }
}

export function computeVillageVision(village: Village, config: KingdomsConfig['vision']): number {
  if (!config || !village) return 0;
  const radiusByBuilding = config.visionRadiusByBuilding as Record<string, number> | undefined;
  let buildingBonus = 0;
  for (const [buildingKey, level] of Object.entries(village.buildings)) {
    if (radiusByBuilding && buildingKey in radiusByBuilding) {
      buildingBonus += radiusByBuilding[buildingKey] * level;
    }
  }
  return config.sharedVisionRadius + buildingBonus;
}

export function projectEnemySightings(w: KingdomsWorld, actorId: string, now: number): EnemySighting[] {
  const ownVillages = Object.values(w.villages).filter((v) => v.ownerId === actorId);
  const visionConfig = w.config.vision;
  if (!ownVillages.length || !visionConfig) return [];
  return w.movements
    .filter((m) => m.ownerId !== actorId && isIncomingMission(m.mission)
      && m.departedAt <= now && now < m.arrivesAt)
    .flatMap((m) => {
      const source = w.villages[m.sourceId];
      if (!source) return [];
      const progress = Math.min(1, Math.max(0,
        (now - m.departedAt) / Math.max(1, m.arrivesAt - m.departedAt)));
      const x = source.x + (m.targetX - source.x) * progress;
      const y = source.y + (m.targetY - source.y) * progress;
      if (!ownVillages.some((v) => {
        const radius = computeVillageVision(v, visionConfig);
        return radius > 0 && Math.hypot(x - v.x, y - v.y) <= radius;
      })) return [];
      const targetVillageId = Object.values(w.villages).find((v) => v.x === m.targetX && v.y === m.targetY)?.id;
      return [{
        id: m.id,
        villageId: targetVillageId ?? '',
        seenAt: now,
        expiresAt: now + visionConfig.visionExpiryMs,
      }];
    });
}

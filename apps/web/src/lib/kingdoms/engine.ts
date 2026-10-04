import { awardVillageXp, progressionConfig, refreshProgression } from './progression';
import { cancelConstruction, queueConstruction } from './construction';
import { creditAllianceEvent, projectAllianceEvent, stampAllianceEvent } from './alliance-events';
import {
  gatherPreview,
  projectResourceSites,
  resourceSiteAt,
  resourceSiteSupply,
} from './resource-sites';
import { defaultKingdomsConfig, kingdomsConfigSchema, resources } from './config';
import { addCommanderExperience, availableCommander, commanderConfig, createCommander, normalizeCommanders, projectCommanders, setCommander } from './commanders';
import { commanderTravelFactor } from './commander-movement';
import { trainingBuilding, trainingDurationMs } from './training';
import { kingdomsCommandSchema, type KingdomsCommand } from './commands';
import {
  advanceDraft,
  nonAggression,
  assertRule,
  credit,
  capacity,
  deadline,
  deployedTroops,
  earliestDeadline,
  emptyTroops,
  makeVillage,
  nextId,
  report,
  production,
  returnMovement,
  scaleResources,
  spend,
  total,
} from './simulation';
import {
  incomingMissions,
  resourceKeys,
  unitKeys,
  type IncomingMission,
  type IncomingMovementView,
  type IncomingSourceView,
  type KingdomsConfig,
  type KingdomsView,
  type KingdomsWorld,
  type Movement,
  type Village,
} from './types';
export { kingdomsCommandSchema } from './commands';
export { kingdomsConfigSchema } from './config';
export class KingdomsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KingdomsError';
  }
}
const clone = <T>(value: T): T => structuredClone(value);
export function createWorld(
  now: number,
  config: KingdomsConfig = defaultKingdomsConfig,
): KingdomsWorld {
  assertRule(Number.isSafeInteger(now) && now >= 0 && now <= 8e12, 'وقت غير صالح');
  return {
    version: 1,
    nextId: 1,
    updatedAt: now,
    config: kingdomsConfigSchema.parse(config),
    players: {},
    villages: {},
    movements: [],
    reports: [],
    alliances: {},
    offers: [],
    territories: {},
    commanders: {},
    commanderAwards: [],
    season: {
      number: 1,
      startsAt: now,
      endsAt: now + config.seasonSeconds * 1000,
      status: 'active',
    },
  };
}
export function advanceWorld(state: KingdomsWorld, now: number): KingdomsWorld {
  assertRule(Number.isSafeInteger(now) && now >= 0 && now <= 8e12, 'وقت غير صالح');
  const w = clone(state);
  normalizeCommanders(w);
  advanceDraft(w, Math.max(now, w.updatedAt));
  return w;
}
export function nextEventAt(w: KingdomsWorld): number | null {
  if (w.season.status === 'ended') return null;
  return earliestDeadline(w, w.season.endsAt);
}
function own(w: KingdomsWorld, actor: string, id: string): Village {
  const v = w.villages[id];
  assertRule(v && v.ownerId === actor, 'القرية لا تخص مملكتك');
  return v;
}
function found(w: KingdomsWorld, actor: string, name: string, at: number) {
  assertRule(!w.players[actor], 'لديك مملكة بالفعل');
  assertRule(Object.keys(w.players).length < 1000, 'العالم ممتلئ');
  const occupied = new Set(Object.values(w.villages).map((v) => `${v.x},${v.y}`));
  let point: { x: number; y: number } | undefined;
  for (let radius = 1; radius <= w.config.worldRadius && !point; radius++) {
    for (let x = -radius; x <= radius && !point; x++)
      for (const y of [-radius, radius]) {
        if (
          !occupied.has(`${x},${y}`) &&
          !w.territories[`${x},${y}`] &&
          !resourceSiteAt(w.config.worldRadius, x, y)
        ) {
          point = { x, y };
          break;
        }
      }
    for (let y = -radius + 1; y < radius && !point; y++)
      for (const x of [-radius, radius]) {
        if (
          !occupied.has(`${x},${y}`) &&
          !w.territories[`${x},${y}`] &&
          !resourceSiteAt(w.config.worldRadius, x, y)
        ) {
          point = { x, y };
          break;
        }
      }
  }
  assertRule(point, 'لا توجد أرض شاغرة');
  w.players[actor] = {
    id: actor,
    name,
    joinedAt: at,
    protectionUntil: at + w.config.protectionSeconds * 1000,
    claims: [],
    achievements: [],
    score: 0,
    throne: 0,
  };
  const v = makeVillage(w, actor, `عاصمة ${name}`, point.x, point.y, at);
  w.villages[v.id] = v;
  report(
    w,
    at,
    [actor],
    'ميلاد المملكة',
    'تتمتع مملكتك بحماية المبتدئين؛ بدء عمل عدائي ينهي حمايتك',
  );
}
function build(
  w: KingdomsWorld,
  actor: string,
  c: Extract<KingdomsCommand, { type: 'build' }>,
  at: number,
) {
  queueConstruction(w, own(w, actor, c.villageId), c.building, at);
}
function train(
  w: KingdomsWorld,
  actor: string,
  c: Extract<KingdomsCommand, { type: 'train' }>,
  at: number,
) {
  const v = own(w, actor, c.villageId),
    spec = w.config.units[c.unit];
  const hall = trainingBuilding(c.unit);
  assertRule(
    v.buildings[hall] > 0,
    hall === 'stable' ? 'ابنِ الإسطبل أولاً' : 'ابنِ الثكنة أولاً',
  );
  assertRule(!v.training, 'يوجد تدريب جارٍ');
  assertRule(
    c.unit !== 'settler' || v.buildings.hall >= w.config.settlerHallLevel,
    `يتطلب المستوطن دار حكم بالمستوى ${w.config.settlerHallLevel}`,
  );
  const away = deployedTroops(w).get(v.id);
  assertRule(total(v.troops) + (away ? total(away) : 0) + c.count <= 1e6, 'بلغ الجيش الحد الأعلى');
  spend(v, scaleResources(spec.cost, c.count));
  v.training = {
    allianceEvent: stampAllianceEvent(w, actor, at),
    unit: c.unit,
    count: c.count,
    endsAt: deadline(
      at,
      trainingDurationMs(spec.seconds, c.count, v.buildings[hall], w.config.barracksSpeedPerLevel),
    ),
  };
}
function march(
  w: KingdomsWorld,
  actor: string,
  c: Extract<KingdomsCommand, { type: 'march' }>,
  at: number,
) {
  const v = own(w, actor, c.villageId),
    p = w.players[actor];
  assertRule(
    Math.abs(c.targetX) <= w.config.worldRadius && Math.abs(c.targetY) <= w.config.worldRadius,
    'خارج حدود العالم',
  );
  assertRule(c.targetX !== v.x || c.targetY !== v.y, 'اختر أرضاً أخرى');
  assertRule(
    total(c.troops) > 0 && unitKeys.every((k) => v.troops[k] >= c.troops[k]),
    'القوات غير متاحة',
  );
  assertRule(
    w.movements.filter((m) => m.ownerId === actor).length < 100,
    'بلغت الحد الأعلى للحركات',
  );
  const target = Object.values(w.villages).find((t) => t.x === c.targetX && t.y === c.targetY);
  const commander = c.commanderId ? availableCommander(w, actor, c.commanderId, at) : undefined;
  if (commander) {
    assertRule(commander.status !== 'assigned' || commander.villageId === v.id, 'commander.error.wrongOrigin');
    if (c.mission === 'reinforce') assertRule(!target?.reinforcementCommanders?.[v.id] && !w.movements.some((m) => m.commanderId && m.sourceId === v.id && m.mission === 'reinforce' && m.targetX === c.targetX && m.targetY === c.targetY), 'commander.error.garrisonOccupied');
  }
  const site = resourceSiteAt(w.config.worldRadius, c.targetX, c.targetY);
  if (c.mission === 'gather') {
    assertRule(
      site && !target && !w.territories[`${c.targetX},${c.targetY}`],
      'اختر موقع موارد متاحًا',
    );
    const preview = gatherPreview(w.config, v, { x: c.targetX, y: c.targetY }, c.troops, commander);
    assertRule(preview.carry > 0, 'تحتاج قوات لها سعة حمل لجمع الموارد');
    assertRule(
      Math.floor(resourceSiteSupply(w, c.targetX, c.targetY, at)) > 0,
      'الموقع مستنزف؛ انتظر تجدّد موارده',
    );
    assertRule(
      deadline(at, preview.roundTripMs) < w.season.endsAt,
      'لا يكفي وقت الموسم لذهاب الحملة وعودتها',
    );
  }
  const hostile = ['attack', 'raid', 'scout'].includes(c.mission);
  if (hostile) {
    assertRule(target && target.ownerId !== actor, 'اختر قرية خصم');
    assertRule(w.players[target.ownerId].protectionUntil <= at, 'اللاعب تحت حماية المبتدئين');
    const a = p.allianceId,
      b = w.players[target.ownerId].allianceId;
    assertRule(!nonAggression(w, a, b), 'لا يمكن مهاجمة حليف أو طرف في عهد سلام متبادل');
    p.protectionUntil = Math.min(p.protectionUntil, at);
  }
  if (c.mission === 'scout')
    assertRule(c.troops.scout > 0 && total(c.troops) === c.troops.scout, 'الاستطلاع للكشافة فقط');
  if (c.mission === 'reinforce')
    assertRule(
      target &&
        (target.ownerId === actor ||
          (p.allianceId && p.allianceId === w.players[target.ownerId].allianceId)),
      'التعزيز لقرى المملكة أو التحالف',
    );
  if (c.mission === 'settle' || c.mission === 'occupy') {
    assertRule(!site, 'هذا موقع موارد؛ لا يمكن تأسيس قرية أو احتلاله');
    assertRule(!target, 'الأرض مشغولة');
    const key = `${c.targetX},${c.targetY}`;
    assertRule(!w.territories[key] || w.territories[key] === actor, 'الأرض تابعة لمملكة أخرى');
  }
  if (c.mission === 'settle') {
    assertRule(c.troops.settler >= 1, 'تحتاج مستوطناً');
    assertRule(
      Object.values(w.villages).filter((t) => t.ownerId === actor).length +
        w.movements.filter((m) => m.ownerId === actor && m.mission === 'settle').length <
        w.config.maxVillages,
      'بلغت الحد الأعلى للقرى',
    );
    spend(v, w.config.expansionCost);
  }
  if (c.mission === 'occupy') {
    assertRule(
      c.troops.guard + c.troops.rider >= w.config.occupationTroops,
      `تحتاج ${w.config.occupationTroops} مقاتلين لضم الأرض`,
    );
    assertRule(
      Object.values(w.territories).filter((id) => id === actor).length +
        w.movements.filter((m) => m.ownerId === actor && m.mission === 'occupy').length <
        100,
      'بلغت الحد الأعلى للأراضي',
    );
  }
  const speed = Math.min(
    ...unitKeys.filter((k) => c.troops[k] > 0).map((k) => w.config.units[k].speed),
  );
  const travelMs = Math.max(
    1000,
    Math.ceil(
      (Math.hypot(c.targetX - v.x, c.targetY - v.y) * w.config.secondsPerTile * 1000) / (speed * commanderTravelFactor(w.config, commander)),
    ),
  );
  deadline(at, travelMs);
  v.troops = Object.fromEntries(
    unitKeys.map((k) => [k, v.troops[k] - c.troops[k]]),
  ) as Village['troops'];
  if (commander) {
    if (v.commanderId === commander.id) delete v.commanderId;
    setCommander(w, { ...commander, status: 'marching', villageId: v.id, homeVillageId: v.id });
  }
  w.movements.push({
    ...(commander ? { commanderId: commander.id } : {}),
    ...(c.mission === 'gather' && site
      ? { gather: { siteId: site.id, resource: site.resource } }
      : {}),
    id: nextId(w, 'm'),
    ownerId: actor,
    sourceId: v.id,
    targetX: c.targetX,
    targetY: c.targetY,
    mission: c.mission,
    troops: { ...c.troops },
    departedAt: at,
    arrivesAt: at + travelMs,
    travelMs,
    loot: c.mission === 'settle' ? { ...w.config.expansionCost } : resources(),
  });
}
function trade(
  w: KingdomsWorld,
  actor: string,
  c: Extract<KingdomsCommand, { type: 'tradeOffer' | 'tradeAccept' | 'tradeCancel' }>,
  at: number,
) {
  if (c.type === 'tradeCancel') {
    const o = w.offers.find((o) => o.id === c.offerId);
    assertRule(o && o.ownerId === actor, 'العرض غير متاح');
    credit(w, own(w, actor, o.villageId), o.give);
    w.offers = w.offers.filter((t) => t.id !== o.id);
    return;
  }
  const v = own(w, actor, c.villageId);
  assertRule(v.buildings.market > 0, 'ابنِ السوق أولاً');
  if (c.type === 'tradeOffer') {
    assertRule(total(c.give) > 0 && total(c.want) > 0, 'يجب تحديد موارد للتبادل');
    assertRule(w.offers.filter((o) => o.ownerId === actor).length < 20, 'لديك عروض كثيرة');
    spend(v, c.give);
    w.offers.push({
      id: nextId(w, 'o'),
      ownerId: actor,
      villageId: v.id,
      give: { ...c.give },
      want: { ...c.want },
      createdAt: at,
    });
    return;
  }
  const o = w.offers.find((o) => o.id === c.offerId);
  assertRule(o && o.ownerId !== actor, 'العرض غير متاح');
  const seller = w.villages[o.villageId];
  assertRule(seller?.ownerId === o.ownerId, 'العرض لم يعد متاحاً');
  spend(v, o.want);
  credit(w, seller, o.want);
  credit(w, v, o.give);
  w.offers = w.offers.filter((t) => t.id !== o.id);
  for (const id of [actor, o.ownerId])
    w.players[id].achievements = [...new Set([...w.players[id].achievements, 'merchant'])];
  if (total(o.give) >= 100 && total(o.want) >= 100) {
    creditAllianceEvent(w, actor, 'trade', 5, at, undefined, o.ownerId);
    creditAllianceEvent(w, o.ownerId, 'trade', 5, at, undefined, actor);
  }
  report(w, at, [actor, o.ownerId], 'تم التبادل', 'أتم السوق تبادل الموارد المحجوزة');
}
function alliance(
  w: KingdomsWorld,
  actor: string,
  c: Extract<
    KingdomsCommand,
    {
      type:
        | 'allianceCreate'
        | 'allianceJoin'
        | 'allianceApprove'
        | 'allianceReject'
        | 'allianceKick'
        | 'allianceRole'
        | 'allianceLeave'
        | 'diplomacy';
    }
  >,
  at: number,
) {
  const p = w.players[actor];
  if (c.type === 'allianceCreate' || c.type === 'allianceJoin') {
    assertRule(!p.allianceId, 'أنت عضو في تحالف');
    assertRule(
      Object.values(w.villages).some((v) => v.ownerId === actor && v.buildings.embassy > 0),
      'ابنِ دار العهد أولاً',
    );
    if (c.type === 'allianceCreate') {
      const id = nextId(w, 'a');
      w.alliances[id] = {
        id,
        name: c.name,
        members: { [actor]: 'leader' },
        diplomacy: {},
        pending: [],
      };
      p.allianceId = id;
      for (const other of Object.values(w.alliances))
        other.pending = (other.pending ?? []).filter((id) => id !== actor);
    } else {
      const a = w.alliances[c.allianceId];
      assertRule(a && Object.keys(a.members).length < 50, 'التحالف غير متاح');
      assertRule((a.pending ?? []).length < 50, 'طلبات الانضمام ممتلئة');
      assertRule(!(a.pending ?? []).includes(actor), 'أرسلت طلب الانضمام مسبقاً');
      a.pending = [...(a.pending ?? []), actor];
      report(
        w,
        at,
        [actor, ...Object.keys(a.members).filter((id) => a.members[id] !== 'member')],
        'طلب انضمام',
        `طلبت ${p.name} الانضمام إلى ${a.name}`,
      );
    }
    return;
  }
  const a = p.allianceId ? w.alliances[p.allianceId] : undefined;
  assertRule(a, 'لست في تحالف');
  if (c.type === 'allianceApprove' || c.type === 'allianceReject') {
    assertRule(
      a.members[actor] === 'leader' || a.members[actor] === 'officer',
      'تحتاج صلاحية قبول الأعضاء',
    );
    assertRule((a.pending ?? []).includes(c.playerId), 'طلب الانضمام غير متاح');
    if (c.type === 'allianceApprove') {
      const applicant = w.players[c.playerId];
      assertRule(applicant && !applicant.allianceId, 'اللاعب عضو في تحالف بالفعل');
      assertRule(Object.keys(a.members).length < 50, 'التحالف ممتلئ');
      assertRule(
        Object.values(w.villages).some((v) => v.ownerId === c.playerId && v.buildings.embassy > 0),
        'اللاعب يحتاج دار العهد',
      );
      a.members = { ...a.members, [c.playerId]: 'member' };
      applicant.allianceId = a.id;
      for (const other of Object.values(w.alliances))
        other.pending = (other.pending ?? []).filter((id) => id !== c.playerId);
    } else a.pending = (a.pending ?? []).filter((id) => id !== c.playerId);
    report(
      w,
      at,
      [c.playerId, actor],
      c.type === 'allianceApprove' ? 'قُبل طلب الانضمام' : 'رُفض طلب الانضمام',
      a.name,
    );
    return;
  }
  if (c.type === 'allianceKick') {
    const rank = a.members[actor],
      targetRank = a.members[c.playerId];
    assertRule(
      c.playerId !== actor && targetRank && targetRank !== 'leader',
      'لا يمكن طرد هذا العضو',
    );
    assertRule(
      rank === 'leader' || (rank === 'officer' && targetRank === 'member'),
      'لا تملك صلاحية طرد هذا العضو',
    );
    delete a.members[c.playerId];
    delete w.players[c.playerId].allianceId;
    report(w, at, [c.playerId, actor], 'إنهاء عضوية التحالف', a.name);
    return;
  }
  if (c.type === 'allianceLeave') {
    assertRule(
      a.members[actor] !== 'leader' || Object.keys(a.members).length === 1,
      'انقل القيادة قبل المغادرة',
    );
    delete a.members[actor];
    delete p.allianceId;
    if (!Object.keys(a.members).length) {
      delete w.alliances[a.id];
      for (const other of Object.values(w.alliances)) delete other.diplomacy[a.id];
    }
    return;
  }
  if (c.type === 'allianceRole') {
    assertRule(a.members[actor] === 'leader' && a.members[c.playerId], 'تغيير الرتب لقائد التحالف');
    assertRule(c.playerId !== actor, 'انقل القيادة إلى عضو آخر');
    if (c.role === 'leader') a.members[actor] = 'officer';
    a.members[c.playerId] = c.role;
    return;
  }
  assertRule(
    a.members[actor] === 'leader' || a.members[actor] === 'officer',
    'تحتاج صلاحية دبلوماسية',
  );
  const other = w.alliances[c.allianceId];
  assertRule(other && other.id !== a.id, 'تحالف غير صالح');
  a.diplomacy = { ...a.diplomacy, [other.id]: c.status };
  // War is unilateral; alliance and peace require matching declarations from both sides.
  if (c.status === 'war') other.diplomacy = { ...other.diplomacy, [a.id]: 'war' };
  report(
    w,
    at,
    [...Object.keys(a.members), ...Object.keys(other.members)],
    'تحديث دبلوماسي',
    `${a.name}: ${c.status === 'war' ? 'إعلان حرب' : c.status === 'ally' ? 'اقتراح تحالف' : 'اقتراح سلام'}`,
  );
}
function claim(w: KingdomsWorld, actor: string, c: Extract<KingdomsCommand, { type: 'claim' }>) {
  const p = w.players[actor],
    villages = Object.values(w.villages).filter((v) => v.ownerId === actor).sort((a,b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  assertRule(!p.claims.includes(c.mission), 'استلمت المكافأة مسبقاً');
  const ready =
    c.mission === 'builder'
      ? villages.some((v) =>
          Object.entries(v.buildings).some(([k, n]) => n > (k === 'hall' ? 1 : 0)),
        )
      : c.mission === 'commander'
        ? villages.some((v) => total(v.troops) >= 10)
        : p.achievements.includes(c.mission);
  assertRule(ready, 'المهمة غير مكتملة');
  p.claims = [...p.claims, c.mission];
  p.achievements = [...new Set([...p.achievements, c.mission])];
  p.score += w.config.questScore;
  credit(w, villages[0], w.config.questReward);
  awardVillageXp(villages[0], progressionConfig(w).achievementXp);
  if (c.mission === 'commander') {
    const commanderId = villages.find((v) => v.commanderId && total(v.troops) >= 10)?.commanderId;
    if (commanderId && w.commanders?.[commanderId]?.playerId === actor) addCommanderExperience(w, commanderId, commanderConfig(w).questXp);
  }
}
function claimAllianceEvent(
  w: KingdomsWorld,
  actor: string,
  c: Extract<KingdomsCommand, { type: 'allianceEventClaim' }>,
  at: number,
) {
  const village = own(w, actor, c.villageId);
  const event = projectAllianceEvent(w, actor, at);
  assertRule(event && event.eventKey === c.eventKey, 'انتهت الفعالية أو تغير موعدها؛ حدّث الصفحة');
  assertRule(event.canClaim, 'المكافأة غير متاحة؛ أكمل مساهمتك وهدف التحالف أو تحقق من عضويتك');
  assertRule(
    resourceKeys.every((key) => village.resources[key] + event.reward[key] <= capacity(w, village)),
    'لا توجد سعة كافية في المخزن لاستلام المكافأة كاملة',
  );
  w.players[actor].allianceEvent = { ...w.players[actor].allianceEvent!, claimed: true };
  credit(w, village, event.reward);
  const names = { wood: 'خشب', stone: 'حجر', iron: 'حديد', food: 'غذاء', gold: 'ذهب' };
  const receipt = resourceKeys.map((key) => `${event.reward[key]} ${names[key]}`).join('، ');
  report(
    w,
    at,
    [actor],
    'مكافأة فعالية التحالف',
    `${event.title}: استلمت ${receipt} في ${village.name}`,
  );
}
function recall(
  w: KingdomsWorld,
  actor: string,
  c: Extract<KingdomsCommand, { type: 'recall' }>,
  at: number,
) {
  const home = own(w, actor, c.villageId),
    host = w.villages[c.hostVillageId],
    troops = host?.reinforcements[home.id];
  assertRule(troops && total(troops) > 0, 'لا توجد تعزيزات قابلة للاستدعاء');
  const recalledCommanderId = host.reinforcementCommanders?.[home.id];
  const recalledCommander = recalledCommanderId ? w.commanders?.[recalledCommanderId] : undefined;
  const speed = Math.min(
    ...unitKeys.filter((k) => troops[k] > 0).map((k) => w.config.units[k].speed),
  );
  const travelMs = Math.max(
    1000,
    Math.ceil(
      (Math.hypot(home.x - host.x, home.y - host.y) * w.config.secondsPerTile * 1000) / (speed * commanderTravelFactor(w.config, recalledCommander)),
    ),
  );
  deadline(at, travelMs);
  returnMovement(
    w,
    {
      id: '',
      ownerId: actor,
      sourceId: home.id,
      targetX: home.x,
      targetY: home.y,
      mission: 'return',
      troops,
      travelMs,
      departedAt: at,
      arrivesAt: at + travelMs,
      loot: resources(),
      ...(host.reinforcementCommanders?.[home.id] ? { commanderId: host.reinforcementCommanders[home.id] } : {}),
    },
    at,
  );
  delete host.reinforcements[home.id];
  const commanderId = host.reinforcementCommanders?.[home.id];
  if (commanderId) {
    const commander = w.commanders?.[commanderId];
    if (commander) setCommander(w, { ...commander, status: 'marching' });
    delete host.reinforcementCommanders![home.id];
  }
}
export function executeCommand(
  state: KingdomsWorld,
  actorId: string,
  input: KingdomsCommand,
  now: number,
): KingdomsWorld {
  try {
    assertRule(
      actorId.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(actorId),
      'حساب غير صالح',
    );
    const c = kingdomsCommandSchema.parse(input),
      w = advanceWorld(state, now),
      at = Math.max(now, w.updatedAt);
    assertRule(w.season.status === 'active', 'انتهى الموسم');
    if (c.type === 'found') {
      found(w, actorId, c.name, at);
      refreshProgression(w, deployedTroops(w));
      return w;
    }
    assertRule(w.players[actorId], 'أنشئ مملكتك أولاً');
    switch (c.type) {
      case 'commanderRecruit': {
        const village = own(w, actorId, c.villageId);
        const config = commanderConfig(w);
        assertRule(Object.values(w.commanders ?? {}).filter((commander) => commander.playerId === actorId).length < config.maxPerPlayer, 'commander.error.limit');
        spend(village, config.recruitmentCost);
        const id = nextId(w, 'c');
        setCommander(w, createCommander(w, id, actorId, c.name, c.specialization));
        break;
      }
      case 'commanderAssign': {
        const village = own(w, actorId, c.villageId);
        const commander = availableCommander(w, actorId, c.commanderId, at);
        assertRule(!village.commanderId || village.commanderId === commander.id, 'commander.error.villageOccupied');
        for (const home of Object.values(w.villages)) if (home.commanderId === commander.id) delete home.commanderId;
        village.commanderId = commander.id;
        setCommander(w, { ...commander, villageId: village.id, homeVillageId: village.id, status: 'assigned' });
        break;
      }
      case 'commanderUnassign': {
        const commander = availableCommander(w, actorId, c.commanderId, at);
        for (const village of Object.values(w.villages)) if (village.commanderId === commander.id) delete village.commanderId;
        const { villageId: _village, homeVillageId: _home, ...rest } = commander;
        void _village; void _home;
        setCommander(w, { ...rest, status: 'available' });
        break;
      }
      case 'build':
        build(w, actorId, c, at);
        break;
      case 'cancelBuild':
        cancelConstruction(w, own(w, actorId, c.villageId), c.itemId, at);
        break;
      case 'train':
        train(w, actorId, c, at);
        break;
      case 'march':
        march(w, actorId, c, at);
        break;
      case 'recall':
        recall(w, actorId, c, at);
        break;
      case 'tradeOffer':
      case 'tradeAccept':
      case 'tradeCancel':
        trade(w, actorId, c, at);
        break;
      case 'allianceCreate':
      case 'allianceJoin':
      case 'allianceApprove':
      case 'allianceReject':
      case 'allianceKick':
      case 'allianceRole':
      case 'allianceLeave':
      case 'diplomacy':
        alliance(w, actorId, c, at);
        break;
      case 'allianceEventClaim':
        claimAllianceEvent(w, actorId, c, at);
        break;
      case 'claim':
        claim(w, actorId, c);
        break;
      case 'throne': {
        const v = own(w, actorId, c.villageId);
        assertRule(
          at >=
            w.season.startsAt +
              (w.season.endsAt - w.season.startsAt) * w.config.throneUnlockFraction,
          'لم تبدأ مرحلة العرش',
        );
        const value = Math.floor(
          Math.min(
            ...resourceKeys.map(
              (k) => c.resources[k] * (k === 'gold' ? w.config.throneGoldWeight : 1),
            ),
          ),
        );
        assertRule(value > 0, 'العرش يتطلب مساهمة متوازنة من جميع الموارد');
        spend(v, c.resources);
        w.players[actorId].throne += value;
        w.players[actorId].score += value;
        report(w, at, [actorId], 'مساهمة في عرش تحدي', `أضيفت ${value} نقطة عهد إلى رصيد المملكة`);
        break;
      }
    }
    refreshProgression(w, deployedTroops(w));
    return w;
  } catch (error) {
    if (error instanceof KingdomsError) throw error;
    throw new KingdomsError(error instanceof Error ? error.message : 'تعذّر تنفيذ الأمر');
  }
}
function isIncomingMission(mission: Movement['mission']): mission is IncomingMission {
  return (incomingMissions as readonly string[]).includes(mission);
}
function incomingSource(w: KingdomsWorld, sourceId: string): IncomingSourceView | undefined {
  const source = w.villages[sourceId];
  const owner = source ? w.players[source.ownerId] : undefined;
  if (!source || !owner) return undefined;
  return {
    id: source.id,
    name: source.name,
    x: source.x,
    y: source.y,
    kingdomName: owner.name,
    ownerId: source.ownerId,
    ...(owner.allianceId ? { allianceId: owner.allianceId } : {}),
    protectedUntil: owner.protectionUntil,
  };
}
/** Target-owner inbound only. Omits troops, commander, loot, and travel fields. */
export function projectIncoming(w: KingdomsWorld, actorId: string): IncomingMovementView[] {
  const targets = new Map<string, string>();
  for (const village of Object.values(w.villages)) {
    if (village.ownerId === actorId) targets.set(`${village.x},${village.y}`, village.id);
  }
  const incoming: IncomingMovementView[] = [];
  for (const movement of w.movements) {
    if (movement.ownerId === actorId || !isIncomingMission(movement.mission)) continue;
    const targetVillageId = targets.get(`${movement.targetX},${movement.targetY}`);
    if (!targetVillageId) continue;
    const source = incomingSource(w, movement.sourceId);
    incoming.push({
      id: movement.id,
      mission: movement.mission,
      targetVillageId,
      arrivesAt: movement.arrivesAt,
      ...(source ? { source } : {}),
    });
  }
  return incoming.sort(
    (left, right) => left.arrivesAt - right.arrivesAt || left.id.localeCompare(right.id, 'en'),
  );
}
export function projectWorld(state: KingdomsWorld, actorId: string, now: number): KingdomsView {
  const w = advanceWorld(state, now);
  const villages = Object.values(w.villages);
  const ownVillages = villages.filter((v) => v.ownerId === actorId);
  const away = deployedTroops(w);
  const villageCounts = new Map<string, number>();
  for (const village of villages) {
    villageCounts.set(village.ownerId, (villageCounts.get(village.ownerId) ?? 0) + 1);
  }
  return {
    commanders: projectCommanders(w, actorId),
    serverNow: now,
    resourceSites: projectResourceSites(w, actorId, Math.max(now, w.updatedAt)),
    allianceEvent: projectAllianceEvent(w, actorId, Math.max(now, w.updatedAt)),
    config: w.config,
    season: w.season,
    player: w.players[actorId] ?? null,
    villages: ownVillages,
    productionRates: Object.fromEntries(
      ownVillages.map((v) => [v.id, production(w, v, away.get(v.id) ?? emptyTroops())]),
    ),
    map: villages.map((v) => ({
      id: v.id,
      ownerId: v.ownerId,
      name: v.name,
      x: v.x,
      y: v.y,
      kingdomName: w.players[v.ownerId].name,
      allianceId: w.players[v.ownerId].allianceId,
      protectedUntil: w.players[v.ownerId].protectionUntil,
    })),
    movements: w.movements.filter((m) => m.ownerId === actorId),
    incoming: projectIncoming(w, actorId),
    reports: w.reports.filter((r) => r.recipients.includes(actorId)).slice(-100),
    alliances: Object.values(w.alliances).map((a) => ({
      ...a,
      pending:
        a.members[actorId] === 'leader' || a.members[actorId] === 'officer'
          ? (a.pending ?? [])
          : (a.pending ?? []).filter((id) => id === actorId),
    })),
    offers: w.offers,
    territories: w.territories,
    leaderboard: Object.values(w.players)
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        throne: p.throne,
        allianceId: p.allianceId,
        villages: villageCounts.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, 100),
  };
}

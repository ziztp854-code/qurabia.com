import { catalog, getArm, getBuilding, getCastle, listRecruitableArms } from './catalog';
import {
  advanceTowerBattle,
  connectTowerRoute,
  createTowerBattle,
  disconnectTowerRoute,
} from './tower';
import type { AlfazaaState, Command, CommandResult, Cost } from './types';
import { claimQuest } from './quests';

const validTime = (n: number) => Number.isSafeInteger(n) && n >= 0;
const position = (n: number) => Number.isInteger(n) && n >= 0 && n < 36;
const failureMessages: Record<string, string> = {
  INSUFFICIENT_RESOURCES: 'الموارد غير كافية. راجع التكلفة أو اجمع الإنتاج أو مكافآت المهام.',
  CASTLE_REQUIRED: 'مستوى القلعة لا يسمح بهذه الترقية بعد. طوّر القلعة أولًا.',
  BUILDING_REQUIRED: 'يلزم تطوير المبنى المطلوب قبل ترقية القلعة.',
  MERGE_MISMATCH: 'اختر وحدتين أو مبنيين متطابقين في النوع والمستوى.',
  BUILDING_MERGE_REQUIRED: 'هذا المبنى يرتقي بدمج نسختين متطابقتين، وليس بترقية مباشرة.',
  BUILDING_UPGRADE_UNAVAILABLE: 'ترقية هذا النوع من المباني غير متاحة في هذه النسخة.',
  QUEST_ALREADY_CLAIMED:
    'استُلمت هذه المكافأة بالفعل. مكافأة الحضور تتجدد عند منتصف الليل بتوقيت الرياض.',
  QUEST_REQUIREMENT: 'أنجز شرط المهمة أولًا ثم استلم المكافأة.',
  NOT_READY: 'لم تكتمل دقيقة إنتاج جديدة بعد.',
  NO_PRODUCTION: 'لا يوجد إنتاج للذهب. ابنِ مسكنًا من قائمة البناء.',
  RESOURCE_LIMIT: 'بلغ أحد الموارد الحد الأقصى؛ لم تُستهلك مكافأة المهمة.',
  CITY_FULL: 'أرض المدينة ممتلئة. ادمج وحدتين أو مبنيين متطابقين لتوفير خانة.',
  ALREADY_BUILT: 'هذا المبنى الفريد موجود بالفعل في المدينة.',
  BATTLE_FINISHED: 'انتهى التدريب. اختر مرحلة أو أعد المحاولة.',
  ROUTE_BLOCKED: 'يوجد حاجز يمنع هذا المسار. اختر هدفًا آخر.',
  INVALID_TIME: 'توقيت حالة اللعب غير متسق. أعد المزامنة.',
  MAX_LEVEL: 'وصل هذا المبنى إلى أعلى مستوى متاح.',
};
export function createInitialState(now: number): AlfazaaState {
  if (!validTime(now)) throw new Error('INVALID_TIME');
  const starter = listRecruitableArms()[0];
  const resources = new Set(
    catalog.arms
      .flatMap((a) => a.cost.map((c) => c[0]))
      .concat(catalog.meta.blueprintItemId, catalog.meta.goldItemId),
  );
  return {
    version: 2,
    revision: 0,
    castleLevel: 1,
    balances: Object.fromEntries(
      [...resources].map((id) => [id, id === catalog.meta.goldItemId ? 20000 : 200]),
    ),
    cells: Array.from({ length: 36 }, (_, i) =>
      i < 2 && starter
        ? { id: String(i + 1), kind: 'troop' as const, cfgId: starter.id }
        : i === 35
          ? { id: '3', kind: 'building' as const, cfgId: 40001 }
          : null,
    ),
    nextId: 4,
    lastCollectedAt: now,
    completedTowerLevels: [],
    battle: null,
    updatedAt: now,
    quests: { claimed: [], lastDailyClaimDay: null },
  };
}
export function advanceState(state: AlfazaaState, now: number): AlfazaaState {
  if (!validTime(now) || now < state.updatedAt) throw new Error('INVALID_TIME');
  const battle = state.battle ? advanceTowerBattle(state.battle, now) : null;
  const completed =
    battle?.status === 'won' && !state.completedTowerLevels.includes(battle.levelId)
      ? [...state.completedTowerLevels, battle.levelId].sort((a, b) => a - b)
      : state.completedTowerLevels;
  return { ...state, battle, completedTowerLevels: completed, updatedAt: now };
}
function pay(state: AlfazaaState, cost: Cost): AlfazaaState {
  const totals: Record<string, number> = {};
  for (const [id, amount] of cost) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('INVALID_COST');
    totals[id] = (totals[id] ?? 0) + amount;
  }
  if (Object.entries(totals).some(([id, amount]) => (state.balances[id] ?? 0) < amount))
    throw new Error('INSUFFICIENT_RESOURCES');
  return {
    ...state,
    balances: Object.fromEntries(
      Object.entries(state.balances).map(([id, value]) => [id, value - (totals[id] ?? 0)]),
    ),
  };
}
function upgradeAllowed(state: AlfazaaState, row: NonNullable<ReturnType<typeof getBuilding>>) {
  if (state.castleLevel < row.requireCastle) throw new Error('CASTLE_REQUIRED');
  if (row.requireBuilding) {
    const needed = getBuilding(row.requireBuilding);
    if (
      !needed ||
      !state.cells.some(
        (c) =>
          c?.kind === 'building' &&
          getBuilding(c.cfgId)?.type === needed.type &&
          (getBuilding(c.cfgId)?.level ?? 0) >= needed.level,
      )
    )
      throw new Error('BUILDING_REQUIRED');
  }
}
/** Source housing Value is gold/minute; research/ownership boosts are not ported. */
export function getGoldPerMinute(state: AlfazaaState): number {
  return state.cells.reduce((sum, cell) => {
    const row = cell?.kind === 'building' ? getBuilding(cell.cfgId) : undefined;
    return sum + (row?.type === 4 ? row.value : 0);
  }, 0);
}
function settleProduction(state: AlfazaaState, now: number, rateChanging = false): AlfazaaState {
  const count = Math.min(720, Math.floor((now - state.lastCollectedAt) / 60000));
  if (count < 1 && !rateChanging) throw new Error('NOT_READY');
  const gold = String(catalog.meta.goldItemId),
    rate = getGoldPerMinute(state);
  if (rate === 0 && !rateChanging) throw new Error('NO_PRODUCTION');
  return {
    ...state,
    lastCollectedAt: now,
    balances: {
      ...state.balances,
      [gold]: Math.min(1e12, (state.balances[gold] ?? 0) + Math.max(0, count) * rate),
    },
  };
}
function cityCommand(state: AlfazaaState, command: Command, now: number): AlfazaaState {
  if (command.type === 'collect') {
    return settleProduction(state, now);
  }
  if (command.type === 'upgrade-castle') {
    const row = getCastle(state);
    if (!row?.nextId || !getBuilding(row.nextId)) throw new Error('MAX_LEVEL');
    upgradeAllowed(state, row);
    return {
      ...pay(state, [...row.upgradeCost, [catalog.meta.goldItemId, row.upgradeGold]]),
      castleLevel: getBuilding(row.nextId)!.level,
    };
  }
  const cells = [...state.cells];
  if (command.type === 'recruit') {
    const arm = listRecruitableArms().find((a) => a.id === command.cfgId);
    if (!arm) throw new Error('INVALID_ARM');
    const i = cells.indexOf(null);
    if (i < 0) throw new Error('CITY_FULL');
    cells[i] = { id: String(state.nextId), kind: 'troop', cfgId: arm.id };
    return { ...pay(state, arm.cost), cells, nextId: state.nextId + 1 };
  }
  if (command.type === 'move' || command.type === 'merge') {
    if (!position(command.from) || !position(command.to) || command.from === command.to)
      throw new Error('INVALID_POSITION');
    const source = cells[command.from],
      target = cells[command.to];
    if (!source) throw new Error('EMPTY_CELL');
    if (command.type === 'move') {
      if (target) throw new Error('OCCUPIED_CELL');
      cells[command.to] = source;
      cells[command.from] = null;
      return { ...state, cells };
    }
    if (source.kind === 'building') {
      const building = getBuilding(source.cfgId),
        next = building?.nextId ? getBuilding(building.nextId) : undefined;
      if (
        !target ||
        target.kind !== 'building' ||
        target.cfgId !== source.cfgId ||
        !building ||
        building.lvType !== 0 ||
        !next ||
        next.type !== building.type
      )
        throw new Error('MERGE_MISMATCH');
      // Original research service is unavailable: Fazaa's explicit castle cap replaces it.
      if (next.level > state.castleLevel) throw new Error('CASTLE_REQUIRED');
      const settled = building.type === 4 ? settleProduction(state, now, true) : state;
      cells[command.to] = { ...target, cfgId: next.id };
      cells[command.from] = null;
      return { ...settled, cells };
    }
    const arm = source.kind === 'troop' ? getArm(source.cfgId) : undefined;
    const next = arm?.nextId ? getArm(arm.nextId) : undefined;
    if (
      !target ||
      target.kind !== 'troop' ||
      target.cfgId !== source.cfgId ||
      !arm ||
      arm.subtype === 3 ||
      !next ||
      next.type !== arm.type
    )
      throw new Error('MERGE_MISMATCH');
    // New-game research replacement: castle level permits two troop tiers beyond itself.
    if (next.level > state.castleLevel + 2) throw new Error('CASTLE_REQUIRED');
    cells[command.to] = { ...target, cfgId: next.id };
    cells[command.from] = null;
    return { ...state, cells };
  }
  if (command.type === 'build') {
    if (!position(command.cell) || cells[command.cell]) throw new Error('INVALID_POSITION');
    const row = getBuilding(command.cfgId);
    if (!row || row.type === 11 || row.level !== 1) throw new Error('INVALID_BUILDING');
    // LvLimit/MakeLimit belong to the current row's upgrade, not construction.
    if (
      row.lvType !== 0 &&
      cells.some((c) => c?.kind === 'building' && getBuilding(c.cfgId)?.type === row.type)
    )
      throw new Error('ALREADY_BUILT');
    cells[command.cell] = { id: String(state.nextId), kind: 'building', cfgId: row.id };
    const settled = row.type === 4 ? settleProduction(state, now, true) : state;
    return { ...pay(settled, row.buildCost), cells, nextId: state.nextId + 1 };
  }
  if (command.type === 'upgrade-building') {
    if (!position(command.cell)) throw new Error('INVALID_POSITION');
    const cell = cells[command.cell],
      row = cell?.kind === 'building' ? getBuilding(cell.cfgId) : undefined;
    if (!cell || !row?.nextId || !getBuilding(row.nextId)) throw new Error('INVALID_BUILDING');
    if (row.lvType === 0) throw new Error('BUILDING_MERGE_REQUIRED');
    if (row.lvType !== 1) throw new Error('BUILDING_UPGRADE_UNAVAILABLE');
    upgradeAllowed(state, row);
    cells[command.cell] = { ...cell, cfgId: row.nextId };
    return {
      ...pay(state, [...row.upgradeCost, [catalog.meta.goldItemId, row.upgradeGold]]),
      cells,
    };
  }
  throw new Error('UNKNOWN_COMMAND');
}
export function applyCommand(input: AlfazaaState, command: Command, now: number): CommandResult {
  try {
    let state = advanceState(input, now);
    if (command.type === 'tower-start')
      state = { ...state, battle: createTowerBattle(command.levelId, now) };
    else if (command.type === 'tower-quit') state = { ...state, battle: null };
    else if (command.type === 'tower-route' || command.type === 'tower-disconnect') {
      if (!state.battle) throw new Error('NO_BATTLE');
      state = {
        ...state,
        battle:
          command.type === 'tower-route'
            ? connectTowerRoute(state.battle, command.from, command.to, now)
            : disconnectTowerRoute(state.battle, command.from, command.to, now),
      };
    } else if (command.type === 'tower-tick') {
      if (!state.battle) throw new Error('NO_BATTLE');
    } else if (command.type === 'claim-quest') state = claimQuest(state, command.questId, now);
    else state = cityCommand(state, command, now);
    return {
      ok: true,
      state: { ...state, revision: input.revision + 1 },
      code: 'OK',
      message: 'تم تنفيذ الأمر',
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_COMMAND';
    return {
      ok: false,
      state: input,
      code,
      message: failureMessages[code] ?? 'تعذّر تنفيذ الأمر؛ راجع الموارد والمتطلبات',
    };
  }
}

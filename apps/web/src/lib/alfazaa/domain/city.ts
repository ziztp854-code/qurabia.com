import { catalog, getArm, getBuilding, getCastle, listRecruitableArms } from './catalog';
import {
  advanceTowerBattle,
  connectTowerRoute,
  createTowerBattle,
  disconnectTowerRoute,
} from './tower';
import type { AlfazaaState, Command, CommandResult, Cost } from './types';
import { claimQuest } from './quests';
import { getGoldPerMinute } from './state';
import { advanceRealm, realmCommand } from '../realm/reducer';
import { recordGameEvents } from '../realm/systems-state';
import { getArmyCap } from '../realm/systems-read';
import type { GameEvent, GameplaySnapshot } from '../realm/common';
import { getGameplayContext } from '../realm/context';
import { researchRow } from '../realm/systems-catalog';
export { createInitialState, getGoldPerMinute } from './state';

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
  RESEARCH_REQUIRED: 'أكمل البحث المطلوب من ديوان المملكة قبل الترقية.',
  PLAYER_REQUIRED: 'مستوى اللاعب لا يفي بالمتطلب. أكمل المهام والقتال والتدريب لاكتساب الخبرة.',
};
export function advanceState(state: AlfazaaState, now: number): AlfazaaState {
  if (!validTime(now) || now < state.updatedAt) throw new Error('INVALID_TIME');
  const battle = state.battle ? advanceTowerBattle(state.battle, now) : null;
  const completed =
    battle?.status === 'won' && !state.completedTowerLevels.includes(battle.levelId)
      ? [...state.completedTowerLevels, battle.levelId].sort((a, b) => a - b)
      : state.completedTowerLevels;
  const events: GameEvent[] = completed.length > state.completedTowerLevels.length
    ? [{ type: 'tower-win', amount: 1, target: battle!.levelId }] : [];
  const advanced = advanceRealm({ ...state, battle, completedTowerLevels: completed, updatedAt: now }, now);
  return { ...advanced, realm: { ...advanced.realm,
    systems: recordGameEvents(advanced.realm.systems, events, now) } };
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
  if (getGameplayContext(state).view.playerLevel < (row.roleLevel ?? 0)) throw new Error('PLAYER_REQUIRED');
  for (const [tree, id] of [['college', row.collegeLimit], ['science', row.scienceLimit]] as const) {
    const needed = id ? researchRow(tree, id) : undefined;
    const owned = needed ? researchRow(tree, state.realm.systems.research[needed.key] ?? 0) : undefined;
    // Initial source research rows describe the baseline capability.
    if (needed && needed.level > 1 && (owned?.level ?? 0) < needed.level) throw new Error('RESEARCH_REQUIRED');
  }
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
function settleProduction(state: AlfazaaState, now: number, rateChanging = false): AlfazaaState {
  const count = Math.min(720, Math.floor((now - state.lastCollectedAt) / 60000));
  if (count < 1 && !rateChanging) throw new Error('NOT_READY');
  const gold = String(catalog.meta.goldItemId),
    rate = Math.floor(getGoldPerMinute(state) * (1 + Math.max(0, Math.min(10, getGameplayContext(state).bonuses.production))));
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
    if (next.level > getArmyCap(state.realm.systems, arm.type, state.castleLevel)) throw new Error('CASTLE_REQUIRED');
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
    if (![1, 2].includes(row.lvType)) throw new Error('BUILDING_UPGRADE_UNAVAILABLE');
    upgradeAllowed(state, row);
    cells[command.cell] = { ...cell, cfgId: row.nextId };
    return {
      ...pay(state, [...row.upgradeCost, [catalog.meta.goldItemId, row.upgradeGold]]),
      cells,
    };
  }
  throw new Error('UNKNOWN_COMMAND');
}
export function applyCommand(input: AlfazaaState, command: Command, now: number,
  world?: GameplaySnapshot['world']): CommandResult {
  try {
    let state = advanceState(input, now);
    const realm = realmCommand(state, command, now, world);
    if (realm) return realm.ok ? { ...realm, state: { ...realm.state, revision: input.revision + 1 } }
      : { ...realm, state: input };
    const before = state;
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
    if (command.type === 'move' || command.type === 'merge') {
      const selected = state.realm.heroes.troopCells.map(index => index === command.from ? command.to : index)
        .filter(index => state.cells[index]?.kind === 'troop');
      state = { ...state, realm: { ...state.realm, heroes: { ...state.realm.heroes, troopCells: [...new Set(selected)] } } };
    }
    const event = cityEvent(before, state, command);
    if (event) state = { ...state, realm: { ...state.realm,
      systems: recordGameEvents(state.realm.systems, [event, ...(command.type === 'collect' ? [{type:'resource-gather',target:400001,
        amount:(state.balances['400001']??0)-(before.balances['400001']??0)}] : [])], now) } };
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

function cityEvent(before: AlfazaaState, after: AlfazaaState, command: Command): GameEvent | null {
  if (command.type === 'recruit') return { type: 'recruit', amount: 1, target: command.cfgId, level: 1 };
  if (command.type === 'build') return { type: 'build', amount: 1, target: command.cfgId, level: 1 };
  if (command.type === 'merge') {
    const cell = after.cells[command.to];
    return cell ? { type: 'merge', amount: 1, target: cell.cfgId,
      level: (cell.kind === 'troop' ? getArm(cell.cfgId) : getBuilding(cell.cfgId))?.level } : null;
  }
  if (command.type === 'upgrade-building') return { type: 'upgrade-building', amount: 1,
    target: after.cells[command.cell]?.cfgId, level: getBuilding(after.cells[command.cell]?.cfgId ?? 0)?.level };
  if (command.type === 'upgrade-castle') return { type: 'upgrade-castle', amount: 1, level: after.castleLevel };
  if (command.type === 'collect' && (after.balances['400001'] ?? 0) > (before.balances['400001'] ?? 0))
    return { type: 'collect', amount: 1, target: 400001 };
  return null;
}

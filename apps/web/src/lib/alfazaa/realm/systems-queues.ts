import type { GameplayContext, GameplayResult, Reward } from './common';
import { getBuilding } from '../domain/catalog';
import { armRow, isPlayableArm, systemsCatalog } from './systems-catalog';
import type { SystemsState } from './systems-types';
import { getArmyCap, getHealingResearch } from './systems-read';
import { completeResearch } from './systems-research';
import { recordGameEvents, resetSystemsDay } from './systems-state';
import { accepted, countValid, rejected, transact } from './systems-utils';
function barracksLevel(context: GameplayContext, armType: number) {
  const family = armType + 1;
  return Math.max(
    0,
    ...context.view.cells.map((c) => {
      const b = c?.kind === 'building' ? getBuilding(c.cfgId) : undefined;
      return b?.type === family ? b.level : 0;
    }),
  );
}
export function trainingCost(cfgId: number): Reward {
  const row = armRow(cfgId);
  if (!isPlayableArm(row)) throw Error('REQUIREMENT');
  if (row.cost.length) return row.cost;
  // Source-only special troops sometimes have no purchase cost; they must not
  // become free. Independent fallback derives a bounded cost from family1.
  const base = systemsCatalog.arms.find(
    (a) => isPlayableArm(a) && a.type === row.type && a.level === 1,
  );
  const gold = base?.cost.find(([id]) => id === 400001)?.[1] ?? 100;
  return [[400001, Math.min(1e12, gold * 2 ** Math.min(30, row.level - 1))]];
}
export function startTraining(
  state: SystemsState,
  cfgId: number,
  count: number,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  const row = armRow(cfgId);
  if (!isPlayableArm(row) || !countValid(count)) throw Error('INVALID_COUNT');
  if (
    barracksLevel(context, row.type) < row.level ||
    row.level > getArmyCap(state, row.type, context.view.castleLevel)
  )
    throw Error('REQUIREMENT');
  if (state.jobs.filter((j) => j.kind === 'training').length >= 3 || state.jobs.length >= 8)
    throw Error('QUEUE_FULL');
  const balances = transact(context.balances, trainingCost(cfgId), [], count);
  const seconds = Math.max(
    1,
    Math.min(
      604800,
      Math.ceil((row.seconds * count) / (1 + Math.max(0, Math.min(10, context.bonuses.training)))),
    ),
  );
  const job = {
    id: state.nextJobId,
    kind: 'training' as const,
    target: cfgId,
    count,
    startedAt: context.now,
    finishAt: context.now + seconds * 1000,
  };
  return accepted(
    { ...state, jobs: [...state.jobs, job], nextJobId: state.nextJobId + 1 },
    balances,
    [],
    'بدأ التدريب؛ الوحدات المكتملة تصل إلى الاحتياط.',
  );
}
export function startHealing(
  state: SystemsState,
  cfgId: number,
  count: number,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  const row = armRow(cfgId);
  if (!isPlayableArm(row) || !countValid(count)) throw Error('INVALID_COUNT');
  const hospital = Math.max(
    0,
    ...context.view.cells.map((c) => {
      const b = c?.kind === 'building' ? getBuilding(c.cfgId) : undefined;
      return b?.type === 5 ? b.level : 0;
    }),
  );
  const research = getHealingResearch(state);
  if (!hospital || count > hospital * 10 + research.capacity || (state.wounded[cfgId] ?? 0) < count)
    throw Error('REQUIREMENT');
  if (state.jobs.some((j) => j.kind === 'healing') || state.jobs.length >= 8)
    throw Error('QUEUE_FULL');
  const balances = transact(context.balances, row.healCost, [], count);
  const job = {
    id: state.nextJobId,
    kind: 'healing' as const,
    target: cfgId,
    count,
    startedAt: context.now,
    finishAt:
      context.now +
      Math.max(1, Math.min(604800, Math.ceil((row.healSeconds * count) / (1 + research.speed)))) *
        1000,
  };
  return accepted(
    {
      ...state,
      wounded: { ...state.wounded, [cfgId]: state.wounded[cfgId] - count },
      jobs: [...state.jobs, job],
      nextJobId: state.nextJobId + 1,
    },
    balances,
    [],
    'بدأ العلاج.',
  );
}
export function deployTroop(
  state: SystemsState,
  cfgId: number,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  if (!isPlayableArm(armRow(cfgId)) || (state.reserve[cfgId] ?? 0) < 1) throw Error('REQUIREMENT');
  if (!context.view.cells.some((c) => c === null)) throw Error('CITY_FULL');
  return accepted(
    { ...state, reserve: { ...state.reserve, [cfgId]: state.reserve[cfgId] - 1 } },
    context.balances,
    [{ type: 'troop-deploy', amount: 1, target: cfgId }],
    'وصلت الوحدة إلى المدينة.',
  );
}
export function getTrainingOffers(state: SystemsState, context: GameplayContext) {
  return systemsCatalog.arms
    .filter(isPlayableArm)
    .map((row) => ({
      ...row,
      cost: trainingCost(row.id),
      eligible:
        barracksLevel(context, row.type) >= row.level &&
        row.level <= getArmyCap(state, row.type, context.view.castleLevel),
    }));
}
export function getHealingOffers(state: SystemsState, context: GameplayContext, count: number) {
  const hospital = Math.max(
    0,
    ...context.view.cells.map((c) => {
      const b = c?.kind === 'building' ? getBuilding(c.cfgId) : undefined;
      return b?.type === 5 ? b.level : 0;
    }),
  );
  return Object.entries(state.wounded)
    .filter(([, n]) => n > 0)
    .map(([id, owned]) => {
      const row = armRow(+id),
        amount = Math.min(count, owned);
      return {
        id: +id,
        count: amount,
        cost: row?.healCost.map(([key, n]): [number, number] => [key, n * amount]) ?? [],
        eligible:
          isPlayableArm(row) &&
          hospital > 0 &&
          amount <= hospital * 10 + getHealingResearch(state).capacity &&
          !state.jobs.some((j) => j.kind === 'healing') &&
          state.jobs.length < 8,
      };
    });
}
export function advanceSystems(
  state: SystemsState,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  try {
    let next = resetSystemsDay(state, context.now),
      balances = context.balances;
    const due = next.jobs
      .filter((j) => j.finishAt <= context.now)
      .sort((a, b) => a.finishAt - b.finishAt || a.id - b.id);
    next = { ...next, jobs: next.jobs.filter((j) => j.finishAt > context.now) };
    const events: GameplayResult<SystemsState>['events'] = [];
    for (const job of due) {
      if (job.kind === 'research') {
        const result = completeResearch(next, job.tree ?? 'college', job.target, {
          ...context,
          balances,
        });
        next = result.state;
        balances = result.balances;
        events.push(...result.events);
      } else if (job.kind === 'training' || job.kind === 'healing') {
        const row = armRow(job.target);
        if (!isPlayableArm(row)) throw Error('REQUIREMENT');
        const amount = (next.reserve[job.target] ?? 0) + job.count;
        if (amount > 100000) {
          next = { ...next, jobs: [...next.jobs, job] };
          continue;
        }
        next = { ...next, reserve: { ...next.reserve, [job.target]: amount } };
        if (job.kind === 'training' && row.xp > 0)
          balances = transact(balances, [], [[1200001, row.xp * job.count]]);
        events.push({
          type: job.kind === 'training' ? 'recruit' : 'heal',
          amount: job.count,
          target: job.target,
          level: row.level,
        });
      } else {
        if (!systemsCatalog.beasts.some((b) => b.id === job.target)) throw Error('REQUIREMENT');
        next = { ...next, beasts: { ...next.beasts, [job.target]: 1 } };
        events.push({ type: 'beast-hatch', amount: 1, target: job.target, level: 1 });
      }
    }
    return accepted(recordGameEvents(next, events, context.now), balances, events);
  } catch (error) {
    return rejected(state, context, error);
  }
}

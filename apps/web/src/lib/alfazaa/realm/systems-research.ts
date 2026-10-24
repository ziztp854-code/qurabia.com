import type { GameplayContext, GameplayResult } from './common';
import { researchRow, systemsCatalog, type ResearchRow } from './systems-catalog';
import type { ResearchTree, SystemsState } from './systems-types';
import { accepted, transact } from './systems-utils';
import { getBuilding } from '../domain/catalog';
export function researchAllowed(
  state: SystemsState,
  row: ResearchRow,
  context: GameplayContext,
): boolean {
  const current = researchRow(row.tree, state.research[row.key] ?? 0);
  const previous = researchRow(row.tree, row.previous);
  if (
    row.level <= 0 ||
    current?.id === row.id ||
    (current ? current.next !== row.id : previous && previous.level > 0)
  )
    return false;
  if (context.view.castleLevel < row.castle || context.view.playerLevel < row.playerLevel)
    return false;
  if (
    row.buildingType &&
    !context.view.cells.some(
      (c) => c?.kind === 'building' && getBuilding(c.cfgId)?.type === row.buildingType,
    )
  )
    return false;
  return row.requires.every((raw) => {
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (typeof id !== 'number' || id === 0) return true;
    const required = systemsCatalog.research.find((r) => r.tree === row.tree && r.id === id);
    if (!required) return false;
    const owned = researchRow(row.tree, state.research[required.key] ?? 0);
    return required.level === 0 || (owned?.level ?? 0) >= required.level;
  });
}
export function completeResearch(
  state: SystemsState,
  tree: ResearchTree,
  id: number,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  const row = researchRow(tree, id);
  if (!row) throw Error('REQUIREMENT');
  const next = { ...state, research: { ...state.research, [row.key]: row.id } };
  const balances = transact(context.balances, [], row.xp > 0 ? [[1200001, row.xp]] : []);
  return accepted(
    next,
    balances,
    [{ type: 'research-complete', amount: 1, target: row.type, level: row.level }],
    'اكتمل البحث.',
  );
}
export function startResearch(
  state: SystemsState,
  tree: ResearchTree,
  id: number,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  const row = researchRow(tree, id);
  if (!row || !researchAllowed(state, row, context)) throw Error('REQUIREMENT');
  if (state.jobs.some((j) => j.kind === 'research' && j.tree === tree) || state.jobs.length >= 8)
    throw Error('QUEUE_FULL');
  const balances = transact(context.balances, row.cost);
  if (row.seconds === 0) return completeResearch(state, tree, id, { ...context, balances });
  const job = {
    id: state.nextJobId,
    kind: 'research' as const,
    tree,
    target: id,
    count: 1,
    startedAt: context.now,
    finishAt: context.now + row.seconds * 1000,
  };
  if (!Number.isSafeInteger(job.finishAt)) throw Error('INVALID_TIME');
  return accepted(
    { ...state, jobs: [...state.jobs, job], nextJobId: state.nextJobId + 1 },
    balances,
    [],
    'بدأ البحث؛ موعد الإكمال محفوظ.',
  );
}
export function getResearchOffers(state: SystemsState, context: GameplayContext) {
  const groups = new Map<string, ResearchRow[]>();
  for (const row of systemsCatalog.research) {
    const key = row.key;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].flatMap(([key, rows]) => {
    const current = rows.find((r) => r.id === state.research[key]);
    const next = current
      ? rows.find((r) => r.id === current.next)
      : rows.filter((r) => r.level > 0).sort((a, b) => a.level - b.level)[0];
    return next
      ? [
          {
            ...next,
            currentLevel: current?.level ?? 0,
            eligible: researchAllowed(state, next, context),
            busy: state.jobs.some((j) => j.kind === 'research' && j.tree === next.tree),
          },
        ]
      : [];
  });
}

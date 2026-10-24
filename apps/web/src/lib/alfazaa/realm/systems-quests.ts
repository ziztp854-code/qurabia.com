import type { GameplayContext, Reward } from './common';
import { systemsCatalog, getPlayerLevel, identityRow, type QuestRow } from './systems-catalog';
import { questBinding } from './systems-quest-bindings';
import { resolveDrop } from './systems-loot';
import type { QuestFamily, QuestView, SystemsState } from './systems-types';
import { accepted, transact } from './systems-utils';
import { getBuilding } from '../domain/catalog';
export function prepareDailyChoices(state: SystemsState, context: GameplayContext): SystemsState {
  if (state.dailyChoices.length) return state;
  const level = getPlayerLevel(context.balances);
  const eligible = systemsCatalog.quests.filter(
    (q) =>
      q.family === 'daily' &&
      level >= q.minLevel &&
      level <= q.maxLevel &&
      questBinding(q, state, context).supported,
  );
  if (!eligible.length) return state;
  const ordered = [...eligible].sort((a, b) => a.type - b.type || a.id - b.id),
    selected: number[] = [];
  const types = [...new Set(ordered.map((q) => q.type))];
  for (let i = 0; i < Math.min(10, types.length); i++) {
    const type = types[(state.day + i) % types.length],
      rows = ordered.filter((q) => q.type === type);
    selected.push(rows[state.day % rows.length].id);
  }
  return { ...state, dailyChoices: selected };
}
function questReward(row: QuestRow, state: SystemsState, context: GameplayContext): Reward {
  if (row.family !== 'daily') return row.reward;
  const identity = identityRow(getPlayerLevel(context.balances));
  return [
    ...row.reward,
    ...(identity.dailyDrop ? resolveDrop(identity.dailyDrop, state.day + row.id) : []),
    [400001, identity.dailyGold * row.multiplier],
    [1200001, identity.dailyXp * row.multiplier],
  ];
}
const claimed = (state: SystemsState, row: QuestRow) =>
  row.family === 'daily'
    ? state.dailyClaims.includes(row.id)
    : state.claims.includes(`${row.family}:${row.id}`);
function unlocked(row: QuestRow, state: SystemsState, context: GameplayContext): boolean {
  const level = getPlayerLevel(context.balances);
  if (context.view.castleLevel < row.castle || level < row.minLevel || level > row.maxLevel)
    return false;
  if (row.family === 'daily') return state.dailyChoices.includes(row.id);
  if (row.family === 'main')
    return !systemsCatalog.quests.some(
      (q) =>
        q.family === 'main' &&
        q.group === row.group &&
        (q.order < row.order || (q.order === row.order && q.id < row.id)) &&
        !claimed(state, q),
    );
  if (row.family === 'road' || row.family === 'plot') {
    if (
      systemsCatalog.quests.some(
        (q) =>
          q.family === row.family &&
          q.chapter < row.chapter &&
          q.chapterReward &&
          !claimed(state, q),
      )
    )
      return false;
    if (row.chapterReward)
      return systemsCatalog.quests
        .filter((q) => q.family === row.family && q.chapter === row.chapter && !q.chapterReward)
        .every((q) => claimed(state, q));
  }
  return true;
}
export function getQuestViews(
  input: SystemsState,
  context: GameplayContext,
  family?: QuestFamily,
): QuestView[] {
  const state = prepareDailyChoices(input, context);
  return systemsCatalog.quests
    .filter((q) => !family || q.family === family)
    .map((row) => {
      const bound = questBinding(row, state, context),
        goal = row.chapterReward ? 1 : Math.max(1, bound.goal ?? row.goal);
      const progress = row.chapterReward
        ? unlocked(row, state, context)
          ? 1
          : 0
        : Math.max(0, Math.min(goal, bound.progress));
      const status: QuestView['status'] = claimed(state, row)
        ? 'claimed'
        : !bound.supported
          ? 'unavailable'
          : !unlocked(row, state, context)
            ? 'locked'
            : progress >= goal
              ? 'ready'
              : 'active';
      const targetName =
        getBuilding(row.target)?.name ??
        systemsCatalog.items.find((r) => r.id === row.target)?.name ??
        systemsCatalog.arms.find((r) => r.id === row.target)?.name ??
        String(row.target);
      const sourceObjective = row.description
        .replace(/\{0\}/g, String(goal))
        .replace(/\{1\}/g, targetName);
      const description = bound.adaptation
        ? `${bound.adaptation} المطلوب: ${goal}.`
        : sourceObjective;
      return {
        id: row.id,
        family: row.family,
        name: bound.adaptation
          ? description
          : row.name || (row.chapterReward ? `مكافأة الفصل ${row.chapter}` : sourceObjective),
        description,
        sourceDescription: row.description,
        sourceGoal: row.goal,
        progress,
        goal,
        status,
        reward: questReward(row, state, context),
        binding: bound.key,
        adaptation: bound.adaptation,
        chapter: row.chapter,
      };
    });
}
export function claimQuest(
  input: SystemsState,
  family: QuestFamily,
  id: number,
  context: GameplayContext,
) {
  const state = prepareDailyChoices(input, context);
  const row = systemsCatalog.quests.find((q) => q.family === family && q.id === id);
  if (!row) throw Error('QUEST_LOCKED');
  if (claimed(state, row)) throw Error('ALREADY_CLAIMED');
  if (getQuestViews(state, context, family).find((q) => q.id === id)?.status !== 'ready')
    throw Error('QUEST_LOCKED');
  const balances = transact(context.balances, row.cost, questReward(row, state, context));
  const next =
    family === 'daily'
      ? { ...state, dailyClaims: [...state.dailyClaims, id] }
      : { ...state, claims: [...state.claims, `${family}:${id}`] };
  return accepted(
    next,
    balances,
    [{ type: 'quest-claim', amount: 1, target: id }],
    'استلمت مكافأة المهمة مرة واحدة.',
  );
}
export function claimDailyBox(state: SystemsState, index: number, context: GameplayContext) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 4 ||
    state.dailyClaims.length < systemsCatalog.dailyThresholds[index]
  )
    throw Error('QUEST_LOCKED');
  if (state.boxes.includes(index)) throw Error('ALREADY_CLAIMED');
  const reward = resolveDrop(systemsCatalog.dailyBoxes[index], state.day + index);
  return accepted(
    { ...state, boxes: [...state.boxes, index] },
    transact(context.balances, [], reward),
    [{ type: 'daily-box', amount: 1, target: index }],
    'استلمت صندوق المهام اليومية.',
  );
}
export function getDailyView(state: SystemsState, context: GameplayContext) {
  const current = prepareDailyChoices(state, context);
  return {
    unlockLevel: 10,
    resetTimezone: 'Asia/Riyadh',
    choices: current.dailyChoices,
    completed: current.dailyClaims.length,
    boxes: systemsCatalog.dailyThresholds.map((threshold, index) => ({
      index,
      threshold,
      claimed: current.boxes.includes(index),
      eligible: current.dailyClaims.length >= threshold && !current.boxes.includes(index),
      reward: resolveDrop(systemsCatalog.dailyBoxes[index], current.day + index),
    })),
  };
}
export function getQuestBindingCoverage(state: SystemsState, context: GameplayContext) {
  return (['main', 'road', 'plot', 'daily', 'milestone'] as const).map((family) => {
    const rows = systemsCatalog.quests.filter((q) => q.family === family),
      unsupported = rows.filter((q) => !questBinding(q, state, context).supported);
    return {
      family,
      total: rows.length,
      supported: rows.length - unsupported.length,
      unavailable: unsupported.length,
      unavailableTypes: [...new Set(unsupported.map((q) => q.type))],
    };
  });
}

import type { GameplayContext, GameplayResult } from './common';
import {
  armRow,
  getPlayerLevel,
  identityRow,
  isPlayableArm,
  itemRow,
  systemsCatalog,
} from './systems-catalog';
import type { SystemsState } from './systems-types';
import { accepted, countValid, transact } from './systems-utils';
import { resolveDrop } from './systems-loot';
export function craftItem(
  state: SystemsState,
  recipeId: number,
  count: number,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  const row = systemsCatalog.recipes.find((r) => r.id === recipeId);
  if (!row || !countValid(count) || !row.cost.length || !row.reward.length)
    throw Error('REQUIREMENT');
  return accepted(
    state,
    transact(context.balances, row.cost, row.reward, count),
    [{ type: 'craft', amount: count, target: recipeId }],
    'اكتملت الصناعة.',
  );
}
export function consumeItem(
  state: SystemsState,
  itemId: number,
  count: number,
  choice: number | undefined,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  if (!countValid(count)) throw Error('INVALID_COUNT');
  const row = itemRow(itemId),
    arm = armRow(itemId);
  if (!row && isPlayableArm(arm)) {
    if ((state.reserve[itemId] ?? 0) + count > 100000) throw Error('RESOURCE_LIMIT');
    return accepted(
      { ...state, reserve: { ...state.reserve, [itemId]: (state.reserve[itemId] ?? 0) + count } },
      transact(context.balances, [[itemId, count]]),
      [{ type: 'item-use', amount: count, target: itemId }],
    );
  }
  if (!row) throw Error('UNKNOWN_ITEM');
  if (row.speedSeconds || [110021, 110022, 110023, 110024, 110025].includes(itemId))
    throw Error('ITEM_NOT_USABLE');
  if (choice !== undefined && (!row.selectable || !Number.isSafeInteger(choice) || choice < 0))
    throw Error('REQUIREMENT');
  if (row.selectable && choice === undefined) throw Error('REQUIREMENT');
  let rewards: [number, number][] = [];
  if (row.selectable) {
    const selected = systemsCatalog.choices.find((r) => r.id === row.useGain)?.rewards[choice!];
    if (!selected) throw Error('REQUIREMENT');
    rewards = [[selected[0], selected[1] * count]];
  } else if (row.type === 2 && row.useGain > 0) {
    for (let i = 0; i < count; i++)
      rewards = [
        ...rewards,
        ...resolveDrop(
          row.useGain,
          context.now + itemId + i + (state.lifetime['item-use'] ?? 0),
          choice,
        ),
      ];
  } else if (row.type === 3 && row.useGain > 0 && itemRow(row.useGain)?.type === 4) {
    // Original quantity is server-owned. Alfazaa resource packs use the role's
    // source ShopGold scalar; target currency remains the source UseGain.
    rewards = [
      [row.useGain, Math.max(1, identityRow(getPlayerLevel(context.balances)).shopGold) * count],
    ];
  } else throw Error('ITEM_NOT_USABLE');
  return accepted(
    state,
    transact(
      context.balances,
      [[itemId, count], ...row.useNeed.map(([id, n]): [number, number] => [id, n * count])],
      rewards,
    ),
    [{ type: 'item-use', amount: count, target: itemId }],
    'استُعمل العنصر وأضيفت العوائد إلى الحقيبة.',
  );
}
export function speedUp(
  state: SystemsState,
  jobId: number,
  itemId: number,
  count: number,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  const item = itemRow(itemId),
    job = state.jobs.find((j) => j.id === jobId);
  if (!item?.speedSeconds || !job || !countValid(count)) throw Error('REQUIREMENT');
  const balances = transact(context.balances, [[itemId, count]]);
  const finishAt = Math.max(context.now, job.finishAt - item.speedSeconds * count * 1000);
  return accepted(
    { ...state, jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, finishAt } : j)) },
    balances,
    [{ type: 'speedup-use', amount: count, target: itemId }],
    'تم تسريع المهمة.',
  );
}
export function getInventoryView(balances: Record<string, number>) {
  return Object.entries(balances)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const row = itemRow(Number(id)),
        arm = armRow(Number(id));
      return {
        id: Number(id),
        count,
        name: row?.name ?? arm?.name ?? `مورد ${id}`,
        image: row?.image ?? '',
        description: row?.description ?? '',
        usable: isPlayableArm(arm) || (!!row && (row.type === 2 || row.type === 3)),
        speedSeconds: row?.speedSeconds ?? 0,
        selectable: row?.selectable ?? false,
        choices: row?.selectable
          ? (systemsCatalog.choices
              .find((d) => d.id === row.useGain)
              ?.rewards.map(([target, n]) => ({
                id: target,
                count: n,
                name: itemRow(target)?.name ?? `مورد ${target}`,
              })) ?? [])
          : [],
      };
    });
}

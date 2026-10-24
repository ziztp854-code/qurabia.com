import type { GameplayContext, GameplayResult } from './common';
import {
  getPlayerLevel,
  identityRow,
  itemRow,
  systemsCatalog,
  type ShopRow,
} from './systems-catalog';
import type { SystemsState } from './systems-types';
import { accepted, countValid, transact } from './systems-utils';
function virtualOffer(row: ShopRow): boolean {
  return (
    row.cost.length > 0 &&
    row.reward.length > 0 &&
    row.vip === 0 &&
    row.cost.every(([id, n]) => !!itemRow(id) && Number.isSafeInteger(n) && n > 0)
  );
}
export function buyOffer(
  state: SystemsState,
  offerId: number,
  count: number,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  const row = systemsCatalog.shops.find((r) => r.id === offerId),
    level = getPlayerLevel(context.balances);
  if (!row || !virtualOffer(row) || !countValid(count)) throw Error('REQUIREMENT');
  if (
    level < row.minLevel ||
    level > row.maxLevel ||
    row.allianceLevel > (context.view.world?.allianceLevel ?? 0)
  )
    throw Error('REQUIREMENT');
  // Independent stock rule: source LimitType2 is lifetime; all other rows reset
  // at Riyadh midnight. Server-selected original shop rotations are unavailable.
  const lifetime = row.limitType === 2,
    ledger = lifetime ? state.shopLifetime : state.shopDaily;
  const owned = ledger[offerId] ?? 0,
    limit = row.limit > 0 ? row.limit : 100;
  if (owned + count > Math.min(10000, limit)) throw Error('DAILY_LIMIT');
  const balances = transact(context.balances, row.cost, row.reward, count);
  const next = {
    ...state,
    [lifetime ? 'shopLifetime' : 'shopDaily']: { ...ledger, [offerId]: owned + count },
  };
  return accepted(
    next,
    balances,
    [{ type: 'shop-buy', amount: count, target: offerId }],
    'تم الشراء بالعملة الافتراضية.',
  );
}
export function exchangeItem(
  state: SystemsState,
  itemId: number,
  count: number,
  context: GameplayContext,
): GameplayResult<SystemsState> {
  const row = itemRow(itemId);
  if (!row || !countValid(count) || !quartermasterItem(row)) throw Error('REQUIREMENT');
  const key = `exchange:${itemId}`,
    used = state.shopDaily[key] ?? 0;
  if (used + count > 100) throw Error('DAILY_LIMIT');
  // The quartermaster makes the new-source heroes/materials obtainable without
  // real money or legacy event servers. This is an explicit Alfazaa offer.
  const batch = [430001, 450001].includes(itemId) ? 1000 : 1;
  const price = exchangeGold(row, context.balances);
  const balances = transact(context.balances, [[400001, price]], [[itemId, batch]], count);
  return accepted(
    { ...state, shopDaily: { ...state.shopDaily, [key]: used + count } },
    balances,
    [{ type: 'shop-buy', amount: count, target: itemId }],
    'تم التبادل مع أمين الإمداد.',
  );
}
export function getShopOffers(state: SystemsState, context: GameplayContext) {
  const level = getPlayerLevel(context.balances);
  return systemsCatalog.shops
    .filter(virtualOffer)
    .map((row) => ({
      ...row,
      remaining: Math.max(
        0,
        (row.limit > 0 ? row.limit : 100) -
          ((row.limitType === 2 ? state.shopLifetime : state.shopDaily)[row.id] ?? 0),
      ),
      eligible:
        level >= row.minLevel &&
        level <= row.maxLevel &&
        row.allianceLevel <= (context.view.world?.allianceLevel ?? 0),
    }))
    .sort((a, b) => a.order - b.order || a.id - b.id);
}
export function getExchangeOffers(balances: Record<string, number> = {}) {
  return systemsCatalog.items
    .filter(quartermasterItem)
    .map((row) => ({
      itemId: row.id,
      name: row.name,
      image: row.image,
      count: [430001, 450001].includes(row.id) ? 1000 : 1,
      gold: exchangeGold(row, balances),
      dailyLimit: 100,
    }));
}
function exchangeGold(
  row: NonNullable<ReturnType<typeof itemRow>>,
  balances: Record<string, number>,
) {
  return Math.max(
    100,
    100 * Math.max(1, Math.min(5, row.quality)) ** 2,
    row.id === 800081 ? identityRow(getPlayerLevel(balances)).shopGold : 0,
  );
}
function quartermasterItem(row: ReturnType<typeof itemRow>) {
  // Resource/loot packs can contain more gold than their exchange price. Keep
  // materials, targeted XP books, fragments and speedups; chests remain drops.
  return (
    !!row &&
    (![2, 3, 4].includes(row.type) ||
      (row.type === 3 && row.useGain === 0) ||
      [430001, 450001, 470001, 800081].includes(row.id)) &&
    ![400001, 410001, 1200001].includes(row.id)
  );
}

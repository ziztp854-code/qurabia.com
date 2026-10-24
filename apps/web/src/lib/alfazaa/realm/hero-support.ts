import type { Balances, Reward } from './common';
export function validBalances(balances: Balances) {
  return Object.entries(balances).every(
    ([id, value]) =>
      /^\d{1,9}$/.test(id) && Number.isSafeInteger(value) && value >= 0 && value <= 1e12,
  );
}
export function spend(balances: Balances, cost: Reward): Balances {
  const totals: Record<string, number> = {};
  for (const [id, count] of cost) {
    if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(count) || count < 0)
      throw Error('INVALID_COST');
    totals[id] = (totals[id] ?? 0) + count;
    if (!Number.isSafeInteger(totals[id]) || totals[id] > 1e12) throw Error('RESOURCE_LIMIT');
  }
  if (Object.entries(totals).some(([id, amount]) => (balances[id] ?? 0) < amount))
    throw Error('INSUFFICIENT_RESOURCES');
  return {
    ...balances,
    ...Object.fromEntries(
      Object.entries(totals).map(([id, amount]) => [id, (balances[id] ?? 0) - amount]),
    ),
  };
}
export function reward(balances: Balances, gain: Reward): Balances {
  const next = { ...balances };
  for (const [id, count] of gain) {
    if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(count) || count < 0)
      throw Error('INVALID_REWARD');
    const value = (next[id] ?? 0) + count;
    if (!Number.isSafeInteger(value) || value > 1e12) throw Error('RESOURCE_LIMIT');
    next[id] = value;
  }
  return next;
}

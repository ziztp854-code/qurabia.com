import type { Reward } from './common';
import { systemsCatalog } from './systems-catalog';
/** Independent deterministic draw, seeded only by trusted command context. */
export function resolveDrop(id: number, seed: number, choice?: number): Reward {
  let calls = 0,
    value = seed >>> 0 || 1;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const resolve = (dropId: number, depth: number): Reward => {
    if (++calls > 1000 || depth > 5) throw Error('ITEM_NOT_USABLE');
    const drop = systemsCatalog.drops.find((r) => r.id === dropId);
    if (!drop) throw Error('ITEM_NOT_USABLE');
    let rewards: Reward = [];
    if (choice !== undefined && depth === 0) {
      const row = drop.rewards[choice];
      if (!row || row.length < 2) throw Error('REQUIREMENT');
      rewards = [[row[0], row[1]]];
    } else if (drop.type === 1) rewards = drop.rewards.map((r) => [r[0], r[1]]);
    else if (drop.type === 2) {
      const pool = drop.rewards.filter((r) => r.length >= 3 && r[2] > 0);
      const total = pool.reduce((sum, r) => sum + r[2], 0);
      if (!pool.length || !Number.isSafeInteger(total) || total <= 0)
        throw Error('ITEM_NOT_USABLE');
      for (let draw = 0; draw < Math.max(1, Math.min(100, drop.draws)); draw++) {
        let selected = pool[pool.length - 1],
          roll = random() * total;
        for (const row of pool) {
          roll -= row[2];
          if (roll < 0) {
            selected = row;
            break;
          }
        }
        rewards = [...rewards, [selected[0], selected[1]]];
      }
    } else throw Error('ITEM_NOT_USABLE');
    for (const row of drop.nested) {
      const nestedId = typeof row === 'number' ? row : row[0];
      if (!Number.isSafeInteger(nestedId)) throw Error('ITEM_NOT_USABLE');
      rewards = [...rewards, ...resolve(nestedId, depth + 1)];
    }
    if (rewards.length > 1000) throw Error('RESOURCE_LIMIT');
    return rewards;
  };
  return resolve(id, 0);
}

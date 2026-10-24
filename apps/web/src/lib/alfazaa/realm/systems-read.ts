import type { Balances } from './common';
import { getPlayerLevel, researchRow, systemsCatalog } from './systems-catalog';
import type { SystemsState } from './systems-types';
import { resetSystemsDay } from './systems-state';
/** Independent compatibility rule: research adds source Value-1 to castle+2. */
export function getArmyCap(state: SystemsState, armType: number, castleLevel: number): number {
  const type = armType === 0 ? 2 : armType === 1 ? 3 : 4;
  const row = researchRow('college', state.research[`college:${type}`] ?? 0);
  return Math.min(100, castleLevel + 2 + Math.max(0, (row?.value ?? 1) - 1));
}
export function getSystemsSnapshot(state: SystemsState, balances: Balances, now: number) {
  const current = resetSystemsDay(state, now),
    research: Record<string, number> = {};
  const bonuses = { attack: 0, defense: 0, health: 0, production: 0, training: 0 };
  for (const [key, id] of Object.entries(current.research)) {
    const row = systemsCatalog.research.find((r) => r.id === id && key === r.key);
    if (!row) continue;
    research[key] = row.level;
    if (row.tree === 'college') research[String(row.type)] = row.level;
    for (const previous of systemsCatalog.research.filter(
      (r) => r.key === row.key && r.level <= row.level,
    ))
      research[String(previous.id)] = previous.level;
    if (row.tree === 'college' && row.type === 14) bonuses.attack += row.value / 10000;
    if (row.tree === 'college' && [120, 123, 124].includes(row.type))
      bonuses.attack += row.value / 30000;
    if (row.tree === 'college' && [126, 129, 130].includes(row.type))
      bonuses.defense += row.value / 30000;
    if (row.tree === 'science' && [1, 13, 16, 102, 104, 107].includes(row.type))
      bonuses.attack += row.value / 10000;
    if (row.tree === 'science' && [2, 103, 105, 106, 35, 36, 37].includes(row.type))
      bonuses.health += row.value / 10000;
    if (row.tree === 'science' && [14, 17, 29, 30, 31].includes(row.type))
      bonuses.defense += row.value / 10000;
    if (row.tree === 'science' && row.type === 4) bonuses.training += row.value / 10000;
    if (row.tree === 'science' && /الذهب|إنتاج|انتاج/.test(row.description))
      bonuses.production += row.value / 10000;
  }
  bonuses.attack +=
    Object.values(current.beasts).reduce((a, b) => a + b, 0) * 0.01 +
    current.destroyerLevel * 0.005;
  bonuses.health += current.equippedRelics.reduce(
    (sum, id) => sum + (current.relics[id] ?? 0) * 0.005,
    0,
  );
  return {
    playerLevel: getPlayerLevel(balances),
    research,
    lifetime: current.lifetime,
    daily: current.daily,
    bonuses,
  };
}
export function getHealingResearch(state: SystemsState) {
  let capacity = 0,
    speed = 0;
  for (const [key, id] of Object.entries(state.research)) {
    const row = systemsCatalog.research.find((r) => r.key === key && r.id === id);
    if (!row) continue;
    if ((row.tree === 'college' && row.type === 16) || (row.tree === 'science' && row.type === 28))
      capacity += row.value;
    if (
      (row.tree === 'college' && row.type === 17) ||
      (row.tree === 'science' && [5, 108].includes(row.type))
    )
      speed += row.value / 10000;
  }
  return { capacity, speed: Math.max(0, Math.min(10, speed)) };
}

import { catalog, getBuilding, listRecruitableArms } from './catalog';
import { createRealmState } from '../realm/state';
import type { AlfazaaState } from './types';

export function createInitialState(now: number): AlfazaaState {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('INVALID_TIME');
  const starter = listRecruitableArms()[0];
  return {
    version: 3, revision: 0, castleLevel: 1,
    balances: { [catalog.meta.goldItemId]: 20000, [catalog.meta.blueprintItemId]: 200 },
    cells: Array.from({ length: 36 }, (_, i) => i < 2 && starter
      ? { id: String(i + 1), kind: 'troop' as const, cfgId: starter.id }
      : i === 35 ? { id: '3', kind: 'building' as const, cfgId: 40001 } : null),
    nextId: 4, lastCollectedAt: now, completedTowerLevels: [], battle: null, updatedAt: now,
    quests: { claimed: [], lastDailyClaimDay: null }, realm: createRealmState(now),
  };
}

export function getGoldPerMinute(state: AlfazaaState): number {
  return state.cells.reduce((sum, cell) => {
    const row = cell?.kind === 'building' ? getBuilding(cell.cfgId) : undefined;
    return sum + (row?.type === 4 ? row.value : 0);
  }, 0);
}

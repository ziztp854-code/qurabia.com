import type { Building, Unit, Village } from './types';

/**
 * Village rank «قرية» begins at level 6, and the first progression milestone is level 10.
 * The stable plot opens then; construction still spends resources on the shared queue.
 */
export const stableUnlockVillageLevel = 6;

/** One training slot. The building only chooses the requirement and the speed level. */
export function trainingBuilding(unit: Unit): Building {
  return unit === 'rider' || unit === 'mounted_archer' ? 'stable' : 'barracks';
}

/** Same coefficient as barracks training. The level comes from the unit's own building. */
export function trainingSpeedDivisor(level: number, speedPerLevel: number) {
  return 1 + Math.max(0, level - 1) * speedPerLevel;
}

export function trainingDurationMs(
  unitSeconds: number,
  count: number,
  level: number,
  speedPerLevel: number,
) {
  return (unitSeconds * count * 1000) / trainingSpeedDivisor(level, speedPerLevel);
}

export function canTrain(village: Village, unit: Unit) {
  return village.buildings[trainingBuilding(unit)] > 0;
}

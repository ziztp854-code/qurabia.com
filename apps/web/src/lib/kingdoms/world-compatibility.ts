import { defaultKingdomsConfig } from './config';
import { defaultVillageProgression } from './progression-config';
import { unitKeys, type KingdomsWorld, type Troops } from './types';

function normalizeTroops(troops: Troops): Troops {
  return {
    ...troops,
    ...Object.fromEntries(unitKeys.map((unit) => [unit, troops[unit] ?? 0])),
  } as Troops;
}

/** Restore additive fields in older JSON worlds without changing saved game values. */
export function normalizeWorldState(state: KingdomsWorld): KingdomsWorld {
  const saved = structuredClone(state);
  const progression = saved.config.progression;
  return {
    ...saved,
    config: {
      ...saved.config,
      // Approved policy for new departures only; saved movement schedules are never rebuilt.
      armyTravelTimeFactor: saved.config.armyTravelTimeFactor ?? defaultKingdomsConfig.armyTravelTimeFactor,
      units: { ...structuredClone(defaultKingdomsConfig.units), ...saved.config.units },
      ...(progression
        ? {
            progression: {
              ...progression,
              unitPower: { ...defaultVillageProgression.unitPower, ...progression.unitPower },
            },
          }
        : {}),
    },
    caravans: saved.caravans ?? [],
    sieges: Object.fromEntries(
      Object.entries(saved.sieges ?? {}).map(([id, siege]) => [
        id,
        { ...siege, troops: normalizeTroops(siege.troops) },
      ]),
    ),
    villages: Object.fromEntries(
      Object.entries(saved.villages).map(([id, village]) => [
        id,
        {
          ...village,
          troops: normalizeTroops(village.troops),
          reinforcements: Object.fromEntries(
            Object.entries(village.reinforcements).map(([source, troops]) => [
              source,
              normalizeTroops(troops),
            ]),
          ),
        },
      ]),
    ),
    movements: saved.movements.map((movement) => ({
      ...movement,
      troops: normalizeTroops(movement.troops),
    })),
  };
}

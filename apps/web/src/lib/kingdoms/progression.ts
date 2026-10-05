import { defaultVillageProgression } from './progression-config';
import {
  buildingKeys,
  unitKeys,
  type Building,
  type KingdomsWorld,
  type Troops,
  type Village,
  type VillageProgressionConfig,
} from './types';

export const progressionConfig = (w: KingdomsWorld) =>
  w.config.progression ?? defaultVillageProgression;
const economic = new Set<Building>([
  'lumber',
  'quarry',
  'mine',
  'farm',
  'treasury',
  'warehouse',
  'market',
]);

function requirements(v: Village, config: VillageProgressionConfig, level: number) {
  const required = config.milestones
    .filter((entry) => entry.level <= level)
    .reduce<Partial<Record<Building, number>>>(
      (all, entry) => ({
        ...all,
        ...Object.fromEntries(
          Object.entries(entry.buildings).map(([key, value]) => [
            key,
            Math.max(all[key as Building] ?? 0, value),
          ]),
        ),
      }),
      {},
    );
  return buildingKeys
    .filter((key) => v.buildings[key] < (required[key] ?? 0))
    .map((building) => ({
      building,
      required: required[building]!,
      actual: v.buildings[building],
    }));
}

function derive(v: Village, config: VillageProgressionConfig, troops: Troops, territories: number) {
  const infrastructure =
    buildingKeys.reduce((sum, key) => sum + (v.buildings[key] * (v.buildings[key] + 1)) / 2, 0) - 1;
  return (
    Math.max(0, infrastructure) * config.buildingXp +
    unitKeys.reduce((sum, key) => sum + troops[key] * config.trainingXp, 0) +
    territories * config.territoryXp
  );
}

/** Pure derivation used only on the server's cloned authoritative state. */
export function refreshVillageProgression(
  w: KingdomsWorld,
  v: Village,
  away: Troops,
  territories = 0,
) {
  const config = progressionConfig(w);
  const troops = Object.fromEntries(
    unitKeys.map((key) => [key, v.troops[key] + away[key]]),
  ) as Troops;
  const xp = v.progression?.xp ?? derive(v, config, troops, territories);
  // JSONB may reorder every object key. Ordered value tuples keep the cache stable
  // after persistence and avoid storing a full named config copy per village.
  const signature = JSON.stringify([
    buildingKeys.map((key) => v.buildings[key]),
    unitKeys.map((key) => troops[key]),
    territories,
    xp,
    config.maxLevel,
    config.xpStep,
    config.buildingXp,
    config.trainingXp,
    config.achievementXp,
    config.territoryXp,
    config.buildingPower,
    config.defensePower,
    config.economicPower,
    config.strategicPower,
    unitKeys.map((key) => config.unitPower[key]),
    config.milestones.map((entry) => [
      entry.level,
      buildingKeys.map((key) => entry.buildings[key] ?? 0),
    ]),
    config.ranks.map((entry) => [entry.from, entry.name]),
    config.tiers.map((entry) => [entry.from, entry.tier]),
  ]);
  if (v.progression?.signature === signature) return;
  let level = 1,
    levelStartXp = 0,
    nextLevelXp = config.xpStep;
  while (
    level < config.maxLevel &&
    xp >= nextLevelXp &&
    requirements(v, config, level + 1).length === 0
  ) {
    level += 1;
    levelStartXp = nextLevelXp;
    nextLevelXp += config.xpStep * level * (1 + Math.floor(level / 10));
  }
  const power = {
    // Hall, barracks, stable and embassy share buildingPower. Wall and economy stay separate.
    // A missing or zero stable adds nothing; the asset alone is not power.
    building: buildingKeys
      .filter((key) => key !== 'wall' && !economic.has(key))
      .reduce((sum, key) => sum + v.buildings[key] * config.buildingPower, 0),
    military: unitKeys.reduce((sum, key) => sum + troops[key] * config.unitPower[key], 0),
    defense: v.buildings.wall * config.defensePower,
    economic: buildingKeys
      .filter((key) => economic.has(key))
      .reduce((sum, key) => sum + v.buildings[key] * config.economicPower, 0),
    research: 0,
    strategic: territories * config.strategicPower,
  };
  v.progression = {
    version: 1,
    xp,
    level,
    levelStartXp,
    nextLevelXp: level === config.maxLevel ? null : nextLevelXp,
    rank: config.ranks.filter((entry) => entry.from <= level).at(-1)!.name,
    visualTier: config.tiers.filter((entry) => entry.from <= level).at(-1)!.tier,
    requirements: level === config.maxLevel ? [] : requirements(v, config, level + 1),
    power: { ...power, total: Object.values(power).reduce((sum, value) => sum + value, 0) },
    signature,
  };
}

export function awardVillageXp(v: Village, xp: number) {
  if (v.progression)
    v.progression = {
      ...v.progression,
      xp: Math.min(Number.MAX_SAFE_INTEGER, v.progression.xp + xp),
      signature: '',
    };
}

/** One strategic allocation per player (their first village), never duplicated across villages. */
export function refreshProgression(w: KingdomsWorld, deployed: Map<string, Troops>) {
  const capitals = new Map<string, string>();
  const territoryCounts = new Map<string, number>();
  for (const owner of Object.values(w.territories))
    territoryCounts.set(owner, (territoryCounts.get(owner) ?? 0) + 1);
  for (const v of Object.values(w.villages).sort((a, b) =>
    a.id.localeCompare(b.id, 'en', { numeric: true }),
  )) {
    if (!capitals.has(v.ownerId)) capitals.set(v.ownerId, v.id);
    refreshVillageProgression(
      w,
      v,
      deployed.get(v.id) ?? emptyTroops(),
      capitals.get(v.ownerId) === v.id ? (territoryCounts.get(v.ownerId) ?? 0) : 0,
    );
  }
}

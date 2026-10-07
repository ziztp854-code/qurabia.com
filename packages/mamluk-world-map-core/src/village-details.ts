import type { VillageMapDetails } from './models';

const integer = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 256;
const nullable = (rule: (v: unknown) => boolean) => (v: unknown) => v === null || rule(v);
export const mapBuildingKeys = [
  'hall',
  'lumber',
  'quarry',
  'mine',
  'farm',
  'treasury',
  'warehouse',
  'barracks',
  'stable',
  'wall',
  'market',
  'embassy',
] as const;
export type MapBuildingLevels = Partial<Record<(typeof mapBuildingKeys)[number], number>>;
/** Only architectural levels; reject any extra key, malformed JSON, or unsafe value. */
export function parseVillageBuildingLevels(value: unknown): MapBuildingLevels | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const levels: unknown = JSON.parse(value);
    if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return null;
    const entries = Object.entries(levels);
    if (
      entries.length === 0 ||
      entries.some(
        ([key, level]) =>
          !mapBuildingKeys.includes(key as (typeof mapBuildingKeys)[number]) || !integer(level),
      )
    )
      return null;
    return Object.fromEntries(entries) as MapBuildingLevels;
  } catch {
    return null;
  }
}
export const villageDetailRules = {
  villageBuildings: nullable((v) => parseVillageBuildingLevels(v) !== null),
  villageLevel: nullable((v) => integer(v) && (v as number) >= 1),
  villageRank: nullable(text),
  villagePower: nullable(integer),
  villageVisualTier: nullable((v) => integer(v) && (v as number) >= 1),
  population: (v: unknown) => v === null,
  constructionStatus: (v: unknown) => v === null || v === 'BUILDING' || v === 'IDLE',
  kingdomName: text,
  allianceName: nullable(text),
};
/** Explicit allowlist; never spread private game objects into map features. */
export function villageDetails(value: VillageMapDetails): Record<string, string | number | null> {
  const details: Record<string, string | number | null> = {};
  for (const key of Object.keys(villageDetailRules) as (keyof VillageMapDetails)[]) {
    if (value[key] === undefined) continue;
    if (!villageDetailRules[key](value[key])) throw new RangeError('Invalid village map details');
    details[key] = value[key]!;
  }
  return details;
}

import 'server-only';
import type { BoundingBox, City, Territory } from '@mamluk/world-map-core';
import {
  boundsGeometry,
  createCity,
  validateArea,
  validateId,
} from '@mamluk/world-map-core/server';
import { storeMapRecord, type StoredMapRecord } from './storage';
import type { GeographicVillage } from './village-geography';

export type StoredVillageTerritory = StoredMapRecord<Territory>;
type Centre = Pick<City, 'id' | 'longitude' | 'latitude' | 'regionId'>;
const HALF_SIZE = 0.009;
const MAX_PLOTS = 100_000;

/** Geographic gameplay plots, not municipal or historical boundary claims.
 * Balanced spatial partitions keep close plots disjoint without moving villages.
 * Partition construction costs O(n log² n), with O(n log n) temporary references.
 */
export function buildVillageTerritories(
  worldId: string,
  cities: readonly StoredMapRecord<City>[],
  villages: Readonly<Record<string, GeographicVillage>>,
): readonly StoredVillageTerritory[] {
  validateId(worldId);
  if (cities.length > MAX_PLOTS) throw new RangeError('Village territory budget exceeded');
  const centres = cities
    .filter(({ value }) => Object.hasOwn(villages, value.id))
    .map(({ value }) => {
      if (value.worldId !== worldId) throw new RangeError('Invalid village territory world');
      return createCity(value);
    });
  const ids = new Set(centres.map((point) => point.id));
  if (ids.size !== centres.length) throw new RangeError('Duplicate village territory identity');
  if (
    new Set(centres.map((point) => `${point.longitude},${point.latitude}`)).size !== centres.length
  )
    throw new RangeError('Duplicate village geographic centre');
  const cells = partition(centres, { west: -180, east: 180, south: -90, north: 90 });
  return centres.flatMap((point) => {
    const cell = cells.get(point.id)!;
    const bounds = {
      west: Math.max(cell.west, point.longitude - HALF_SIZE),
      east: Math.min(cell.east, point.longitude + HALF_SIZE),
      south: Math.max(cell.south, point.latitude - HALF_SIZE),
      north: Math.min(cell.north, point.latitude + HALF_SIZE),
    };
    const geometry = boundsGeometry(bounds);
    try {
      validateArea(geometry);
    } catch (error) {
      // The accepted core rejects areas <=1e-10 square degrees. Dense legal
      // centres can produce such slivers; keep their cities and omit only plots.
      if (error instanceof RangeError) return [];
      throw error;
    }
    return [
      storeMapRecord({
        id: point.id,
        worldId,
        regionId: point.regionId,
        geometry,
        ownerPlayerId: villages[point.id]!.ownerId,
        ownerSultanateId: null,
      }),
    ];
  });
}

function partition(
  points: readonly Centre[],
  bounds: BoundingBox,
): ReadonlyMap<string, BoundingBox> {
  if (points.length === 0) return new Map();
  if (points.length === 1) return new Map([[points[0]!.id, bounds]]);
  const choices = (['longitude', 'latitude'] as const).map((axis) => {
    const sorted = [...points].sort((a, b) => a[axis] - b[axis] || (a.id < b.id ? -1 : 1));
    let middle = 0,
      imbalance = Infinity;
    for (let index = 1; index < sorted.length; index++) {
      const score = Math.abs(sorted.length - index * 2);
      if (sorted[index - 1]![axis] !== sorted[index]![axis] && score < imbalance) {
        middle = index;
        imbalance = score;
      }
    }
    return { axis, sorted, middle, imbalance };
  });
  // Choose the most balanced legal split across both axes, even for columns
  // sharing a longitude. Distinct centres keep recursion logarithmically bounded.
  const { axis, sorted, middle } =
    choices[0]!.imbalance <= choices[1]!.imbalance ? choices[0]! : choices[1]!;
  if (middle === 0) throw new RangeError('Duplicate village geographic centre');
  const cut = (sorted[middle - 1]![axis] + sorted[middle]![axis]) / 2;
  const first = axis === 'longitude' ? { ...bounds, east: cut } : { ...bounds, north: cut };
  const second = axis === 'longitude' ? { ...bounds, west: cut } : { ...bounds, south: cut };
  return new Map([
    ...partition(sorted.slice(0, middle), first),
    ...partition(sorted.slice(middle), second),
  ]);
}

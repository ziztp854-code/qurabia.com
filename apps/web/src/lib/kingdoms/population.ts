import { buildingKeys, type Village } from './types';

/** Civilian residents: 50 founders plus 10 residents per completed building level.
 * Queued construction and military units do not contribute to this count.
 * Derived from current buildings so existing villages need no state migration.
 */
export function villagePopulation(village: Pick<Village, 'buildings'>): number {
  return 50 + buildingKeys.reduce((total, key) => total + village.buildings[key] * 10, 0);
}

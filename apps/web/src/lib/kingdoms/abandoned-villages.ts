import { resources } from './config';
import { resourceKeys, type KingdomsWorld, type Resources } from './types';
import type {
  AbandonedVillage,
  AbandonedVillageLayout,
  AbandonedVillageView,
} from './abandoned-village-types';

export const ABANDONED_VILLAGE_COUNT = 48;
export const ABANDONED_RESOURCE_CAPACITY = 3000;
export const ABANDONED_RESOURCE_REGENERATION = 100;
export const ABANDONED_PREVIEW_WORLD_PREFIX = 'preview_abandoned_';
export const abandonedResourceNames = {
  wood: 'خشب',
  stone: 'حجر',
  iron: 'حديد',
  food: 'غذاء',
  gold: 'ذهب',
};

export function assertAbandonedPreviewWorldId(worldId: string): void {
  if (!/^preview_abandoned_[a-zA-Z0-9_-]{1,64}$/.test(worldId))
    throw new Error('القرى المهجورة متاحة في عوالم المعاينة المعزولة فقط');
}

export function abandonedLayout(
  world: KingdomsWorld,
  worldId?: string,
): AbandonedVillageLayout | undefined {
  const layout = world.abandonedVillages;
  if (!layout) return undefined;
  const validScope =
    (layout.scope === 'isolated-preview' &&
      /^preview_abandoned_[a-zA-Z0-9_-]{1,64}$/.test(layout.worldId)) ||
    (layout.scope === 'kingdom-world' && /^kw_[a-zA-Z0-9_-]{1,97}$/.test(layout.worldId));
  if (layout.version !== 1 || !validScope || (worldId !== undefined && layout.worldId !== worldId))
    throw new Error('نطاق القرى المهجورة لا يطابق العالم');
  return layout;
}

export function abandonedVillage(world: KingdomsWorld, id: string): AbandonedVillage | undefined {
  const layout = abandonedLayout(world);
  return layout && Object.hasOwn(layout.villages, id) ? layout.villages[id] : undefined;
}

export function isAbandonedVillageCell(world: KingdomsWorld, x: number, y: number): boolean {
  return Object.values(abandonedLayout(world)?.villages ?? {}).some(
    (site) => site.x === x && site.y === y,
  );
}

function validateStock(stock: Resources): void {
  if (
    Object.keys(stock).length !== resourceKeys.length ||
    resourceKeys.some(
      (key) =>
        !Number.isFinite(stock[key]) || stock[key] < 0 || stock[key] > ABANDONED_RESOURCE_CAPACITY,
    )
  )
    throw new Error('مخزون القرية المهجورة غير صالح');
}

/** Pure projection. Fractions survive harvesting; elapsed time never moves backwards. */
export function abandonedVillageSupply(
  world: KingdomsWorld,
  site: AbandonedVillage,
  at: number,
): Resources {
  if (!Number.isSafeInteger(at) || !Number.isSafeInteger(site.stockUpdatedAt))
    throw new Error('وقت مخزون القرية المهجورة غير صالح');
  validateStock(site.stock);
  const elapsed = Math.max(0, Math.min(at, world.season.endsAt) - site.stockUpdatedAt);
  return Object.fromEntries(
    resourceKeys.map((key) => [
      key,
      Math.min(
        ABANDONED_RESOURCE_CAPACITY,
        site.stock[key] + (elapsed * ABANDONED_RESOURCE_REGENERATION) / 3600000,
      ),
    ]),
  ) as Resources;
}

/** Share total army capacity proportionally across the available ordinary resources. */
export function abandonedLoot(available: Resources, carry: number): Resources {
  validateStock(available);
  if (!Number.isFinite(carry) || carry < 0) throw new Error('سعة حمل غير صالحة');
  const amounts = resourceKeys.map((key) => Math.floor(available[key]));
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const take = Math.min(total, Math.floor(carry));
  if (!take) return resources();
  const shares = amounts.map((amount) => (take * amount) / total);
  const counts = shares.map(Math.floor);
  let remainder = take - counts.reduce((sum, amount) => sum + amount, 0);
  const order = resourceKeys
    .map((_, index) => index)
    .sort((a, b) => shares[b]! - counts[b]! - (shares[a]! - counts[a]!) || a - b);
  for (const index of order) {
    if (remainder === 0) break;
    if (counts[index]! < amounts[index]!) {
      counts[index]! += 1;
      remainder -= 1;
    }
  }
  return Object.fromEntries(resourceKeys.map((key, index) => [key, counts[index]!])) as Resources;
}

/** Mutates only the authoritative engine's fresh draft, inside the existing world transaction. */
export function collectAbandonedResources(
  world: KingdomsWorld,
  id: string,
  at: number,
  carry: number,
): Resources {
  const site = abandonedVillage(world, id);
  if (!site) throw new Error('القرية المهجورة غير متاحة');
  const available = abandonedVillageSupply(world, site, at);
  const loot = abandonedLoot(available, carry);
  site.stock = Object.fromEntries(
    resourceKeys.map((key) => [key, available[key] - loot[key]]),
  ) as Resources;
  site.stockUpdatedAt = Math.max(site.stockUpdatedAt, Math.min(at, world.season.endsAt));
  return loot;
}

export function projectAbandonedVillages(
  world: KingdomsWorld,
  actorId: string,
  worldId: string,
  at: number,
): AbandonedVillageView[] {
  if (!Object.hasOwn(world.players, actorId)) throw new Error('اللاعب ليس عضوًا في عالم المعاينة');
  const layout = abandonedLayout(world, worldId);
  if (!layout) return [];
  return Object.values(layout.villages).map((site) => {
    const available = abandonedVillageSupply(world, site, at);
    return {
      id: site.id,
      name: site.name,
      region: site.region,
      countryCode: site.countryCode,
      longitude: site.longitude,
      latitude: site.latitude,
      x: site.x,
      y: site.y,
      available: Object.fromEntries(
        resourceKeys.map((key) => [key, Math.floor(available[key])]),
      ) as Resources,
      capacityPerResource: ABANDONED_RESOURCE_CAPACITY,
      regenerationPerResourceHour: ABANDONED_RESOURCE_REGENERATION,
    };
  });
}

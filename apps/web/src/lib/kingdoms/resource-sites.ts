import { commanderTravelFactor } from './commander-movement';
import {
  unitKeys,
  type KingdomsConfig,
  type KingdomsWorld,
  type ResourceSiteKind,
  type ResourceSiteView,
  type Troops,
} from './types';

export const RESOURCE_SITE_CAPACITY = 600;
export const RESOURCE_SITE_REGENERATION = 100;
export const resourceSiteNames: Record<ResourceSiteKind, string> = {
  wood: 'غابة الخشب',
  iron: 'منجم الحديد',
  food: 'حقل القمح',
};
export const resourceSiteResourceNames: Record<ResourceSiteKind, string> = {
  wood: 'خشب',
  iron: 'حديد',
  food: 'قمح',
};
const kinds: ResourceSiteKind[] = ['wood', 'iron', 'food'];
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

export function resourceSiteAt(radius: number, x: number, y: number) {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    Math.abs(x) > radius ||
    Math.abs(y) > radius ||
    modulo(x, 6) !== 2 ||
    modulo(y, 6) !== 2
  )
    return null;
  const resource = kinds[modulo(Math.floor(x / 6) + Math.floor(y / 6), 3)];
  return { id: `site_${x}_${y}`, x, y, resource, name: resourceSiteNames[resource] };
}

export function resourceSiteSupply(w: KingdomsWorld, x: number, y: number, at: number) {
  const stock = w.resourceSiteStocks?.[`${x},${y}`];
  if (!stock) return RESOURCE_SITE_CAPACITY;
  const elapsed = Math.max(0, Math.min(at, w.season.endsAt) - stock.updatedAt);
  return Math.min(
    RESOURCE_SITE_CAPACITY,
    stock.available + (elapsed * RESOURCE_SITE_REGENERATION) / 3600000,
  );
}

export function projectResourceSites(
  w: KingdomsWorld,
  actor: string,
  at: number,
): ResourceSiteView[] {
  const occupied = new Set(Object.values(w.villages).map((v) => `${v.x},${v.y}`));
  const sites = new Map<string, ResourceSiteView>();
  for (const village of Object.values(w.villages).filter((v) => v.ownerId === actor)) {
    for (let x = village.x - 6; x <= village.x + 6; x++) {
      for (let y = village.y - 6; y <= village.y + 6; y++) {
        const site = resourceSiteAt(w.config.worldRadius, x, y);
        if (!site || occupied.has(`${x},${y}`) || w.territories[`${x},${y}`]) continue;
        sites.set(site.id, {
          ...site,
          available: Math.floor(resourceSiteSupply(w, x, y, at)),
          capacity: RESOURCE_SITE_CAPACITY,
          regenerationPerHour: RESOURCE_SITE_REGENERATION,
        });
      }
    }
  }
  return [...sites.values()].sort((a, b) => a.x - b.x || a.y - b.y);
}

export function gatherPreview(
  config: KingdomsConfig,
  origin: { x: number; y: number },
  target: { x: number; y: number },
  troops: Troops,
  commander?: { mobility: number },
) {
  const units = unitKeys.filter((key) => troops[key] > 0);
  const carry = units.reduce((sum, key) => sum + troops[key] * config.units[key].carry, 0);
  if (!units.length) return { carry: 0, travelMs: 0, roundTripMs: 0 };
  const speed = Math.min(...units.map((key) => config.units[key].speed));
  const travelMs = Math.max(
    1000,
    Math.ceil(
      (Math.hypot(target.x - origin.x, target.y - origin.y) * config.secondsPerTile * 1000) / (speed * commanderTravelFactor(config, commander)),
    ),
  );
  return { carry, travelMs, roundTripMs: travelMs * 2 };
}

/** Only the authoritative engine's fresh draft is pruned, never a caller's world. */
export function pruneResourceSiteStocks(w: KingdomsWorld, at: number) {
  if (!w.resourceSiteStocks) return;
  w.resourceSiteStocks = Object.fromEntries(
    Object.entries(w.resourceSiteStocks).filter(([key]) => {
      const [x, y] = key.split(',').map(Number);
      return resourceSiteSupply(w, x, y, at) < RESOURCE_SITE_CAPACITY;
    }),
  );
}

import 'server-only';
import { createHash } from 'node:crypto';
import mask from './data/abandoned-middle-east-geography.json';
import { provisionVillageGeography } from '../mamluk-map/village-geography';
import { abandonedPlacementDomain, geographicDistanceKm } from './abandoned-village-geography';
import { withAbandonedVillages } from './abandoned-village-layout';
import { abandonedLayout } from './abandoned-villages';
import { abandonedRegions } from './abandoned-village-types';
import type { KingdomsWorld } from './types';

import {
  ABANDONED_ROLLOUT_WORLD_ID,
  ABANDONED_ROLLOUT_WORLD_NAME,
} from './abandoned-village-policy';
export {
  ABANDONED_ROLLOUT_WORLD_ID,
  ABANDONED_ROLLOUT_WORLD_NAME,
} from './abandoned-village-policy';
const domain = abandonedPlacementDomain(mask);
const seed = 'current_world_abandoned_v1_20261007';
type Row = { id: string; name: string; state: KingdomsWorld; revision: number; paused: boolean };
export function abandonedRolloutFingerprint(row: Row): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: row.id,
        name: row.name,
        revision: row.revision,
        paused: row.paused,
        state: row.state,
      }),
    )
    .digest('hex');
}
/** Append only the NPC registry. In particular, do not tick the world or persist derived geography. */
export function prepareCurrentWorldAbandoned(row: Row, now: number) {
  if (row.id !== ABANDONED_ROLLOUT_WORLD_ID || row.name !== ABANDONED_ROLLOUT_WORLD_NAME)
    throw new Error('Rollout is restricted to the explicitly approved current world');
  if (row.paused || row.state.season.status !== 'active' || now >= row.state.season.endsAt)
    throw new Error('Current world must be active and unpaused');
  const existing = abandonedLayout(row.state, row.id);
  if (existing && existing.scope !== 'kingdom-world')
    throw new Error('Unexpected existing layout scope');
  const geographic = provisionVillageGeography(row.id, row.state).geography;
  if (
    !geographic ||
    geographic.source !== 'kingdom-villages-v1' ||
    geographic.cities.length < Object.keys(row.state.villages).length
  )
    throw new Error('Cannot verify every player village geographic exclusion');
  const playerPoints = geographic.cities.map(({ value }) => ({
    longitude: value.longitude,
    latitude: value.latitude,
  }));
  const state = withAbandonedVillages(
    row.state,
    row.id,
    seed,
    domain,
    playerPoints,
    'kingdom-world',
    now,
  );
  const layout = abandonedLayout(state, row.id)!;
  const sites = Object.values(layout.villages);
  if (sites.length !== 48) throw new Error('Unexpected existing registry size');
  const minimum = (values: number[]) => (values.length ? Math.min(...values) : null);
  const playerCells = Object.values(row.state.villages);
  const nearest = playerCells.map((home) =>
    Math.min(...sites.map((site) => Math.hypot(home.x - site.x, home.y - site.y))),
  );
  return {
    changed: !existing,
    layout,
    expectedFingerprint: abandonedRolloutFingerprint(row),
    summary: {
      worldId: row.id,
      worldName: row.name,
      revision: row.revision,
      preparedAt: now,
      sites: sites.length,
      regions: Object.fromEntries(
        abandonedRegions.map((region) => [
          region,
          sites.filter((site) => site.region === region).length,
        ]),
      ),
      bounds: {
        west: Math.min(...sites.map((s) => s.longitude)),
        east: Math.max(...sites.map((s) => s.longitude)),
        south: Math.min(...sites.map((s) => s.latitude)),
        north: Math.max(...sites.map((s) => s.latitude)),
      },
      minimumNpcDistanceKm: minimum(
        sites.flatMap((site, i) =>
          sites.slice(i + 1).map((other) => geographicDistanceKm(site, other)),
        ),
      ),
      minimumPlayerDistanceKm: minimum(
        sites.flatMap((site) => playerPoints.map((point) => geographicDistanceKm(site, point))),
      ),
      minimumCoastClearanceKm: minimum(
        sites.map((site) => domain.locate(site, site.region)?.clearanceKm ?? 0),
      ),
      playerVillagesExcluded: playerCells.length,
      movementDestinationsExcluded: row.state.movements.length,
      territoryCellsExcluded: Object.keys(row.state.territories).length,
      gridBounds: {
        radius: row.state.config.worldRadius,
        minX: Math.min(...sites.map((s) => s.x)),
        maxX: Math.max(...sites.map((s) => s.x)),
        minY: Math.min(...sites.map((s) => s.y)),
        maxY: Math.max(...sites.map((s) => s.y)),
      },
      nearestNpcGridDistance: {
        min: minimum(nearest),
        max: nearest.length ? Math.max(...nearest) : null,
      },
      capacityPerResource: 3000,
      regenerationPerResourceHour: 100,
      initialResourceTotal: 144000,
      existingLayoutPreserved: !!existing,
      geographySource: domain.version,
    },
  };
}

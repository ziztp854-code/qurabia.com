import type { MapLayerGroup } from './map-layer-controls';

export type LayerPreferences = Readonly<Record<MapLayerGroup, boolean>>;

/** Layers owned by each user-facing group; the session's visibility is derived from this. */
export const LAYER_GROUP_IDS: Readonly<Record<MapLayerGroup, readonly string[]>> = {
  cities: [
    'mamluk-cities',
    'mamluk-cities-owner-markers',
    'mamluk-village-clusters',
    'mamluk-village-cluster-count',
    'mamluk-overview-cells',
    'mamluk-overview-count',
  ],
  castles: ['mamluk-castles', 'mamluk-castles-owner-markers'],
  armies: [
    'mamluk-armies',
    'mamluk-armyRoutes',
    'mamluk-sieges',
    'mamluk-army-missions',
    'mamluk-army-direction',
    'mamluk-army-timers',
  ],
  territories: [
    'mamluk-territories',
    'mamluk-sultanateBorders',
    'mamluk-village-borders',
    'mamluk-village-border-halo',
  ],
  relief: ['atlas-relief', 'atlas-global-relief'],
};

const groupById = new Map<string, MapLayerGroup>(
  (Object.entries(LAYER_GROUP_IDS) as [MapLayerGroup, readonly string[]][]).flatMap(
    ([group, ids]) => ids.map((id): [string, MapLayerGroup] => [id, group]),
  ),
);

export const allLayersVisible: LayerPreferences = Object.freeze({
  cities: true,
  castles: true,
  armies: true,
  territories: true,
  relief: true,
});

export function isOverviewLayer(id: string): boolean {
  return id.startsWith('mamluk-overview-');
}

/**
 * Single rule for every layer, applied when a layer is added and whenever the
 * user's preferences or the overview/local presentation change. Layers outside
 * the groups return undefined and keep their own visibility.
 */
export function layerVisibility(
  id: string,
  preferences: LayerPreferences,
  localPresentation: boolean,
): 'visible' | 'none' | undefined {
  const group = groupById.get(id);
  if (!group) return undefined;
  if (!preferences[group]) return 'none';
  if (group !== 'cities' && group !== 'territories') return 'visible';
  return isOverviewLayer(id) === !localPresentation ? 'visible' : 'none';
}

export const managedLayerIds: readonly string[] = [...groupById.keys()];

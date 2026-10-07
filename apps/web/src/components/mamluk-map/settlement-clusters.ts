import type { LayerSpecification } from 'maplibre-gl';
import type { MapPalette } from '@mamluk/maplibre-adapter';

export const CLUSTER_LAYERS = ['mamluk-village-clusters', 'mamluk-village-cluster-count'] as const;
export const UNCLUSTERED = ['!', ['has', 'point_count']] as const;

/** MapLibre's worker clusters the bounded authorized viewport, not a second village store. */
export function settlementClusters(
  palette: MapPalette,
  label: 'قرية' | 'مدينة' = 'قرية',
): readonly LayerSpecification[] {
  return [
    {
      id: CLUSTER_LAYERS[0],
      type: 'circle',
      source: 'mamluk-cities',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': palette.city,
        'circle-stroke-color': palette.border,
        'circle-stroke-width': 1.5,
        'circle-radius': ['step', ['get', 'point_count'], 18, 50, 23, 250, 28],
      },
    },
    {
      id: CLUSTER_LAYERS[1],
      type: 'symbol',
      source: 'mamluk-cities',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['concat', ['to-string', ['get', 'point_count_abbreviated']], ` ${label}`],
        'text-size': 12,
        'text-font': ['Noto Sans Regular'],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': palette.fog },
    },
  ];
}

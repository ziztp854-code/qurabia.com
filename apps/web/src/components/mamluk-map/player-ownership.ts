import type { GeoJSONSource, LayerSpecification, ExpressionSpecification } from 'maplibre-gl';
import type { Feature } from '@mamluk/world-map-core';

export interface OwnershipColors {
  readonly own: string;
  readonly neutral: string;
  readonly selected: string;
  readonly halo: string;
  readonly players: readonly string[];
}

export interface OwnershipPresentationOptions {
  readonly viewerPlayerId: string;
  readonly colors: OwnershipColors;
}

type SdkGeoJson = Parameters<GeoJSONSource['setData']>[0];
export const OWNER_COLOR = '__mamlukOwnerColor';
export const OWN_PLOT = '__mamlukOwn';

/** Presentation copies retain every server coordinate and never create ownership. */
export function withPlayerOwnership(
  data: SdkGeoJson,
  options: OwnershipPresentationOptions,
): SdkGeoJson {
  if (typeof data === 'string' || data.type !== 'FeatureCollection') return data;
  return {
    ...data,
    features: data.features.map((feature: Feature) => {
      if (!feature.properties || !Object.hasOwn(feature.properties, 'ownerPlayerId'))
        return feature;
      const owner = feature.properties.ownerPlayerId;
      const ownerPlayerId = typeof owner === 'string' ? owner : null;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          [OWNER_COLOR]: getPlayerColor(ownerPlayerId, options),
          [OWN_PLOT]: Boolean(ownerPlayerId && ownerPlayerId === options.viewerPlayerId),
        },
      };
    }),
  };
}

/** A player keeps their cartographic color even as villages enter or leave a viewport. */
export function getPlayerColor(
  ownerPlayerId: string | null,
  { viewerPlayerId, colors }: OwnershipPresentationOptions,
): string {
  if (!ownerPlayerId) return colors.neutral;
  if (ownerPlayerId === viewerPlayerId) return colors.own;
  if (!colors.players.length) return colors.neutral;
  const hash = Array.from(ownerPlayerId).reduce(
    (value, character) => Math.imul(value ^ character.codePointAt(0)!, 16777619) >>> 0,
    2166136261,
  );
  return colors.players[hash % colors.players.length]!;
}

const selected: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];
const own: ExpressionSpecification = ['boolean', ['get', OWN_PLOT], false];

function stateColor(colors: OwnershipColors): ExpressionSpecification {
  return ['case', selected, colors.selected, ['coalesce', ['get', OWNER_COLOR], colors.neutral]];
}

/** Changes visual properties only; source IDs, filters and authoritative shapes remain intact. */
export function playerOwnershipLayer(
  layer: LayerSpecification,
  { colors }: OwnershipPresentationOptions,
): LayerSpecification {
  if (!('source' in layer) || layer.source !== layer.id) return layer;
  if (layer.id === 'mamluk-territories' && layer.type === 'fill') {
    return {
      ...layer,
      paint: {
        ...layer.paint,
        'fill-color': stateColor(colors),
        'fill-opacity': ['case', selected, 0.38, own, 0.24, 0.14],
      },
    };
  }
  if (layer.id !== 'mamluk-cities' && layer.id !== 'mamluk-castles') return layer;
  if (layer.type === 'circle') {
    return {
      ...layer,
      paint: {
        ...layer.paint,
        'circle-color': stateColor(colors),
        'circle-pitch-alignment': 'map',
        'circle-stroke-color': colors.halo,
        'circle-stroke-width': ['case', selected, 3, own, 2.5, 1.5],
      },
    };
  }
  // Owner rings carry the color; labels keep the host's legible geographic ink.
  return layer;
}

/** Every boundary follows an approved server polygon, with no inferred empire geometry. */
export function playerBorderLayers({
  colors,
}: OwnershipPresentationOptions): readonly LayerSpecification[] {
  const base = {
    type: 'line' as const,
    source: 'mamluk-territories',
    layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
  };
  return [
    {
      ...base,
      id: 'mamluk-village-border-halo',
      paint: {
        'line-color': colors.halo,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 4, 14, 7],
        'line-opacity': 0.55,
      },
    },
    {
      ...base,
      id: 'mamluk-village-borders',
      paint: {
        'line-color': stateColor(colors),
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          ['case', selected, 3, own, 2.5, 1.8],
          14,
          ['case', selected, 5, own, 4, 3],
        ],
        'line-opacity': ['case', selected, 1, own, 1, 0.9],
      },
    },
  ];
}

/** A ground marker joins each icon to its real location and the owner's plot color. */
export function playerSettlementLayers(
  source: string,
  { colors }: OwnershipPresentationOptions,
): readonly LayerSpecification[] {
  if (source !== 'mamluk-cities' && source !== 'mamluk-castles') return [];
  return [
    {
      id: `${source}-owner-markers`,
      source,
      type: 'circle',
      paint: {
        'circle-color': stateColor(colors),
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 7, 10, 10, 14, 14],
        'circle-pitch-alignment': 'map',
        'circle-opacity': ['case', selected, 0.4, 0.2],
        'circle-stroke-color': stateColor(colors),
        'circle-stroke-width': ['case', selected, 3, own, 2.5, 1.5],
        'circle-stroke-opacity': 1,
      },
    },
  ];
}

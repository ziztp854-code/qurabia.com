'use client';

import { useEffect, useRef } from 'react';
import type { Map as LibreMap } from 'maplibre-gl';

interface RegionFeatureProperties {
  name: string;
  regionType: string;
  bonus: string;
}

interface RegionConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  regionType: string;
  bonus: string;
}

type RegionFeature = {
  type: 'Feature';
  id: string;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  properties: RegionFeatureProperties;
};

type RegionFeatureCollection = {
  type: 'FeatureCollection';
  features: RegionFeature[];
};

const REGION_SOURCE_ID = 'mamluk-regions';
const REGION_FILL_ID = 'mamluk-regions-fill';
const REGION_LABEL_ID = 'mamluk-regions-labels';
const REGION_BORDER_ID = 'mamluk-regions-border';

const REGION_COLORS: Record<string, string> = {
  historical_city: 'rgba(180, 140, 80, 0.18)',
  trade_hub: 'rgba(80, 160, 120, 0.15)',
  religious_site: 'rgba(160, 100, 60, 0.2)',
  strategic_pass: 'rgba(120, 120, 160, 0.18)',
};

function regionFeature(region: RegionConfig): RegionFeature {
  const segments = 64;
  const coordinates: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    coordinates.push([region.x + region.radius * Math.cos(angle), region.y + region.radius * Math.sin(angle)]);
  }
  return {
    type: 'Feature',
    id: region.id,
    geometry: { type: 'Polygon', coordinates: [coordinates] },
    properties: { name: region.name, regionType: region.regionType, bonus: region.bonus },
  };
}

export function addRegionLayers(map: LibreMap): void {
  if (map.getSource(REGION_SOURCE_ID)) return;
  map.addSource(REGION_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: REGION_FILL_ID,
    type: 'fill',
    source: REGION_SOURCE_ID,
    paint: {
      'fill-color': [
        'match',
        ['get', 'regionType'],
        'historical_city', REGION_COLORS.historical_city,
        'trade_hub', REGION_COLORS.trade_hub,
        'religious_site', REGION_COLORS.religious_site,
        'strategic_pass', REGION_COLORS.strategic_pass,
        'rgba(180, 140, 80, 0.15)',
      ],
      'fill-opacity': 0.7,
    },
  });
  map.addLayer({
    id: REGION_BORDER_ID,
    type: 'line',
    source: REGION_SOURCE_ID,
    paint: {
      'line-color': [
        'match',
        ['get', 'regionType'],
        'historical_city', 'rgba(180, 140, 80, 0.5)',
        'trade_hub', 'rgba(80, 160, 120, 0.5)',
        'religious_site', 'rgba(160, 100, 60, 0.5)',
        'strategic_pass', 'rgba(120, 120, 160, 0.5)',
        'rgba(180, 140, 80, 0.4)',
      ],
      'line-width': 1.5,
      'line-dasharray': [3, 2],
    },
  });
  map.addLayer({
    id: REGION_LABEL_ID,
    type: 'symbol',
    source: REGION_SOURCE_ID,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular'],
      'text-size': 12,
      'text-anchor': 'center',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': 'rgba(80, 60, 30, 0.85)',
      'text-halo-color': 'rgba(255, 255, 255, 0.8)',
      'text-halo-width': 1.5,
    },
  });
}

export function updateRegionLayers(map: LibreMap, regions: readonly RegionConfig[]): void {
  const source = map.getSource(REGION_SOURCE_ID);
  if (!source) {
    if (regions.length > 0) addRegionLayers(map);
    return;
  }
  const featureCollection: RegionFeatureCollection = {
    type: 'FeatureCollection',
    features: regions.map(regionFeature),
  };
  if (regions.length === 0) {
    const geoSource = source as unknown as { setData: (data: RegionFeatureCollection) => void };
    geoSource.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  const geoSource = source as unknown as { setData: (data: RegionFeatureCollection) => void };
  geoSource.setData(featureCollection);
}

export function removeRegionLayers(map: LibreMap): void {
  [REGION_LABEL_ID, REGION_BORDER_ID, REGION_FILL_ID, REGION_SOURCE_ID].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  });
}

export function useRegionLayer(
  mapRef: { current: LibreMap | null },
  regions: readonly RegionConfig[],
): void {
  const appliedRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (regions.length > 0 && !appliedRef.current) {
      addRegionLayers(map);
      appliedRef.current = true;
    }
    if (map.getSource(REGION_SOURCE_ID)) {
      updateRegionLayers(map, regions);
    }
    return () => {
      if (regions.length === 0 && appliedRef.current) {
        removeRegionLayers(map);
        appliedRef.current = false;
      }
    };
  }, [mapRef, regions]);
}

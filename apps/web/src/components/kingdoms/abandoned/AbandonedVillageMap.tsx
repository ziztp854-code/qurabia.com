'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibre from 'maplibre-gl';
import {
  type GeoJSONSource,
  type GeoJSONSourceSpecification,
  type Map as LibreMap,
  type StyleSpecification,
} from 'maplibre-gl';
import type { AbandonedVillageView } from '@/lib/kingdoms/abandoned-village-types';
import styles from './abandoned-preview.module.css';

type SourceData = Exclude<GeoJSONSourceSpecification['data'], string | undefined>;
export interface AbandonedBasemap {
  land: SourceData;
  water: SourceData;
}
interface Props {
  sites: readonly AbandonedVillageView[];
  basemap: AbandonedBasemap;
  selectedId: string | null;
  onSelect: (id: string) => void;
}
const sourceId = 'abandoned-villages';
function features(sites: readonly AbandonedVillageView[], selectedId: string | null = null) {
  return {
    type: 'FeatureCollection' as const,
    features: sites.map((site) => ({
      type: 'Feature' as const,
      id: site.id,
      geometry: { type: 'Point' as const, coordinates: [site.longitude, site.latitude] },
      properties: { id: site.id, selected: site.id === selectedId },
    })),
  };
}
/** Separate neutral source: it never enters the player village or public atlas layer. */
export function AbandonedVillageMap({ sites, basemap, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<LibreMap | null>(null);
  const select = useRef(onSelect),
    currentSites = useRef(sites);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    select.current = onSelect;
    currentSites.current = sites;
  }, [onSelect, sites]);
  useEffect(() => {
    if (!container.current) return;
    const token = (name: string) =>
      getComputedStyle(container.current!).getPropertyValue(name).trim();
    const style: StyleSpecification = {
      version: 8,
      sources: {
        land: { type: 'geojson', data: basemap.land, attribution: 'Natural Earth — public domain' },
        water: { type: 'geojson', data: basemap.water },
        [sourceId]: { type: 'geojson', data: features(currentSites.current) },
      },
      layers: [
        { id: 'ocean', type: 'background', paint: { 'background-color': token('--map-ocean') } },
        { id: 'land', source: 'land', type: 'fill', paint: { 'fill-color': token('--map-land') } },
        {
          id: 'coast',
          source: 'land',
          type: 'line',
          paint: { 'line-color': token('--map-country-border'), 'line-width': 1 },
        },
        {
          id: 'lakes',
          source: 'water',
          type: 'fill',
          paint: { 'fill-color': token('--map-ocean') },
        },
        {
          id: 'abandoned-markers',
          source: sourceId,
          type: 'circle',
          paint: {
            'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 10, 6],
            'circle-color': [
              'case',
              ['boolean', ['get', 'selected'], false],
              token('--map-owner-selected'),
              token('--map-owner-neutral'),
            ],
            'circle-stroke-color': token('--map-owner-selected'),
            'circle-stroke-width': 2,
          },
        },
      ],
    };
    maplibre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    let instance: LibreMap;
    try {
      instance = new maplibre.Map({
        container: container.current,
        style,
        center: [42.5, 26],
        zoom: 3,
        attributionControl: { compact: true },
        maxZoom: 12,
        renderWorldCopies: false,
      });
      map.current = instance;
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-left');
      instance.on('load', () => {
        instance.fitBounds(
          [
            [24, 12],
            [61, 38.5],
          ],
          { padding: 28, duration: 0 },
        );
        setReady(true);
      });
      instance.on('error', () => setError(true));
      instance.on('click', 'abandoned-markers', (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === 'string') select.current(id);
      });
      instance.on('mouseenter', 'abandoned-markers', () => {
        instance.getCanvas().style.cursor = 'pointer';
      });
      instance.on('mouseleave', 'abandoned-markers', () => {
        instance.getCanvas().style.cursor = '';
      });
    } catch {
      map.current?.remove();
      map.current = null;
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setError(true);
      });
      return () => {
        cancelled = true;
      };
    }
    return () => {
      map.current = null;
      instance.remove();
    };
  }, [basemap]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    (instance.getSource(sourceId) as GeoJSONSource).setData(features(sites, selectedId));
  }, [ready, sites, selectedId]);
  return (
    <section className={styles.mapFrame} aria-label="خريطة القرى المهجورة">
      <div
        ref={container}
        className={styles.map}
        data-testid="abandoned-map"
        data-ready={ready}
        data-count={sites.length}
      />
      <span className={styles.mapLegend}>● قرية مهجورة · {sites.length} موقعًا</span>
      {error && (
        <p role="status" className={styles.mapNotice}>
          تعذر عرض الخريطة. يمكنك اختيار القرى من القائمة.
        </p>
      )}
      <button
        className={styles.fit}
        type="button"
        onClick={() =>
          map.current?.fitBounds(
            [
              [24, 12],
              [61, 38.5],
            ],
            { padding: 28, duration: 0 },
          )
        }
      >
        عرض جميع القرى
      </button>
    </section>
  );
}

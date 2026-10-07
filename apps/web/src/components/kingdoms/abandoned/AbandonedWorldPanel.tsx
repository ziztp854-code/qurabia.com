'use client';

import { useEffect, useState, type RefObject } from 'react';
import type { GeoJSONSource, Map as LibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import type { AbandonedVillageView } from '@/lib/kingdoms/abandoned-village-types';
import { Select } from '@/components/ui';
import { number } from '../shared';
import { AbandonedGatheringPanel } from './AbandonedGatheringPanel';
import { useAbandonedWorld } from './use-abandoned-world';
import styles from './abandoned-world.module.css';

export const ABANDONED_MAP_SOURCE = 'abandoned-villages';
const layer = 'abandoned-village-markers';
const hitLayer = 'abandoned-village-hit-targets';
export function abandonedMapData(sites: readonly AbandonedVillageView[], selectedId: string) {
  return {
    type: 'FeatureCollection' as const,
    features: sites.map((site) => ({
      type: 'Feature' as const,
      id: site.id,
      geometry: { type: 'Point' as const, coordinates: [site.longitude, site.latitude] },
      properties: { id: site.id, name: site.name, selected: site.id === selectedId },
    })),
  };
}
function useMarkers(
  mapRef: RefObject<LibreMap | null> | undefined,
  mapStyleReadyRef: RefObject<boolean> | undefined,
  status: string,
  sites: readonly AbandonedVillageView[],
  selectedId: string,
  onSelect: (id: string) => void,
) {
  useEffect(() => {
    const map = mapRef?.current;
    if (!map || !sites.length) return;
    const data = abandonedMapData(sites, selectedId);
    let installed = false;
    function install() {
      if (installed && map?.getSource(ABANDONED_MAP_SOURCE) && map.getLayer(layer)) return;
      if (!map || !(mapStyleReadyRef?.current ?? map.isStyleLoaded())) return;
      if (!map.getSource(ABANDONED_MAP_SOURCE))
        map.addSource(ABANDONED_MAP_SOURCE, { type: 'geojson', data });
      else (map.getSource(ABANDONED_MAP_SOURCE) as GeoJSONSource).setData(data);
      if (!map.getLayer(layer)) {
        const tokens = getComputedStyle(map.getContainer());
        map.addLayer({
          id: layer,
          type: 'circle',
          source: ABANDONED_MAP_SOURCE,
          paint: {
            'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 12, 8],
            'circle-color': tokens.getPropertyValue('--map-bronze').trim(),
            'circle-stroke-color': tokens.getPropertyValue('--map-gold').trim(),
            'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 4, 2],
          },
        });
        // A 44px touch target preserves the small map symbol's visual size.
        map.addLayer({
          id: hitLayer,
          type: 'circle',
          source: ABANDONED_MAP_SOURCE,
          paint: {
            'circle-radius': 22,
            'circle-color': tokens.getPropertyValue('--map-bronze').trim(),
            'circle-opacity': 0,
          },
        });
      }
      installed = true;
    }
    const click = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string' && sites.some((site) => site.id === id)) onSelect(id);
    };
    const enter = () => {
        map.getCanvas().style.cursor = 'pointer';
      },
      leave = () => {
        map.getCanvas().style.cursor = '';
      };
    install();
    map.on('style.load', install);
    map.on('idle', install);
    map.on('click', hitLayer, click);
    map.on('mouseenter', hitLayer, enter);
    map.on('mouseleave', hitLayer, leave);
    return () => {
      map.off('style.load', install);
      map.off('idle', install);
      map.off('click', hitLayer, click);
      map.off('mouseenter', hitLayer, enter);
      map.off('mouseleave', hitLayer, leave);
      if (map.getStyle()) {
        if (map.getLayer(hitLayer)) map.removeLayer(hitLayer);
        if (map.getLayer(layer)) map.removeLayer(layer);
        if (map.getSource(ABANDONED_MAP_SOURCE)) map.removeSource(ABANDONED_MAP_SOURCE);
      }
    };
  }, [mapRef, mapStyleReadyRef, status, sites, selectedId, onSelect]);
}
const emptySites: readonly AbandonedVillageView[] = [];
export function AbandonedWorldPanel({
  worldId,
  viewerId,
  initialVillageId,
  mapRef,
  mapStyleReadyRef,
  status,
  onLocate,
}: {
  worldId: string;
  viewerId: string;
  initialVillageId?: string;
  mapRef?: RefObject<LibreMap | null>;
  mapStyleReadyRef?: RefObject<boolean>;
  status: string;
  onLocate: (point: { longitude: number; latitude: number }) => void;
}) {
  const { view, error, busy, send } = useAbandonedWorld(worldId, viewerId);
  const [selectedId, setSelectedId] = useState(''),
    [villageId, setVillageId] = useState(initialVillageId ?? '');
  const sites = view?.abandonedVillages ?? emptySites;
  const site = sites.find((entry) => entry.id === selectedId);
  const village = view?.villages.find((home) => home.id === villageId) ?? view?.villages[0];
  useMarkers(mapRef, mapStyleReadyRef, status, sites, selectedId, setSelectedId);
  if (error)
    return (
      <section className={styles.panel} aria-label="القرى المهجورة">
        <p role="alert">{error}</p>
      </section>
    );
  if (!sites.length) return null;
  return (
    <section className={styles.panel} aria-label="القرى المهجورة" data-world-id={worldId}>
      <h2>القرى المهجورة · {number(sites.length)}</h2>
      {site && (
        <button type="button" className={styles.site} onClick={() => setSelectedId('')}>
          إغلاق تفاصيل القرية
        </button>
      )}
      <p className={styles.muted}>
        العلامات الدائرية على الخريطة مواقع محايدة لجمع الموارد؛ اختر علامة أو قرية من القائمة.
      </p>
      {view && village && (
        <Select
          label="قرية انطلاق البعثة"
          value={village.id}
          disabled={busy}
          onChange={(event) => setVillageId(event.target.value)}
        >
          {view.villages.map((home) => (
            <option key={home.id} value={home.id}>
              {home.name}
            </option>
          ))}
        </Select>
      )}
      <div className={styles.layout}>
        <div className={styles.directory} role="group" aria-label="دليل القرى المهجورة">
          {sites.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={styles.site}
              aria-pressed={entry.id === selectedId}
              onClick={() => {
                setSelectedId(entry.id);
                onLocate(entry);
              }}
            >
              {entry.name}
              <br />
              <span className={styles.muted}>
                {village
                  ? `${number(Math.hypot(village.x - entry.x, village.y - entry.y))} خلية لعب`
                  : ''}
              </span>
            </button>
          ))}
        </div>
        {view && village && site ? (
          <AbandonedGatheringPanel
            key={`${worldId}:${village.id}:${site.id}`}
            view={view}
            village={village}
            site={site}
            busy={busy}
            send={send}
          />
        ) : (
          <p className={styles.muted}>
            {village
              ? 'اختر قرية لعرض مخزونها وتجهيز بعثة جمع.'
              : 'تحتاج قرية تملكها لإرسال بعثة جمع.'}
          </p>
        )}
      </div>
    </section>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { OPEN_FREE_MAP_STYLE, type MapPalette } from '@mamluk/maplibre-adapter';
import type { MapPayload, MapProjection } from '@mamluk/world-map-core';
import type { Map as LibreMap } from 'maplibre-gl';
import { createMapSession } from './map-session';
import type { SelectionKey } from './selection';

type Status = 'loading' | 'ready' | 'zoom' | 'error';
const VILLAGE_OVERVIEW_ZOOM = 6.5;

function palette(container: HTMLElement): MapPalette {
  const tokens = getComputedStyle(container);
  const color = (token: string) => tokens.getPropertyValue(token).trim();
  return {
    territory: color('--map-territory'),
    border: color('--map-sultanate-border'),
    city: color('--map-city'),
    castle: color('--map-bronze'),
    army: color('--map-success'),
    route: color('--map-success'),
    siege: color('--map-danger'),
    visible: color('--map-success'),
    fog: color('--map-background'),
  };
}

export function useWorldMap(
  worldId: string,
  viewerPlayerId: string,
  initialLocation?: { readonly longitude: number; readonly latitude: number },
  initialVillageId?: string,
) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const sessionRef = useRef<ReturnType<typeof createMapSession> | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [payload, setPayload] = useState<MapPayload | null>(null);
  const [selected, setSelected] = useState<SelectionKey | null>(null);
  const [projection, setProjectionState] = useState<MapProjection>('globe');
  const [attempt, setAttempt] = useState(0);
  const projectionRef = useRef<MapProjection>('globe');
  useEffect(() => {
    let cancelled = false;
    let map: LibreMap | null = null;
    let session: ReturnType<typeof createMapSession> | null = null;
    let pendingInitialSelection = initialVillageId;
    async function initialize() {
      try {
        const { Map, setWorkerUrl } = await import('maplibre-gl');
        if (cancelled || !container.current) return;
        setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
        map = new Map({
          container: container.current,
          style: OPEN_FREE_MAP_STYLE,
          center: initialLocation
            ? [initialLocation.longitude, initialLocation.latitude]
            : [34, 30.4],
          zoom: initialLocation ? VILLAGE_OVERVIEW_ZOOM : 5.3,
          renderWorldCopies: false,
          attributionControl: { compact: true },
        });
        map
          .getCanvas()
          .setAttribute(
            'aria-label',
            'خريطة العالم: استخدم الأسهم للتحريك وعلامتي الجمع والطرح للتكبير',
          );
        mapRef.current = map;
        session = createMapSession(
          map,
          worldId,
          projectionRef.current,
          palette(container.current),
          {
            // Keep only the selection key during refresh; null payload hides every detail.
            onPayload: (nextPayload) => {
              setPayload(nextPayload);
              if (
                pendingInitialSelection &&
                nextPayload?.layers.cities.features.some(
                  (city) => city.id === pendingInitialSelection,
                )
              ) {
                setSelected({ layer: 'cities', id: pendingInitialSelection });
                pendingInitialSelection = undefined;
              }
            },
            onSelection: setSelected,
            onStatus: setStatus,
          },
        );
        sessionRef.current = session;
        map.on('error', () => {
          if (!cancelled) setStatus('error');
        });
      } catch {
        if (!cancelled) setStatus('error');
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      session?.dispose();
      map?.remove();
      mapRef.current = null;
      sessionRef.current = null;
    };
  }, [worldId, viewerPlayerId, attempt, initialLocation, initialVillageId]);
  function setProjection(value: MapProjection) {
    projectionRef.current = value;
    setProjectionState(value);
    sessionRef.current?.adapter.setProjection(value);
    void sessionRef.current?.loader.refresh();
  }
  function moveCamera(action: 'in' | 'out' | 'home') {
    const map = mapRef.current;
    if (!map) return;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
    if (action === 'home')
      map.easeTo({
        center: initialLocation
          ? [initialLocation.longitude, initialLocation.latitude]
          : [31.24967, 30.06263],
        zoom: initialLocation ? VILLAGE_OVERVIEW_ZOOM : 5.3,
        duration,
      });
    else if (action === 'in') map.zoomIn({ duration });
    else map.zoomOut({ duration });
  }
  return {
    container,
    status,
    payload,
    selected,
    setSelected,
    projection,
    setProjection,
    moveCamera,
    refresh: () => {
      if (sessionRef.current) void sessionRef.current.loader.refresh();
      else setAttempt((value) => value + 1);
    },
  };
}

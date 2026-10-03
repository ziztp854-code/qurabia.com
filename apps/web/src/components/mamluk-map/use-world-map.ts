'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OPEN_FREE_MAP_STYLE, type MapPalette } from '@mamluk/maplibre-adapter';
import type { MapPayload, MapProjection } from '@mamluk/world-map-core';
import type { Map as LibreMap } from 'maplibre-gl';
import { createMapSession } from './map-session';
import type { SelectionKey } from './selection';
import { buildPhysicalMapStyle, type PhysicalMapColors } from './physical-map-style';
import { buildReferenceMapStyle } from './reference-map-style';
import type { OwnershipPresentationOptions } from './player-ownership';
import {
  normalizeDestination,
  validateDestination,
  type RelocationDestination,
} from './relocation-destination';
import {
  createSettlementPresentation,
  type SettlementPresentation,
} from './settlement-presentation';

type Status = 'loading' | 'ready' | 'zoom' | 'error';
const VILLAGE_OVERVIEW_ZOOM = 6.5;
interface DestinationDraft {
  readonly sessionKey: string;
  readonly villageId: string;
  readonly destination: RelocationDestination | null;
  readonly picking: boolean;
  readonly manual: boolean;
}

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

function physicalPalette(container: HTMLElement): PhysicalMapColors {
  const tokens = getComputedStyle(container);
  const color = (token: string) => tokens.getPropertyValue(token).trim();
  return {
    ocean: color('--map-ocean'),
    land: color('--map-land'),
    forest: color('--map-forest'),
    border: color('--map-country-border'),
    label: color('--map-label'),
  };
}

function ownershipPalette(
  container: HTMLElement,
  viewerPlayerId: string,
): OwnershipPresentationOptions {
  const tokens = getComputedStyle(container);
  const color = (token: string) => tokens.getPropertyValue(token).trim();
  return {
    viewerPlayerId,
    colors: {
      own: color('--map-owner-self'),
      neutral: color('--map-owner-neutral'),
      selected: color('--map-owner-selected'),
      halo: color('--map-owner-halo'),
      players: [1, 2, 3, 4, 5, 6].map((index) => color(`--map-owner-${index}`)),
    },
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
  const sessionKey = `${worldId}:${viewerPlayerId}`;
  const [snapshot, setSnapshot] = useState<{
    readonly sessionKey: string;
    readonly payload: MapPayload | null;
  } | null>(null);
  const [publicSnapshot, setPublicSnapshot] = useState<{
    readonly sessionKey: string;
    readonly payload: MapPayload | null;
  } | null>(null);
  const payload = snapshot?.sessionKey === sessionKey ? snapshot.payload : null;
  const publicPayload = publicSnapshot?.sessionKey === sessionKey ? publicSnapshot.payload : null;
  const [selected, setSelectedState] = useState<SelectionKey | null>(null);
  const selectedRef = useRef<SelectionKey | null>(null);
  const [destinationDraft, setDestinationDraft] = useState<DestinationDraft | null>(null);
  const destinationRef = useRef<DestinationDraft | null>(null);
  const activeDraft =
    destinationDraft?.sessionKey === sessionKey &&
    selected?.layer === 'cities' &&
    destinationDraft.villageId === selected.id
      ? destinationDraft
      : null;
  const [projection, setProjectionState] = useState<MapProjection>('globe');
  const [attempt, setAttempt] = useState(0);
  const projectionRef = useRef<MapProjection>('globe');
  const longitude = initialLocation?.longitude;
  const latitude = initialLocation?.latitude;
  const cameraRef = useRef({ longitude, latitude });
  const pendingInitialSelection = useRef(initialVillageId);
  const cancelDestination = useCallback(() => {
    destinationRef.current = null;
    setDestinationDraft(null);
    sessionRef.current?.setDestinationPicking(false);
    sessionRef.current?.setDestinationPreview(null);
  }, []);
  const receiveSelection = useCallback(
    (key: SelectionKey | null) => {
      if (key?.id !== selectedRef.current?.id || key?.layer !== selectedRef.current?.layer)
        cancelDestination();
      selectedRef.current = key;
      setSelectedState(key);
    },
    [cancelDestination],
  );
  const updateDestination = useCallback(
    (
      point: RelocationDestination | null,
      picking: boolean,
      manual = destinationRef.current?.manual ?? false,
    ) => {
      const key = selectedRef.current;
      if (key?.layer !== 'cities') return;
      const destination = point
        ? picking ? normalizeDestination(point) : validateDestination(point)
        : null;
      const next = { sessionKey, villageId: key.id, destination, picking, manual };
      destinationRef.current = next;
      setDestinationDraft(next);
      sessionRef.current?.setDestinationPicking(picking);
      sessionRef.current?.setDestinationPreview(destination);
    },
    [sessionKey],
  );
  useEffect(() => {
    cameraRef.current = { longitude, latitude };
    pendingInitialSelection.current = initialVillageId;
    const map = mapRef.current;
    if (!map || longitude === undefined || latitude === undefined) return;
    map.easeTo({
      center: [longitude, latitude],
      zoom: VILLAGE_OVERVIEW_ZOOM,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
    });
  }, [longitude, latitude, initialVillageId]);
  useEffect(() => {
    let cancelled = false;
    let map: LibreMap | null = null;
    let session: ReturnType<typeof createMapSession> | null = null;
    let settlements: SettlementPresentation | null = null;
    let styleReady = false;
    const artworkController = new AbortController();
    async function initialize() {
      try {
        const { Map, setWorkerUrl } = await import('maplibre-gl');
        if (cancelled || !container.current) return;
        setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
        const camera = cameraRef.current;
        const hasLocation = camera.longitude !== undefined && camera.latitude !== undefined;
        map = new Map({
          container: container.current,
          center: hasLocation ? [camera.longitude!, camera.latitude!] : [34, 30.4],
          zoom: hasLocation ? VILLAGE_OVERVIEW_ZOOM : 5.3,
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
        map.on('movestart', () => map?.getCanvas().removeAttribute('data-map-ready'));
        map.on('idle', () => map?.getCanvas().setAttribute('data-map-ready', 'true'));
        map.on('style.load', () => {
          styleReady = true;
        });
        map.on('error', () => {
          if (!cancelled) setStatus('error');
        });
        const colors = physicalPalette(container.current);
        settlements = createSettlementPresentation(
          map,
          { label: colors.label, halo: colors.land },
          artworkController.signal,
        );
        // The SDK loads the provider style. Its geographic sources and credits
        // remain intact; the host changes presentation only.
        map.setStyle(OPEN_FREE_MAP_STYLE, {
          transformStyle: (_previous, next) =>
            buildReferenceMapStyle(buildPhysicalMapStyle(next, colors)),
        });
        await settlements.ready;
        if (cancelled) return;
        session = createMapSession(
          map,
          worldId,
          projectionRef.current,
          palette(container.current),
          {
            // Keep only the selection key during refresh; null payload hides every detail.
            onPayload: (nextPayload) => {
              setSnapshot({ sessionKey: `${worldId}:${viewerPlayerId}`, payload: nextPayload });
              if (
                pendingInitialSelection.current &&
                nextPayload?.layers.cities.features.some(
                  (city) => city.id === pendingInitialSelection.current,
                )
              ) {
                receiveSelection({ layer: 'cities', id: pendingInitialSelection.current });
                session?.select({ layer: 'cities', id: pendingInitialSelection.current });
                pendingInitialSelection.current = undefined;
              }
            },
            onPublicPayload: (nextPayload) =>
              setPublicSnapshot({
                sessionKey: `${worldId}:${viewerPlayerId}`,
                payload: nextPayload,
              }),
            onSelection: receiveSelection,
            onDestination: (destination) => updateDestination(destination, true, false),
            onStatus: setStatus,
          },
          settlements,
          styleReady,
          ownershipPalette(container.current, viewerPlayerId),
        );
        sessionRef.current = session;
      } catch {
        if (!cancelled) setStatus('error');
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      artworkController.abort();
      session?.dispose();
      settlements?.dispose();
      map?.remove();
      mapRef.current = null;
      sessionRef.current = null;
      destinationRef.current = null;
      setDestinationDraft(null);
    };
  }, [worldId, viewerPlayerId, attempt, receiveSelection, updateDestination]);
  function startPickingDestination() {
    updateDestination(activeDraft?.destination ?? null, true, false);
    container.current?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    mapRef.current?.getCanvas().focus({ preventScroll: true });
  }
  function reviewDestination() {
    updateDestination(activeDraft?.destination ?? null, false);
  }
  function useMapCenterDestination() {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    const point = map.unproject([canvas.clientWidth / 2, canvas.clientHeight / 2]);
    updateDestination({ longitude: point.lng, latitude: point.lat }, true, false);
  }
  function setSelected(key: SelectionKey | null) {
    receiveSelection(key);
    sessionRef.current?.select(key);
  }
  function focusSelection(key: SelectionKey, zoom?: number) {
    const source = payload ?? (key.layer === 'cities' ? publicPayload : null);
    const feature = source?.layers[key.layer].features.find((entry) => entry.id === key.id);
    if (!feature || feature.geometry.type !== 'Point') return;
    const [pointLongitude, pointLatitude] = feature.geometry.coordinates;
    mapRef.current?.easeTo({
      center: [pointLongitude, pointLatitude],
      ...(zoom === undefined ? {} : { zoom }),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400,
    });
    setSelected(key);
  }
  function setProjection(value: MapProjection) {
    projectionRef.current = value;
    setProjectionState(value);
    sessionRef.current?.adapter.setProjection(value);
    void sessionRef.current?.loader.refresh();
  }
  function moveCamera(action: 'in' | 'out' | 'home' | 'overview') {
    const map = mapRef.current;
    if (!map) return;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
    const homeVillage = initialVillageId
      ? payload?.layers.cities.features.find((city) => city.id === initialVillageId)
        ?? publicPayload?.layers.cities.features.find((city) => city.id === initialVillageId)
      : undefined;
    const homeCenter = homeVillage?.geometry.type === 'Point'
      ? homeVillage.geometry.coordinates
      : initialLocation ? [initialLocation.longitude, initialLocation.latitude] : [31.24967, 30.06263];
    if (action === 'overview') {
      setProjection('globe');
      const canvas = map.getCanvas();
      const availableSize = Math.min(canvas.clientWidth || 1024, canvas.clientHeight || 1024);
      map.easeTo({
        center: [homeCenter[0], homeCenter[1]],
        zoom: Math.max(0, Math.min(1.5, Math.log2(availableSize / 256))),
        pitch: 0,
        bearing: 0,
        duration,
      });
    } else if (action === 'home')
      map.easeTo({
        center: [homeCenter[0], homeCenter[1]],
        zoom: initialLocation || homeVillage ? VILLAGE_OVERVIEW_ZOOM : 5.3,
        pitch: 0,
        bearing: 0,
        duration,
      });
    else if (action === 'in') map.zoomIn({ duration });
    else map.zoomOut({ duration });
  }
  return {
    container,
    status,
    payload,
    publicPayload,
    selected,
    setSelected,
    focusSelection,
    projection,
    setProjection,
    moveCamera,
    destination: activeDraft?.destination ?? null,
    isPickingDestination: activeDraft?.picking ?? false,
    manualEntryRequested: activeDraft?.manual ?? false,
    startPickingDestination,
    reviewDestination,
    useMapCenterDestination,
    cancelDestination,
    changeDestination: (destination: RelocationDestination | null) =>
      updateDestination(destination, false),
    requestManualDestination: () => updateDestination(activeDraft?.destination ?? null, false, true),
    refresh: () => {
      if (sessionRef.current) void sessionRef.current.loader.refresh();
      else setAttempt((value) => value + 1);
    },
  };
}

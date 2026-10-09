import {
  MapLibreAdapter,
  ViewportLoader,
  type MapLibrePort,
  type MapPalette,
} from '@mamluk/maplibre-adapter';
import { parseMapPayload, type MapPayload, type MapProjection } from '@mamluk/world-map-core';
import type {
  AddLayerObject,
  FilterSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as LibreMap,
  MapMouseEvent,
  Source,
} from 'maplibre-gl';
import type { SelectionKey, SelectableLayer } from './selection';
import { pickMapSelection } from './selection-hit';
import {
  normalizeDestination,
  showDestinationPreview,
  validateDestination,
  type RelocationDestination,
} from './relocation-destination';
import { SDK_FEATURE_ID, withFeatureIdentity, withSourceIdentity } from './source-identity';
import type { SettlementPresentation } from './settlement-presentation';
import { CLUSTER_LAYERS, settlementClusters } from './settlement-clusters';
import { createWorldOverview, type Overview } from './world-overview';
import {
  allLayersVisible,
  layerVisibility,
  managedLayerIds,
  type LayerPreferences,
} from './layer-visibility';
import { mapRequest, MapAuthorizationError } from './map-request';
import {
  playerBorderLayers,
  playerOwnershipLayer,
  playerSettlementLayers,
  withPlayerOwnership,
  type OwnershipPresentationOptions,
} from './player-ownership';

export interface MapSessionCallbacks {
  readonly onPayload: (payload: MapPayload | null) => void;
  /** Explicitly public settlement presentation only; never military or strategic detail data. */
  readonly onPublicPayload?: (payload: MapPayload | null) => void;
  readonly onSelection: (key: SelectionKey | null) => void;
  readonly onStatus: (status: 'loading' | 'ready' | 'zoom' | 'error') => void;
  readonly onDestination?: (destination: RelocationDestination) => void;
  readonly onRefreshing?: (refreshing: boolean) => void;
  readonly onOverview?: (payload: Overview | null) => void;
  readonly onPresentation?: (local: boolean) => void;
  /** The UI session's layer choices; authoritative whenever a layer is added or shown. */
  readonly layerPreferences?: () => LayerPreferences;
}

function isStyleLayer(layer: AddLayerObject): layer is LayerSpecification {
  return layer.type !== 'custom' && (!('source' in layer) || typeof layer.source === 'string');
}

/** SDK 6 emits movement events even when the projection does not change. */
function presentationPort(
  map: LibreMap,
  palette: MapPalette,
  settlements?: Pick<SettlementPresentation, 'layer' | 'prepareCities' | 'clearPrivate'>,
  initialStyleReady?: boolean,
  retainPublicLayers: () => boolean = () => false,
  ownership?: OwnershipPresentationOptions,
  visibilityFor: (layerId: string) => 'visible' | 'none' | undefined = () => undefined,
  settlementLabel: 'قرية' | 'مدينة' = 'قرية',
) {
  const addLayer = (layer: AddLayerObject, before?: string) => {
    const visibility = isStyleLayer(layer) ? visibilityFor(layer.id) : undefined;
    map.addLayer(
      visibility
        ? ({
            ...layer,
            layout: { ...(layer as LayerSpecification).layout, visibility },
          } as LayerSpecification)
        : layer,
      before,
    );
  };
  // SDK isStyleLoaded also waits for tiles. Overlay removal must not wait for them.
  let styleReady = initialStyleReady ?? map.isStyleLoaded();
  const onStyleReady = () => {
    styleReady = true;
  };
  map.on('style.load', onStyleReady);
  const sourceCopies = new WeakMap<Source, string>();
  const isPublicSource = (id: string) => id === 'mamluk-cities' || id === 'mamluk-territories';
  const presentedData = (_id: string, data: Parameters<GeoJSONSource['setData']>[0]) => {
    const presented =
      _id === 'mamluk-cities' &&
      typeof data === 'object' &&
      data?.type === 'FeatureCollection' &&
      settlements?.prepareCities
        ? (settlements.prepareCities(
            data as unknown as import('@mamluk/world-map-core').FeatureCollection,
            ownership?.viewerPlayerId,
          ) as unknown as typeof data)
        : data;
    return ownership ? withPlayerOwnership(presented, ownership) : presented;
  };
  const removeCompanions = (id: string) => {
    const companions =
      id === 'mamluk-territories'
        ? ['mamluk-village-borders', 'mamluk-village-border-halo']
        : [`${id}-owner-markers`, ...(id === 'mamluk-cities' ? CLUSTER_LAYERS : [])];
    for (const companion of companions) if (map.getLayer(companion)) map.removeLayer(companion);
  };
  const port: MapLibrePort = {
    isStyleLoaded: () => styleReady,
    getSource: <TSource extends Source>(id: string) => {
      const source = map.getSource<TSource>(id);
      if (!source || !id.startsWith('mamluk-')) return source;
      const identified = withSourceIdentity(source, (data) => presentedData(id, data));
      if (!isPublicSource(id) || source.type !== 'geojson') return identified;
      return new Proxy(identified, {
        get(target, property) {
          if (property !== 'setData') return Reflect.get(target, property);
          return (data: Parameters<GeoJSONSource['setData']>[0]) => {
            const presented = presentedData(id, data);
            if (!retainPublicLayers())
              return (target as unknown as GeoJSONSource).setData(presented);
            const signature = JSON.stringify(withFeatureIdentity(presented));
            if (sourceCopies.get(source) === signature) return target;
            const result = (target as unknown as GeoJSONSource).setData(presented);
            sourceCopies.set(source, signature);
            return result;
          };
        },
      });
    },
    addSource: (id, source) => {
      const presented =
        id.startsWith('mamluk-') && source.type === 'geojson'
          ? {
              ...source,
              data: withFeatureIdentity(presentedData(id, source.data)),
              promoteId: SDK_FEATURE_ID,
              ...(id === 'mamluk-cities'
                ? { cluster: true, clusterMaxZoom: 7, clusterRadius: 48 }
                : {}),
            }
          : source;
      map.addSource(id, presented);
      const added = map.getSource(id);
      if (added && retainPublicLayers() && isPublicSource(id) && presented.type === 'geojson')
        sourceCopies.set(added, JSON.stringify(presented.data));
      return map;
    },
    getLayer: map.getLayer.bind(map),
    addLayer: (layer) => {
      // Fog shades the basemap; every overlay already passed the server's policy.
      const presented =
        layer.id === 'mamluk-fog' && layer.type === 'fill'
          ? { ...layer, paint: { ...layer.paint, 'fill-opacity': 0.14 } }
          : isStyleLayer(layer)
            ? (settlements?.layer(layer) ?? layer)
            : layer;
      if (ownership)
        for (const ground of playerSettlementLayers(layer.id, ownership))
          addLayer(
            layer.id === 'mamluk-cities' && ground.type === 'circle'
              ? { ...ground, filter: ['!', ['has', 'point_count']] }
              : ground,
          );
      const owned =
        ownership && isStyleLayer(presented)
          ? playerOwnershipLayer(presented, ownership)
          : presented;
      const filtered =
        layer.id === 'mamluk-cities' && isStyleLayer(owned)
          ? { ...owned, filter: ['!', ['has', 'point_count']] as FilterSpecification }
          : owned;
      addLayer(filtered, layer.id === 'mamluk-fog' ? 'mamluk-territories' : undefined);
      if (layer.id === 'mamluk-cities')
        for (const cluster of settlementClusters(palette, settlementLabel)) addLayer(cluster);
      if (layer.id === 'mamluk-territories') {
        if (ownership) {
          for (const border of playerBorderLayers(ownership)) addLayer(border);
          return map;
        }
        // Only outline approved server polygons, sharing the adapter's expiry lifecycle.
        addLayer({
          id: 'mamluk-village-borders',
          type: 'line',
          source: 'mamluk-territories',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': palette.city, 'line-width': 2.5, 'line-opacity': 0.9 },
        });
      }
      return map;
    },
    removeLayer: (id) => {
      if (retainPublicLayers() && (id === 'mamluk-cities' || id === 'mamluk-territories'))
        return map;
      removeCompanions(id);
      return map.removeLayer(id);
    },
    removeSource: (id) => {
      if (retainPublicLayers() && isPublicSource(id)) return map;
      // Partial SDK add failures can leave a companion without its primary layer.
      removeCompanions(id);
      const source = map.getSource(id);
      if (source) sourceCopies.delete(source);
      return map.removeSource(id);
    },
    setProjection: (projection) => {
      if (map.getProjection()?.type === projection.type) return map;
      return map.setProjection(projection);
    },
    setStyle: (style, options) => {
      styleReady = false;
      return map.setStyle(style, options);
    },
    on: map.on.bind(map),
    off: map.off.bind(map),
    getBounds: map.getBounds.bind(map),
    project: map.project.bind(map),
    unproject: map.unproject.bind(map),
  };
  return { port, dispose: () => map.off('style.load', onStyleReady) };
}

/** Observes accepted snapshots only; this class cannot compute game state. */
class ObservedAdapter extends MapLibreAdapter {
  private replacing = false;
  private accepted: Pick<MapPayload, 'revision' | 'serverTime'> | null = null;
  public publicPayload: MapPayload | null = null;
  constructor(
    private readonly port: MapLibrePort,
    palette: MapPalette,
    private readonly receive: MapSessionCallbacks['onPayload'],
    private readonly isPublic: (payload: MapPayload) => boolean,
    private readonly retainPublicLayers: (retain: boolean) => void,
    private readonly receivePublic: NonNullable<MapSessionCallbacks['onPublicPayload']>,
    onExpire?: () => void,
    private readonly viewerPlayerId?: string,
  ) {
    super(port, { palette, animateArmies: true, ...(onExpire ? { onExpire } : {}) });
  }
  override render(payload: MapPayload, deliveryAgeMs = 0): void {
    const stale =
      this.accepted &&
      (BigInt(payload.revision) < BigInt(this.accepted.revision) ||
        (payload.revision === this.accepted.revision &&
          payload.serverTime < this.accepted.serverTime));
    if (stale) return;
    this.publicPayload = this.isPublic(payload)
      ? publicSettlementPresentation(payload, this.viewerPlayerId)
      : null;
    this.retainPublicLayers(this.publicPayload !== null);
    this.replacing = true;
    try {
      super.render(payload, deliveryAgeMs);
      this.accepted = { revision: payload.revision, serverTime: payload.serverTime };
      this.receive(payload);
      this.receivePublic(this.publicPayload);
    } catch (error) {
      this.publicPayload = null;
      this.retainPublicLayers(false);
      super.clear();
      this.receive(null);
      this.receivePublic(null);
      throw error;
    } finally {
      this.replacing = false;
    }
  }
  override clear(): void {
    super.clear();
    // Current snapshot details expire; only the explicitly public city allowlist survives.
    if (!this.replacing && this.publicPayload) {
      try {
        this.port
          .getSource<GeoJSONSource>('mamluk-cities')
          ?.setData(this.publicPayload.layers.cities);
      } catch {
        // If sanitization fails, remove public sources too; never keep their old private attributes.
        this.publicPayload = null;
        this.retainPublicLayers(false);
        super.clear();
        this.receivePublic(null);
      }
    }
    if (!this.replacing) this.receive(null);
  }
  override resetSession(worldId: string): void {
    this.clearPublic();
    super.resetSession(worldId);
    this.accepted = null;
  }
  /** Public retention is presentation only: current detail payloads and all private sources still clear. */
  clearPublic(): void {
    this.publicPayload = null;
    this.retainPublicLayers(false);
    this.clear();
    this.receivePublic(null);
  }
}

type CityProperties = MapPayload['layers']['cities']['features'][number]['properties'];

/**
 * Public settlement fields only. Absent values are omitted so the payload never
 * carries `undefined`, which the map contract rejects.
 * Level is public. Visual tier stays with the owner.
 */
function publicSettlementFields(properties: CityProperties, viewerPlayerId: string | undefined) {
  const fields: Record<string, string | number> = {};
  if (typeof properties.kingdomName === 'string') fields.kingdomName = properties.kingdomName;
  if (typeof properties.allianceName === 'string') fields.allianceName = properties.allianceName;
  const level = properties.villageLevel;
  if (typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 50)
    fields.villageLevel = level;
  if (viewerPlayerId && properties.ownerPlayerId === viewerPlayerId) {
    const tier = properties.villageVisualTier;
    if (typeof tier === 'number' && Number.isInteger(tier) && tier >= 1 && tier <= 6)
      fields.villageVisualTier = tier;
  }
  return fields;
}

function publicSettlementPresentation(payload: MapPayload, viewerPlayerId?: string): MapPayload {
  const cities: MapPayload['layers']['cities'] = {
    type: 'FeatureCollection',
    features: payload.layers.cities.features.map((feature) => ({
      type: 'Feature',
      id: feature.id,
      geometry: structuredClone(feature.geometry),
      properties: {
        name: feature.properties.name,
        regionId: feature.properties.regionId,
        ownerPlayerId: feature.properties.ownerPlayerId,
        ownerSultanateId: feature.properties.ownerSultanateId,
        // Level is public. Rank, power, visual tier and every other rival field stay private.
        ...publicSettlementFields(feature.properties, viewerPlayerId),
      },
    })),
  };
  const empty = { type: 'FeatureCollection' as const, features: [] };
  return {
    ...payload,
    layers: {
      cities,
      territories: structuredClone(payload.layers.territories),
      castles: empty,
      armies: empty,
      armyRoutes: empty,
      sieges: empty,
      sultanateBorders: empty,
      visibility: empty,
      fog: empty,
    },
  };
}

const layers: readonly SelectableLayer[] = ['cities', 'castles', 'armies', 'sieges'];
export function createMapSession(
  map: LibreMap,
  worldId: string,
  projection: MapProjection,
  palette: MapPalette,
  callbacks: MapSessionCallbacks,
  settlements?: Pick<SettlementPresentation, 'layer' | 'prepareCities' | 'clearPrivate'>,
  initialStyleReady?: boolean,
  ownership?: OwnershipPresentationOptions,
) {
  let disposed = false;
  let localPresentation = true;
  const viewport: { loader?: ViewportLoader } = {};
  let selected: SelectionKey | null = null;
  let currentPayload: MapPayload | null = null;
  let selectedStates: readonly { readonly source: string; readonly id: string }[] = [];
  let retainPublicLayers = false;
  let destinationPicking = false;
  let destinationPreview: RelocationDestination | null = null;
  const publicPayloads = new WeakSet<MapPayload>();
  const preferences = () => callbacks.layerPreferences?.() ?? allLayersVisible;
  const visibilityFor = (id: string) => {
    // An overview clears private intelligence, but its public city/plot sources
    // keep the same authorized markers while the next viewport is loading.
    const retainedSettlement =
      retainPublicLayers &&
      (id === 'mamluk-cities' ||
        id === 'mamluk-cities-owner-markers' ||
        CLUSTER_LAYERS.includes(id as (typeof CLUSTER_LAYERS)[number]) ||
        id === 'mamluk-territories' ||
        id === 'mamluk-village-borders' ||
        id === 'mamluk-village-border-halo');
    return layerVisibility(id, preferences(), localPresentation || retainedSettlement);
  };
  let currentOverview: Overview | null = null;
  const overview = createWorldOverview(map, worldId, palette, visibilityFor, (payload) => {
    currentOverview = payload;
    if (!disposed) callbacks.onOverview?.(payload);
  });
  /** The UI preference stays authoritative: presentation never re-shows a hidden group. */
  const applyLayerVisibility = () => {
    if (typeof map.setLayoutProperty !== 'function') return;
    for (const id of managedLayerIds) {
      const visibility = visibilityFor(id);
      if (visibility && map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
    }
  };
  const showLocal = (visible: boolean) => {
    localPresentation = visible;
    applyLayerVisibility();
  };
  const presentation = presentationPort(
    map,
    palette,
    settlements,
    initialStyleReady,
    () => retainPublicLayers,
    ownership,
    visibilityFor,
    worldId === 'mamluk-public-geographic-atlas-v1' ? 'مدينة' : 'قرية',
  );
  const adapter = new ObservedAdapter(
    presentation.port,
    palette,
    (payload) => {
      if (disposed) return;
      currentPayload = payload;
      callbacks.onPayload(payload);
      if (payload) {
        overview.hide();
        showLocal(true);
        callbacks.onPresentation?.(true);
        callbacks.onRefreshing?.(false);
        callbacks.onStatus('ready');
        applySelection();
      }
    },
    (payload) => publicPayloads.has(payload),
    (retain) => {
      retainPublicLayers = retain;
    },
    (payload) => {
      if (!payload) settlements?.clearPrivate?.();
      if (!disposed) callbacks.onPublicPayload?.(payload);
    },
    () => viewport.loader?.requestRefresh(),
    ownership?.viewerPlayerId,
  );
  adapter.resetSession(worldId);
  adapter.setProjection(projection);
  const loader = new ViewportLoader(map, adapter, {
    refreshAtArmyArrivals: true,
    // Only the reserved, neutral reference atlas supports full-globe detail.
    // Campaign intelligence retains the default 90-degree limit and overview.
    ...(worldId === 'mamluk-public-geographic-atlas-v1'
      ? { maxLongitudeSpan: 360, maxLatitudeSpan: 180 }
      : {}),
    // Only revoked access invalidates what is shown; network and data failures keep the
    // last authorized snapshot until its own expiry and retry with bounded backoff.
    retainOnError: (error) => !(error instanceof MapAuthorizationError),
    shouldRetry: (error) => !(error instanceof MapAuthorizationError),
    // The reserved public landmark atlas has no authenticated gameplay aggregate.
    loadOverview:
      worldId === 'mamluk-public-geographic-atlas-v1'
        ? undefined
        : async (bounds, signal) => {
            callbacks.onRefreshing?.(true);
            const accepted = await overview.load(bounds, signal);
            if (!signal.aborted && !disposed) {
              if (accepted) {
                showLocal(false);
                callbacks.onPresentation?.(false);
              }
              callbacks.onRefreshing?.(false);
              callbacks.onStatus('ready');
            }
            return accepted;
          },
    load: async (bounds, signal) => {
      callbacks.onRefreshing?.(true);
      if (!currentPayload && !adapter.publicPayload) callbacks.onStatus('loading');
      const query = new URLSearchParams({
        worldId,
        ...Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, String(value)])),
      });
      const response = await mapRequest(`/api/kingdoms/world-map/viewport?${query}`, signal, {
        // Older hosts ignore this header; older clients receive their original DTO.
        'X-Mamluk-Village-Buildings': '1',
        'X-Mamluk-Army-Missions': '1',
      });
      const payload = parseMapPayload(await response.json());
      if (response.headers?.get('X-Mamluk-Public-Settlements') === '1') publicPayloads.add(payload);
      return payload;
    },
    onError: (error) => {
      if (disposed) return;
      callbacks.onRefreshing?.(false);
      if (error instanceof MapAuthorizationError) {
        overview.hide();
        adapter.clearPublic();
      }
      callbacks.onStatus('error');
    },
  });
  viewport.loader = loader;
  const onMove = () => {
    if (disposed) return;
    const keepVillageDraft =
      selected?.layer === 'cities' && (destinationPicking || destinationPreview);
    if (
      !keepVillageDraft &&
      !currentPayload &&
      (selected?.layer !== 'cities' || !adapter.publicPayload)
    ) {
      selected = null;
      callbacks.onSelection(null);
    }
    applySelection();
    callbacks.onStatus(
      !currentPayload && !adapter.publicPayload && !currentOverview
        ? 'loading'
        : loader.isBroad(adapter.getViewportBounds())
          ? 'zoom'
          : currentPayload || adapter.publicPayload
            ? 'ready'
            : 'loading',
    );
  };
  const onClick = (event: MapMouseEvent) => {
    if (!destinationPicking && overview.click(event)) return;
    if (destinationPicking) {
      const destination =
        event.lngLat &&
        normalizeDestination({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
      if (destination) callbacks.onDestination?.(destination);
      return;
    }
    const clusterLayers = CLUSTER_LAYERS.filter((id) => map.getLayer(id));
    const cluster = clusterLayers.length
      ? map
          .queryRenderedFeatures(event.point, { layers: [...clusterLayers] })
          .find((feature) => typeof feature.properties?.cluster_id === 'number')
      : undefined;
    if (cluster?.geometry.type === 'Point') {
      const source = map.getSource<GeoJSONSource>('mamluk-cities');
      const coordinates = cluster.geometry.coordinates;
      void source
        ?.getClusterExpansionZoom(cluster.properties.cluster_id)
        .then((zoom) => {
          if (!disposed && map.getSource('mamluk-cities') === source)
            map.easeTo({
              center: [coordinates[0], coordinates[1]],
              zoom,
              duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
            });
        })
        .catch(() => {
          if (!disposed) callbacks.onStatus('error');
        });
      return;
    }
    const visibleLayers = layers.map((layer) => `mamluk-${layer}`).filter((id) => map.getLayer(id));
    if (!visibleLayers.length) return;
    selected = pickMapSelection(
      map,
      currentPayload ?? adapter.publicPayload,
      map.queryRenderedFeatures(event.point, { layers: visibleLayers }),
      event.point,
    );
    applySelection();
    callbacks.onSelection(selected);
  };
  function applySelection() {
    if (typeof map.setFeatureState !== 'function') return;
    try {
      for (const state of selectedStates)
        if (map.getSource(state.source)) map.setFeatureState(state, { selected: false });
      const approved = currentPayload ?? adapter.publicPayload;
      selectedStates =
        selected && approved
          ? [
              selected.layer,
              ...(selected.layer === 'cities' ? (['territories'] as const) : []),
            ].flatMap((layer) => {
              const feature = approved.layers[layer as keyof MapPayload['layers']].features.find(
                (entry) => entry.id === selected!.id,
              );
              const source = `mamluk-${layer}`;
              return feature && map.getSource(source) ? [{ source, id: feature.id }] : [];
            })
          : [];
      for (const state of selectedStates) map.setFeatureState(state, { selected: true });
    } catch {
      // Optional highlighting must never interrupt source clearing or private expiry.
      selected = null;
      selectedStates = [];
      callbacks.onSelection(null);
      callbacks.onStatus('error');
    }
  }
  const onStyleLoad = () => {
    adapter.clearPublic();
    applyLayerVisibility();
    if (destinationPreview) showDestinationPreview(map, destinationPreview, palette);
    void loader.refresh();
  };
  map.on('style.load', onStyleLoad);
  map.on('moveend', onMove);
  map.on('click', onClick);
  if (presentation.port.isStyleLoaded()) {
    applyLayerVisibility();
    void loader.refresh();
  }
  return {
    adapter,
    loader,
    applyLayerVisibility,
    refreshSettlementPresentation: () => {
      if (disposed || !settlements) return;
      // Artwork may arrive after the data. Replace only the presentation layer;
      // the GeoJSON source, its worker clusters and approved features stay put.
      for (const id of ['mamluk-cities', 'mamluk-castles']) {
        const current = map.getLayer(id)?.serialize();
        if (current?.type !== 'circle') continue;
        const next = settlements.layer(current);
        if (next.type !== 'symbol') continue;
        const owned = ownership ? playerOwnershipLayer(next, ownership) : next;
        if (owned.type !== 'symbol') continue;
        map.removeLayer(id);
        try {
          map.addLayer({
            ...owned,
            ...(id === 'mamluk-cities'
              ? { filter: ['!', ['has', 'point_count']] as FilterSpecification }
              : {}),
            layout: { ...owned.layout, visibility: visibilityFor(id) ?? 'visible' },
          });
        } catch {
          // A rejected sprite must leave the already approved circle marker usable.
          if (!map.getLayer(id)) map.addLayer(current);
        }
      }
    },
    setDestinationPicking: (picking: boolean) => {
      destinationPicking = picking;
      map.getCanvas().style.cursor = picking ? 'crosshair' : '';
    },
    setDestinationPreview: (destination: RelocationDestination | null) => {
      destinationPreview = destination ? validateDestination(destination) : null;
      showDestinationPreview(map, destinationPreview, palette);
    },
    select: (key: SelectionKey | null) => {
      selected = key;
      applySelection();
    },
    dispose: () => {
      disposed = true;
      overview.dispose();
      destinationPicking = false;
      destinationPreview = null;
      showDestinationPreview(map, null, palette);
      map.getCanvas().style.cursor = '';
      adapter.clearPublic();
      loader.dispose();
      adapter.dispose();
      presentation.dispose();
      map.off('style.load', onStyleLoad);
      map.off('moveend', onMove);
      map.off('click', onClick);
    },
  };
}

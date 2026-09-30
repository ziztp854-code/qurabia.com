import type { StyleSpecification } from 'maplibre-gl' with { 'resolution-mode': 'import' };
import { parseMapPayload, type BoundingBox } from '@mamluk/world-map-core';
import { MapLibreAdapter } from './adapter';
import { OPEN_FREE_MAP_STYLE } from './styles';
import { ViewportLoader } from './viewport-loader';

export interface BrowserMapOptions {
  readonly container: string | HTMLElement;
  readonly worldId: string;
  /** Same-origin authenticated endpoint. Identity is derived by the server. */
  readonly endpoint: string;
  readonly style?: string | StyleSpecification;
  readonly onError: (error: unknown) => void;
}

/** Import MapLibre's CSS in the host bundler; give the container a nonzero height. */
export async function createMamlukWorldMap(options: BrowserMapOptions) {
  const endpoint = new URL(options.endpoint, window.location.href);
  if (endpoint.origin !== window.location.origin)
    throw new Error('Map endpoint must be same origin');
  const { Map } = await import('maplibre-gl');
  const map = new Map({
    container: options.container,
    style: options.style ?? OPEN_FREE_MAP_STYLE,
    center: [31.2357, 30.0444],
    zoom: 4,
    renderWorldCopies: false,
  });
  let loader: ViewportLoader | undefined;
  const adapter = new MapLibreAdapter(map, { onExpire: () => void loader?.refresh() });
  adapter.resetSession(options.worldId);
  adapter.setProjection('globe');
  loader = new ViewportLoader(map, adapter, {
    load: (bounds, signal) => fetchViewport(endpoint, options.worldId, bounds, signal),
    onError: options.onError,
  });
  const onStyleLoad = () => void loader?.refresh();
  map.on('style.load', onStyleLoad);
  return {
    map,
    adapter,
    loader,
    dispose: () => {
      map.off('style.load', onStyleLoad);
      loader?.dispose();
      adapter.dispose();
      map.remove();
    },
  };
}

async function fetchViewport(
  endpoint: URL,
  worldId: string,
  bounds: BoundingBox,
  signal: AbortSignal,
) {
  const url = new URL(endpoint);
  url.searchParams.set('worldId', worldId);
  for (const key of ['west', 'south', 'east', 'north'] as const) {
    url.searchParams.set(key, String(bounds[key]));
  }
  const response = await fetch(url, {
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Map viewport request failed (${response.status})`);
  return parseMapPayload(await response.json());
}

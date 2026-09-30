import type { MapPayload } from './presentation';
import type { AuthenticatedMapViewer, ViewportRequest } from './queries';
import { WorldMapService } from './service';
import { validateBounds } from './spatial';
import { validateId } from './validation';

export interface MapHttpResponse {
  readonly status: 200 | 400 | 401 | 429 | 503;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: MapPayload | { readonly error: string };
}
export interface MapEndpointPorts<Request> {
  /** Derive identity from a validated session, never a query/header player ID. */
  authenticate(request: Request): Promise<AuthenticatedMapViewer | null>;
  allowRequest(request: Request, viewer: AuthenticatedMapViewer): Promise<boolean>;
  reportError(error: unknown): void;
}
const response = (
  status: MapHttpResponse['status'],
  body: MapHttpResponse['body'],
): MapHttpResponse => ({
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie, Authorization',
  },
  body,
});

export function parseViewportRequest(url: string): ViewportRequest {
  if (typeof url !== 'string' || url.length > 2048)
    throw new RangeError('Invalid viewport request');
  const search = new URL(url, 'https://map.invalid').searchParams;
  const keys = ['worldId', 'west', 'south', 'east', 'north'];
  if (
    [...search.keys()].some((key) => !keys.includes(key)) ||
    keys.some((key) => search.getAll(key).length !== 1)
  ) {
    throw new RangeError('Invalid viewport request');
  }
  const worldId = search.get('worldId')!;
  validateId(worldId);
  const readNumber = (key: string) => {
    const value = search.get(key)!;
    if (!value.trim()) throw new RangeError('Invalid viewport request');
    return Number(value);
  };
  const bounds = {
    west: readNumber('west'),
    south: readNumber('south'),
    east: readNumber('east'),
    north: readNumber('north'),
  };
  validateBounds(bounds);
  return { worldId, bounds };
}

/** Executable HTTP integration seam; convert its result with the host's ordinary response API. */
export function createMapViewportHandler<Request extends { readonly url: string }>(
  service: WorldMapService,
  ports: MapEndpointPorts<Request>,
): (request: Request) => Promise<MapHttpResponse> {
  return async (request) => {
    try {
      const viewer = await ports.authenticate(request);
      if (viewer === null) return response(401, { error: 'Authentication required' });
      if (!(await ports.allowRequest(request, viewer)))
        return response(429, { error: 'Map request limited' });
      let viewport: ViewportRequest;
      try {
        viewport = parseViewportRequest(request.url);
      } catch {
        return response(400, { error: 'Invalid map viewport' });
      }
      return response(200, await service.getViewport(viewport, viewer));
    } catch (error) {
      try {
        ports.reportError(error);
      } finally {
        return response(503, { error: 'Map viewport unavailable' });
      }
    }
  };
}

import { beforeEach, expect, it, vi } from 'vitest';
import { KingdomsHttpError } from '@/lib/kingdoms/http';
const deps = vi.hoisted(() => ({
  identity: vi.fn(),
  rate: vi.fn(),
  overview: vi.fn(),
  location: vi.fn(),
}));
vi.mock('@/lib/kingdoms/identity', () => ({
  kingdomIdentity: deps.identity,
  kingdomRateLimit: deps.rate,
}));
vi.mock('@/lib/mamluk-map/overview', () => ({ readMapOverview: deps.overview }));
vi.mock('@/lib/mamluk-map/location', () => ({ readMapVillageLocation: deps.location }));
import { GET as overview } from './route';
import { GET as location } from '../location/route';
const request = (query: string) =>
  new Request(`https://qurabia.com/api/kingdoms/world-map/overview?${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  deps.identity.mockResolvedValue({ id: 'viewer', tokenVersion: 2 });
  deps.overview.mockResolvedValue({ cells: { type: 'FeatureCollection', features: [] } });
  deps.location.mockResolvedValue({ villageId: 'v1' });
});
it('accepts full-world bounds and binds overview and locator to the authenticated identity', async () => {
  const response = await overview(request('worldId=world&west=-180&east=180&south=-90&north=90'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(deps.overview).toHaveBeenCalledWith(
    { worldId: 'world', bounds: { west: -180, east: 180, south: -90, north: 90 } },
    { id: 'viewer', tokenVersion: 2 },
  );
  expect((await location(request('worldId=world&villageId=v1'))).status).toBe(200);
  expect(deps.location).toHaveBeenCalledWith('world', 'v1', { id: 'viewer', tokenVersion: 2 });
  expect(deps.rate).toHaveBeenCalledWith('viewer', false);
});
it('rejects malformed, duplicate and identity-bearing queries before querying data', async () => {
  for (const query of [
    'worldId=w&west=180&east=180&south=0&north=10',
    'worldId=w&west=NaN&east=20&south=0&north=10',
    'worldId=w&west=0&east=20&south=0&north=10&playerId=enemy',
  ])
    expect((await overview(request(query))).status).toBe(400);
  for (const query of [
    'worldId=w&villageId=v1&villageId=v2',
    'worldId=w&villageId=v1&playerId=enemy',
    'worldId=w',
  ])
    expect((await location(request(query))).status).toBe(400);
  expect(deps.overview).not.toHaveBeenCalled();
  expect(deps.location).not.toHaveBeenCalled();
});
it('fails closed for revoked identities, rate limits, and unavailable villages', async () => {
  deps.identity.mockRejectedValueOnce(new KingdomsHttpError(401, 'غير مصرح'));
  expect((await overview(request('worldId=w&west=-180&east=180&south=-90&north=90'))).status).toBe(
    401,
  );
  deps.rate.mockRejectedValueOnce(new KingdomsHttpError(429, 'انتظر'));
  expect((await location(request('worldId=w&villageId=v1'))).status).toBe(429);
  deps.location.mockRejectedValueOnce(new KingdomsHttpError(404, 'غير متاح'));
  expect((await location(request('worldId=w&villageId=v1'))).status).toBe(404);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldMapReadSession } from '@mamluk/world-map-core/server';
import { createGeographicCampaign } from '@/lib/mamluk-map/data';
import { KingdomsHttpError } from '@/lib/kingdoms/http';
import { PUBLIC_ATLAS_WORLD } from '@/lib/mamluk-map/public-atlas';

const dependencies = vi.hoisted(() => ({
  identity: vi.fn(),
  limit: vi.fn(),
  publicLimit: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: dependencies.publicLimit }));
vi.mock('@/lib/kingdoms/identity', () => ({
  kingdomIdentity: dependencies.identity,
  kingdomRateLimit: dependencies.limit,
}));
vi.mock('@/lib/mamluk-map/repository', () => ({
  PrismaWorldMapRepository: class {
    withSnapshot = dependencies.read;
  },
}));
import { GET } from './route';

const request = (extra = '') =>
  new Request(
    `https://qurabia.com/api/kingdoms/world-map/viewport?worldId=world&west=25&south=15&east=50&north=40${extra}`,
  );
describe('authenticated host map viewport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.identity.mockResolvedValue({ id: 'alice', tokenVersion: 0 });
    dependencies.limit.mockResolvedValue(undefined);
    dependencies.publicLimit.mockResolvedValue(true);
    dependencies.read.mockImplementation(async (_world, _viewer, read) => {
      const now = Date.now();
      const campaign = createGeographicCampaign('world', 'alice', 'enemy', now);
      const values = <T>(records: readonly { value: T }[]) => records.map((record) => record.value);
      const session: WorldMapReadSession = {
        snapshot: {
          worldId: 'world',
          viewerPlayerId: 'alice',
          revision: '1',
          serverTime: now,
          validUntil: now + 15000,
        },
        getCitiesInBounds: async () => values(campaign.cities),
        getCastlesInBounds: async () => values(campaign.castles),
        getTerritoriesInBounds: async () => values(campaign.territories),
        getSultanateTerritoriesInBounds: async () => values(campaign.sultanateTerritories),
        getVisibleArmiesInBounds: async () => values(campaign.armies),
        getSiegesInBounds: async () => values(campaign.sieges),
        getVisibilityInBounds: async () => ({
          regions: campaign.visibility.map((grant) => grant.value.region),
          visibleTerritoryIds: ['egypt-campaign', 'levant-campaign', 'hejaz-campaign'],
          visibleSultanateTerritoryIds: ['mamluk-campaign-border'],
        }),
      };
      return read(session);
    });
  });
  it('filters hidden enemy records before returning actual GeoJSON with private caching', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-mamluk-public-settlements')).toBe('0');
    const body = await response.json();
    expect(body.layers.cities.features).toHaveLength(12);
    expect(JSON.stringify(body)).not.toContain('enemy-hidden');
    const enemy = body.layers.armies.features.find(
      (army: { id: string }) => army.id === 'enemy-visible',
    );
    expect(enemy.properties).not.toHaveProperty('destination');
    expect(body.layers.armyRoutes.features.map((route: { id: string }) => route.id)).toEqual([
      'cairo-guard',
    ]);
    expect(dependencies.limit).toHaveBeenCalledWith('alice', false);
  });
  it('rejects forged viewer IDs, duplicate fields and invalid coordinates before repository access', async () => {
    expect((await GET(request('&playerId=enemy'))).status).toBe(400);
    expect((await GET(request('&west=26'))).status).toBe(400);
    expect(
      (
        await GET(
          new Request(
            'https://qurabia.com/api/kingdoms/world-map/viewport?worldId=world&west=900&south=15&east=50&north=40',
          ),
        )
      ).status,
    ).toBe(400);
    expect(dependencies.read).not.toHaveBeenCalled();
  });
  it('emits retention permission only for server-approved public settlement sessions', async () => {
    const originalRead = dependencies.read.getMockImplementation()!;
    dependencies.read.mockImplementation((_world, _viewer, read) =>
      originalRead(_world, _viewer, (session: WorldMapReadSession) =>
        read({
          ...session,
          settlementsPublic: true,
          getPublicVillageCitiesInBounds: async () => [],
          getPublicVillageTerritoriesInBounds: async () => [],
        }),
      ),
    );
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('x-mamluk-public-settlements')).toBe('1');
    expect(JSON.stringify(await response.json())).not.toContain('enemy-hidden');
    dependencies.read.mockRejectedValue(new KingdomsHttpError(401, 'الجلسة غير صالحة.'));
    const denied = await GET(request());
    expect(denied.status).toBe(401);
    expect(denied.headers.has('x-mamluk-public-settlements')).toBe(false);
  });
  it('requires a current session and rate limit before reading', async () => {
    dependencies.identity.mockRejectedValue(new KingdomsHttpError(401, 'سجّل الدخول.'));
    expect((await GET(request())).status).toBe(401);
    dependencies.identity.mockResolvedValue({ id: 'alice', tokenVersion: 0 });
    dependencies.limit.mockRejectedValue(new KingdomsHttpError(429, 'انتظر قليلًا.'));
    expect((await GET(request())).status).toBe(429);
    expect(dependencies.read).not.toHaveBeenCalled();
  });
  it('does not reveal foreign-world existence or database errors', async () => {
    dependencies.read.mockRejectedValue(new KingdomsHttpError(404, 'الخريطة غير متاحة.'));
    expect((await GET(request())).status).toBe(404);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    dependencies.read.mockRejectedValue(new Error('private-query-details'));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-query-details');
    consoleError.mockRestore();
  });
  it('serves the explicit public reference atlas without querying private campaign records', async () => {
    const response = await GET(
      new Request(
        `https://qurabia.com/api/kingdoms/world-map/viewport?worldId=${PUBLIC_ATLAS_WORLD.id}&west=31.2&south=30&east=31.3&north=30.1`,
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-mamluk-public-settlements')).toBe('1');
    const body = await response.json();
    expect(body.worldId).toBe(PUBLIC_ATLAS_WORLD.id);
    expect(body.layers.cities.features.map((city: { id: string }) => city.id)).toEqual(['cairo']);
    expect(body.layers.armies.features).toEqual([]);
    expect(body.layers.armyRoutes.features).toEqual([]);
    expect(body.layers.sieges.features).toEqual([]);
    expect(dependencies.read).not.toHaveBeenCalled();
    expect(dependencies.publicLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^mamluk-public-atlas:[a-f0-9]{64}$/),
      120,
      60000,
    );
    expect(dependencies.identity).not.toHaveBeenCalled();
  });
  it('serves anonymous public reference data while private and unknown worlds still require authentication', async () => {
    const atlasRequest = new Request(
      `https://qurabia.com/api/kingdoms/world-map/viewport?worldId=${PUBLIC_ATLAS_WORLD.id}&west=25&south=15&east=50&north=40`,
    );
    dependencies.identity.mockRejectedValue(new KingdomsHttpError(401, 'سجّل الدخول.'));
    expect((await GET(atlasRequest)).status).toBe(200);
    expect((await GET(request())).status).toBe(401);
    expect(dependencies.read).not.toHaveBeenCalled();
    dependencies.identity.mockResolvedValue({ id: 'alice', tokenVersion: 0 });
    dependencies.read.mockRejectedValue(new KingdomsHttpError(404, 'الخريطة غير متاحة.'));
    expect(
      (
        await GET(
          new Request(
            atlasRequest.url.replace(PUBLIC_ATLAS_WORLD.id, `${PUBLIC_ATLAS_WORLD.id}-private`),
          ),
        )
      ).status,
    ).toBe(404);
    expect(dependencies.read).toHaveBeenCalledOnce();
  });
  it('rate limits public atlas requests and rejects forged recipient parameters', async () => {
    const url = `https://qurabia.com/api/kingdoms/world-map/viewport?worldId=${PUBLIC_ATLAS_WORLD.id}&west=25&south=15&east=50&north=40`;
    dependencies.publicLimit.mockResolvedValue(false);
    expect((await GET(new Request(url))).status).toBe(429);
    expect((await GET(new Request(`${url}&playerId=enemy`))).status).toBe(400);
    expect(dependencies.read).not.toHaveBeenCalled();
  });
});

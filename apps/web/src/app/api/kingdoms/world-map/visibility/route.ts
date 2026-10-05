import { NextResponse } from 'next/server';
import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { KingdomsHttpError } from '@/lib/kingdoms/http';
import { PrismaWorldMapRepository } from '@/lib/mamluk-map/repository';
import type { VisibilityRegion } from '@mamluk/world-map-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };
export async function GET(request: Request) {
  try {
    const identity = await kingdomIdentity();
    await kingdomRateLimit(identity.id, false);
    const url = new URL(request.url);
    const worldId = url.searchParams.get('worldId');
    if (!worldId || worldId.length > 100) throw new KingdomsHttpError(400, 'معرف العالم غير صالح.');
    const repository = new PrismaWorldMapRepository(identity);
    const result = await repository.withSnapshot(
      worldId,
      { playerId: identity.id },
      async (session) => {
        const grants = await session.getVisibilityInBounds({
          bounds: { west: -180, east: 180, south: -90, north: 90 },
          limit: 1000,
        });
        const now = Date.now();
        const regions = grants.regions
          .filter((region: VisibilityRegion) => region.startsAt <= now && region.expiresAt > now)
          .map((region: VisibilityRegion) => ({
            id: region.id,
            worldId: region.worldId,
            kind: region.kind,
            geometry: region.geometry,
            startsAt: region.startsAt,
            expiresAt: region.expiresAt,
          }));
        return { worldId, regions, visibleTerritoryIds: grants.visibleTerritoryIds, visibleSultanateTerritoryIds: grants.visibleSultanateTerritoryIds };
      },
    );
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof KingdomsHttpError)
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error(
      '[mamluk-map] visibility unavailable',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return NextResponse.json(
      { error: 'تعذّر تحميل بيانات الرؤية.' },
      { status: 503, headers },
    );
  }
}

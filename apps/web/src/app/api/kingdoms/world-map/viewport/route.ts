import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  MapQueryError,
  WorldMapService,
  parseViewportRequest,
} from '@mamluk/world-map-core/server';
import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { KingdomsHttpError } from '@/lib/kingdoms/http';
import { PrismaWorldMapRepository } from '@/lib/mamluk-map/repository';
import {
  PUBLIC_ATLAS_VIEWER_ID,
  PUBLIC_ATLAS_WORLD,
  PublicAtlasRepository,
} from '@/lib/mamluk-map/public-atlas';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };

export async function GET(request: Request) {
  try {
    let viewport;
    try {
      viewport = parseViewportRequest(request.url);
    } catch {
      throw new KingdomsHttpError(400, 'نطاق الخريطة غير صالح.');
    }
    let repository;
    let playerId;
    if (viewport.worldId === PUBLIC_ATLAS_WORLD.id) {
      const ip = (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown').slice(
        0,
        256,
      );
      const key = createHash('sha256').update(ip).digest('hex');
      if (!(await checkRateLimit(`mamluk-public-atlas:${key}`, 120, 60000)))
        throw new KingdomsHttpError(429, 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.');
      playerId = PUBLIC_ATLAS_VIEWER_ID;
      repository = new PublicAtlasRepository(playerId);
    } else {
      const identity = await kingdomIdentity();
      await kingdomRateLimit(identity.id, false);
      playerId = identity.id;
      repository = new PrismaWorldMapRepository(identity);
    }
    const service = new WorldMapService(repository);
    const payload = await service.getViewport(viewport, { playerId });
    return NextResponse.json(payload, { headers });
  } catch (error) {
    const cause = error instanceof MapQueryError ? error.cause : error;
    if (cause instanceof KingdomsHttpError) {
      return NextResponse.json({ error: cause.message }, { status: cause.status, headers });
    }
    console.error(
      '[mamluk-map] viewport unavailable',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return NextResponse.json(
      { error: 'تعذّر تحميل الخريطة. حاول مجددًا.' },
      { status: 503, headers },
    );
  }
}

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MapQueryError, parseViewportRequest } from '@mamluk/world-map-core/server';
import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { KingdomsHttpError } from '@/lib/kingdoms/http';
import { PrismaWorldMapRepository } from '@/lib/mamluk-map/repository';
import { MamlukViewportService } from '@/lib/mamluk-map/viewport-service';
import {
  PUBLIC_ATLAS_VIEWER_ID,
  PUBLIC_ATLAS_WORLD,
  PublicAtlasRepository,
} from '@/lib/mamluk-map/public-atlas';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, Authorization, X-Mamluk-Village-Buildings',
};

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
    const referenceAtlas = viewport.worldId === PUBLIC_ATLAS_WORLD.id;
    if (referenceAtlas) {
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
    // This namespace projects only fixed, neutral geographic landmarks. Private
    // campaigns keep the default span limits and all existing payload budgets.
    const service = new MamlukViewportService(
      repository,
      referenceAtlas ? { maxLongitudeSpan: 360, maxLatitudeSpan: 180 } : {},
    );
    const result = await service.getViewportResult(viewport, { playerId });
    // Schema v1 clients use a strict allowlist. Negotiate this additive field at
    // the HTTP boundary; the capability grants no extra ownership or visibility.
    const buildingsRequested = request.headers.get('X-Mamluk-Village-Buildings') === '1';
    const payload = {
      ...result.payload,
      layers: {
        ...result.payload.layers,
        cities: {
          ...result.payload.layers.cities,
          features: result.payload.layers.cities.features.map((feature) => {
            if (
              buildingsRequested &&
              !referenceAtlas &&
              feature.properties.ownerPlayerId === playerId
            )
              return feature;
            const properties = { ...feature.properties };
            delete properties.villageBuildings;
            return { ...feature, properties };
          }),
        },
      },
    };
    return NextResponse.json(payload, {
      headers: {
        ...headers,
        // The read-only atlas contains public geographic landmarks only.
        // Private campaigns still require their repository's explicit grant.
        'X-Mamluk-Public-Settlements': referenceAtlas || result.publicSettlements ? '1' : '0',
      },
    });
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

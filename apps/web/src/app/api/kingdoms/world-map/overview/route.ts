import { NextResponse } from 'next/server';
import { parseViewportRequest } from '@mamluk/world-map-core/server';
import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { KingdomsHttpError } from '@/lib/kingdoms/http';
import { readMapOverview } from '@/lib/mamluk-map/overview';

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
    const identity = await kingdomIdentity();
    await kingdomRateLimit(identity.id, false);
    return NextResponse.json(await readMapOverview(viewport, identity), { headers });
  } catch (error) {
    if (error instanceof KingdomsHttpError)
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error(
      '[mamluk-map] overview unavailable',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return NextResponse.json(
      { error: 'تعذّر تحميل الخريطة. حاول مجددًا.' },
      { status: 503, headers },
    );
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { KingdomsHttpError } from '@/lib/kingdoms/http';
import { readMapVillageLocation } from '@/lib/mamluk-map/location';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
const schema = z.object({ worldId: id, villageId: id }).strict();
export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const parsed = schema.safeParse(Object.fromEntries(search));
    if (!parsed.success || [...search.keys()].length !== 2)
      throw new KingdomsHttpError(400, 'طلب موقع القرية غير صالح.');
    const identity = await kingdomIdentity();
    await kingdomRateLimit(identity.id, false);
    return NextResponse.json(
      await readMapVillageLocation(parsed.data.worldId, parsed.data.villageId, identity),
      { headers },
    );
  } catch (error) {
    if (error instanceof KingdomsHttpError)
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error(
      '[mamluk-map] location unavailable',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return NextResponse.json({ error: 'تعذّر تحميل موقع القرية.' }, { status: 503, headers });
  }
}

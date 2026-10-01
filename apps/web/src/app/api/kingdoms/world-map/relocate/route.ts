import { worldIdSchema } from '@/lib/kingdoms/api-schema';
import { assertSameOrigin, jsonFailure, jsonSuccess, readCommandBody } from '@/lib/kingdoms/http';
import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { villageRelocationRequestSchema } from '@/lib/mamluk-map/relocation-request';
import {
  readVillageRelocation,
  relocateVillage,
} from '@/lib/mamluk-map/village-relocation-repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await kingdomIdentity();
    await kingdomRateLimit(identity.id, false);
    const query = new URL(request.url).searchParams;
    return jsonSuccess(
      await readVillageRelocation(
        worldIdSchema.parse(query.get('worldId')),
        worldIdSchema.parse(query.get('villageId')),
        identity,
      ),
    );
  } catch (error) {
    return jsonFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await kingdomIdentity();
    await kingdomRateLimit(identity.id, true);
    const input = villageRelocationRequestSchema.parse(await readCommandBody(request));
    return jsonSuccess(await relocateVillage(input, identity));
  } catch (error) {
    return jsonFailure(error);
  }
}

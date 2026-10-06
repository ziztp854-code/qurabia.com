import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { assertSameOrigin, jsonFailure, jsonSuccess, readCommandBody } from '@/lib/kingdoms/http';
import { gardenReadSchema, gardenSaveSchema } from '@/lib/kingdoms/palace-garden';
import { readPalaceGarden, savePalaceGarden } from '@/lib/kingdoms/palace-garden-repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await kingdomIdentity();
    await kingdomRateLimit(user.id, false);
    const query = new URL(request.url).searchParams;
    const { worldId, villageId } = gardenReadSchema.parse({
      worldId: query.get('worldId'), villageId: query.get('villageId'),
    });
    return jsonSuccess(await readPalaceGarden(worldId, villageId, user));
  } catch (error) {
    return jsonFailure(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await kingdomIdentity();
    await kingdomRateLimit(user.id, true);
    const { worldId, villageId, slots } = gardenSaveSchema.parse(await readCommandBody(request));
    return jsonSuccess(await savePalaceGarden(worldId, villageId, user, slots));
  } catch (error) {
    return jsonFailure(error);
  }
}

import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { assertSameOrigin, jsonFailure, jsonSuccess, readCommandBody } from '@/lib/kingdoms/http';
import { workshopReadSchema, workshopRequestSchema } from '@/lib/kingdoms/siege-workshop';
import { readSiegeWorkshop, commandSiegeWorkshop } from '@/lib/kingdoms/siege-workshop-repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await kingdomIdentity();
    await kingdomRateLimit(user.id, false);
    const query = new URL(request.url).searchParams;
    const { worldId, villageId } = workshopReadSchema.parse({
      worldId: query.get('worldId'),
      villageId: query.get('villageId'),
    });
    return jsonSuccess(await readSiegeWorkshop(worldId, villageId, user));
  } catch (error) {
    return jsonFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await kingdomIdentity();
    await kingdomRateLimit(user.id, true);
    const { worldId, villageId, action } = workshopRequestSchema.parse(
      await readCommandBody(request),
    );
    return jsonSuccess(await commandSiegeWorkshop(worldId, villageId, user, action));
  } catch (error) {
    return jsonFailure(error);
  }
}

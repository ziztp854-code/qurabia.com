import { commandRequestSchema, worldIdSchema } from '@/lib/kingdoms/api-schema';
import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { assertSameOrigin, jsonFailure, jsonSuccess, readCommandBody } from '@/lib/kingdoms/http';
import { commandKingdomWorld, readKingdomWorld } from '@/lib/kingdoms/repository';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await kingdomIdentity();
    await kingdomRateLimit(user.id, false);
    const worldId = worldIdSchema.parse(new URL(request.url).searchParams.get('worldId'));
    return jsonSuccess(await readKingdomWorld(worldId, user));
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await kingdomIdentity();
    await kingdomRateLimit(user.id, true);
    const { worldId, idempotencyKey, command } = commandRequestSchema.parse(
      await readCommandBody(request),
    );
    return jsonSuccess(await commandKingdomWorld(worldId, user, idempotencyKey, command));
  } catch (error) {
    return jsonFailure(error);
  }
}

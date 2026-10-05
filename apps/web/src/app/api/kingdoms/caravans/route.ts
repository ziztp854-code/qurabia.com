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
    const result = await readKingdomWorld(worldId, user);
    const worldId_ = (result as Record<string, unknown>).worldId ?? (result as Record<string, unknown>).id;
    const worldName = (result as Record<string, unknown>).worldName ?? (result as Record<string, unknown>).name;
    return jsonSuccess({
      worldId: worldId_ as string,
      worldName: worldName as string,
      caravans: ((result as Record<string, unknown>).caravans ?? []) as unknown[],
      serverNow: (result as Record<string, unknown>).serverNow as number,
    });
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
    const result = await commandKingdomWorld(worldId, user, idempotencyKey, command);
    const worldId_ = (result as Record<string, unknown>).worldId ?? (result as Record<string, unknown>).id;
    return jsonSuccess({
      worldId: worldId_ as string,
      revision: (result as Record<string, unknown>).revision as number,
      caravans: ((result as Record<string, unknown>).caravans ?? []) as unknown[],
    });
  } catch (error) {
    return jsonFailure(error);
  }
}

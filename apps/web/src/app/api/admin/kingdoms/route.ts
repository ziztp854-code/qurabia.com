import { adminRequestSchema, worldIdSchema } from '@/lib/kingdoms/api-schema';
import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import {
  assertSameOrigin,
  jsonFailure,
  jsonSuccess,
  KingdomsHttpError,
  readCommandBody,
} from '@/lib/kingdoms/http';
import { createKingdomWorld, editKingdomWorld, readKingdomWorld } from '@/lib/kingdoms/repository';
import type { KingdomsMutationContext } from '@/lib/kingdoms/repository';
import { relocateVillageForAdministration } from '@/lib/mamluk-map/admin-village-relocation';
import { resourceKeys, type KingdomsWorld } from '@/lib/kingdoms/types';
import { advanceWorld } from '@/lib/kingdoms/engine';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await kingdomIdentity(true);
    await kingdomRateLimit(user.id, false);
    return jsonSuccess(
      await readKingdomWorld(
        worldIdSchema.parse(new URL(request.url).searchParams.get('worldId')),
        user,
        true,
      ),
    );
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await kingdomIdentity(true);
    await kingdomRateLimit(user.id, true);
    const input = adminRequestSchema.parse(await readCommandBody(request));
    if (input.action === 'create')
      return jsonSuccess(
        await createKingdomWorld(user, input.idempotencyKey, input.name, input.config),
      );
    const mutate = (
      state: KingdomsWorld,
      now: number,
      context: KingdomsMutationContext,
    ): KingdomsWorld => {
      if (input.action === 'pause') return state;
      if (state.season.status !== 'active')
        throw new KingdomsHttpError(409, 'الموسم منتهٍ. أنشئ عالمًا لموسم جديد.');
      if (input.action === 'relocate')
        return relocateVillageForAdministration(
          state,
          {
            worldId: input.worldId,
            villageId: input.villageId,
            administratorId: user.id,
            expectedOwnerId: input.expectedOwnerId,
            revision: context.revision,
            paused: context.paused,
          },
          { longitude: input.longitude, latitude: input.latitude },
          now,
        );
      if (input.action === 'season') {
        if (input.endsAt < now - 60_000 || input.endsAt > now + 365 * 86_400_000)
          throw new KingdomsHttpError(400, 'اختر موعدًا من الآن وحتى سنة واحدة.');
        return advanceWorld(
          { ...state, season: { ...state.season, endsAt: Math.max(now, input.endsAt) } },
          now,
        );
      }
      if (input.action === 'configure') {
        if (
          Object.values(state.villages).some(
            (v) =>
              Math.abs(v.x) > input.config.worldRadius || Math.abs(v.y) > input.config.worldRadius,
          )
        )
          throw new KingdomsHttpError(409, 'حدود الخريطة الجديدة تستبعد قرى قائمة.');
        return { ...state, config: input.config };
      }
      const village = Object.values(state.villages).find((v) => v.ownerId === input.playerId);
      if (!village) throw new KingdomsHttpError(404, 'المملكة غير موجودة.');
      const capacity =
        state.config.storageBase + village.buildings.warehouse * state.config.storagePerLevel;
      const resources = { ...village.resources };
      for (const resource of resourceKeys)
        resources[resource] = Math.min(capacity, resources[resource] + input.resources[resource]);
      return { ...state, villages: { ...state.villages, [village.id]: { ...village, resources } } };
    };
    return jsonSuccess(
      await editKingdomWorld(
        input.worldId,
        user,
        input.idempotencyKey,
        input,
        mutate,
        input.action === 'pause' ? input.paused : undefined,
      ),
    );
  } catch (error) {
    return jsonFailure(error);
  }
}

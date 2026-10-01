import 'server-only';
import type { Coordinates } from '@mamluk/world-map-core';
import { KingdomsHttpError } from '../kingdoms/http';
import { applyVillageRelocation, type VillageRelocationWorld } from './village-relocation';

/** Called only inside the existing authorized, locked and audited administrator transaction. */
export function relocateVillageForAdministration(
  state: VillageRelocationWorld,
  context: {
    readonly worldId: string;
    readonly administratorId: string;
    readonly villageId: string;
    readonly expectedOwnerId: string;
    readonly revision: number;
    readonly paused: boolean;
  },
  coordinates: Coordinates,
  serverTime: number,
): VillageRelocationWorld {
  const village = Object.hasOwn(state.villages, context.villageId)
    ? state.villages[context.villageId]
    : undefined;
  if (!village) throw new KingdomsHttpError(404, 'القرية غير متاحة.');
  if (village.ownerId !== context.expectedOwnerId)
    throw new KingdomsHttpError(409, 'تغيّر مالك القرية. حدّث العالم وراجع الاختيار.');
  // The owner is read from the locked village, never supplied by the administrator's request.
  // Reuse all one-use, military, season, geographic and collision checks without changing ownership.
  const relocated = applyVillageRelocation(
    state,
    {
      worldId: context.worldId,
      actorId: village.ownerId,
      villageId: context.villageId,
      revision: context.revision,
      paused: context.paused,
    },
    coordinates,
    serverTime,
  );
  return {
    ...state,
    geography: {
      ...relocated,
      villageRelocations: {
        ...relocated.villageRelocations,
        [context.villageId]: {
          actorId: context.administratorId,
          at: serverTime,
          longitude: coordinates.longitude,
          latitude: coordinates.latitude,
        },
      },
    },
  };
}

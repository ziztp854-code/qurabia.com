'use client';

import { accrueResources } from '@/lib/kingdoms/resource-accrual';
import { storageCapacity } from '@/lib/kingdoms/simulation';
import type { Village } from '@/lib/kingdoms/types';
import type { WorldView } from './shared';
import { useViewClock } from './use-view-clock';

// Display only: commands and affordability checks continue using the server snapshot.
export function resourceStockDeadline(view: WorldView) {
  if (view.paused || view.season.status === 'ended') return view.serverNow;
  let deadline = Math.min(view.serverNow + 15_000, view.season.endsAt);
  const limit = (at: number) => {
    deadline = Math.min(deadline, at);
  };
  for (const village of view.villages) {
    if (village.build) limit(village.build.endsAt);
    if (village.training) limit(village.training.endsAt);
  }
  for (const movement of view.movements) limit(movement.arrivesAt);
  for (const movement of view.incoming ?? []) limit(movement.arrivesAt);
  for (const caravan of view.caravans ?? []) {
    if (caravan.status === 'traveling') limit(caravan.arrivesAt);
  }
  return Math.max(view.serverNow, deadline);
}

export function useResourceStock(view: WorldView, village: Village) {
  const now = useViewClock(
    view,
    resourceStockDeadline(view),
    `${view.worldId}:${village.id}:resources`,
  );
  const rate = view.productionRates[village.id];
  return rate && now > view.serverNow
    ? accrueResources(
        village.resources,
        rate,
        now - view.serverNow,
        storageCapacity(view.config, village),
      )
    : village.resources;
}

import { reportOutbox } from './report-events';
import { report } from './simulation';
import type { KingdomsWorld, Siege } from './types';
/** Observe persisted lifecycle transitions without activating or changing siege rules.
 * Damage is accumulated into stage reports; individual damage ticks are never reports.
 * Existing projectSiegeView authorizes siege internals only to the siege owner.
 */
export function captureSiegeTransitions(previous: KingdomsWorld, current: KingdomsWorld) {
  for (const siege of Object.values(current.sieges ?? {})) {
    const old = previous.sieges?.[siege.id];
    if (old && old.stage === siege.stage) continue;
    emit(
      siege,
      old ? 'siege.stage' : 'siege.started',
      old ? 'تقدّم الحصار' : 'بدأ الحصار',
      Math.min(current.updatedAt, siege.stageStartedAt),
    );
  }
  for (const old of Object.values(previous.sieges ?? {}))
    if (!current.sieges?.[old.id]) emit(old, 'siege.closed', 'انتهى سجل الحصار', current.updatedAt);
  function emit(siege: Siege, key: string, title: string, at: number) {
    if (
      [...current.reports, ...reportOutbox(current)].some(
        (entry) =>
          entry.event?.key === key &&
          entry.event.sourceId === siege.id &&
          entry.event.siege?.stage === siege.stage,
      )
    )
      return;
    const village = siege.villageId ? current.villages[siege.villageId] : undefined;
    report(current, at, [siege.ownerId], title, `مرحلة الحصار: ${siege.stage}`, {
      event: {
        key,
        sourceId: siege.id,
        category: 'military',
        location: {
          name: village?.name ?? 'موقع الحصار',
          x: siege.targetX,
          y: siege.targetY,
          villageId: siege.villageId,
        },
        siege: {
          stage: siege.stage,
          wallDamage: siege.wallDamage,
          buildingDamage: { ...siege.buildingDamage },
        },
      },
    });
  }
}

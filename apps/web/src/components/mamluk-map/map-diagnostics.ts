type MapOperation = 'overview' | 'viewport';
type MapOutcome = 'aborted' | 'failed' | 'succeeded';

/** Records aggregate timings only; request bounds, world IDs and player data never enter the entry. */
export function startMapTiming(operation: MapOperation) {
  const clock = globalThis.performance;
  const startedAt = clock?.now();
  let finished = false;

  return (outcome: MapOutcome) => {
    if (finished || !clock || startedAt === undefined) return;
    finished = true;
    try {
      clock.measure(`qurabia.map.${operation}.${outcome}`, {
        start: startedAt,
        end: clock.now(),
      });
    } catch {
      // Diagnostics are optional and must never affect the map lifecycle.
    }
  };
}

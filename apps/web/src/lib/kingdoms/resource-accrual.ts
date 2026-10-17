import { resourceKeys, type Resources } from './types';

/** Keep fractional stock; hourly rates accrue continuously between server events. */
export function accrueResources(
  stock: Resources,
  hourly: Resources,
  elapsedMs: number,
  capacity: number,
): Resources {
  const hours = Math.max(0, elapsedMs) / 3_600_000;
  return Object.fromEntries(
    resourceKeys.map((key) => [key, Math.min(capacity, stock[key] + hourly[key] * hours)]),
  ) as Resources;
}

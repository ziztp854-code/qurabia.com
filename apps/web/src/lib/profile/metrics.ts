const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const SPARK_SAMPLE_LIMIT = 2000;
export const SPARK_WEEKS = 8;

export type SparkTrend = 'up' | 'down' | 'flat';
export type SparkTone = 'gold' | 'azure' | 'ivory' | 'muted';

export function startOfWeekWindow(weeks: number, now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setTime(start.getTime() - (weeks - 1) * WEEK_MS);
  return start;
}

export function bucketByWeek(
  dates: readonly Date[],
  weeks: number,
  now: Date,
): number[] {
  const start = startOfWeekWindow(weeks, now);
  const buckets = Array.from({ length: weeks }, () => 0);

  for (const date of dates) {
    const index = Math.floor((date.getTime() - start.getTime()) / WEEK_MS);
    if (index >= 0 && index < weeks) {
      buckets[index] += 1;
    }
  }

  return buckets;
}

export function sparkTrend(values: readonly number[]): SparkTrend {
  if (values.length < 2) return 'flat';
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'flat';
}

export function sparkTrendLabel(trend: SparkTrend): string {
  if (trend === 'up') return 'صاعد';
  if (trend === 'down') return 'هابط';
  return 'مستقر';
}

export function emptySeries(weeks = SPARK_WEEKS): number[] {
  return Array.from({ length: weeks }, () => 0);
}

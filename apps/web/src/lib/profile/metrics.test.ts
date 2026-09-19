import { describe, expect, it } from 'vitest';
import { bucketByWeek, emptySeries, sparkTrend, sparkTrendLabel, startOfWeekWindow } from './metrics';

describe('profile metrics', () => {
  it('يجمع التواريخ في نوافذ أسبوعية ثابتة', () => {
    const now = new Date('2026-08-22T12:00:00');
    const start = startOfWeekWindow(4, now);
    const dates = [
      start,
      new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000),
      new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 + 3_600_000),
      new Date(start.getTime() + 21 * 24 * 60 * 60 * 1000),
    ];

    expect(bucketByWeek(dates, 4, now)).toEqual([1, 2, 0, 1]);
  });

  it('يحدد اتجاه الخط المصغّر من أول قيمة وآخر قيمة', () => {
    expect(sparkTrend([1, 2, 4])).toBe('up');
    expect(sparkTrend([4, 2, 1])).toBe('down');
    expect(sparkTrend([2, 2])).toBe('flat');
    expect(sparkTrend([3])).toBe('flat');
  });

  it('يعيد سلسلة فارغة بطول معروف', () => {
    expect(emptySeries(3)).toEqual([0, 0, 0]);
  });

  it('يسمّي اتجاه الخط بالعربية', () => {
    expect(sparkTrendLabel('up')).toBe('صاعد');
    expect(sparkTrendLabel('down')).toBe('هابط');
    expect(sparkTrendLabel('flat')).toBe('مستقر');
  });
});

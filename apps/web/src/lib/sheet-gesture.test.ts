import { describe, expect, it } from 'vitest';
import { releaseVelocity, rubberBand, sheetSnap } from './sheet-gesture';

describe('sheet release intent', () => {
  it('distinguishes a flick from the same distance released after a pause', () => {
    const flick = releaseVelocity([{ y: 0, time: 0 }, { y: 40, time: 20 }]);
    expect(sheetSnap(40, flick, 600)).toBe(600);
    expect(releaseVelocity([{ y: 0, time: 0 }, { y: 40, time: 20 }, { y: 40, time: 200 }])).toBe(0);
    expect(sheetSnap(40, 0, 600)).toBe(0);
  });
  it('reverses an intended dismissal even beyond the previous distance threshold', () => {
    expect(sheetSnap(420, -500, 600)).toBe(0);
  });
  it('tracks in bounds and resists progressively without a hard stop', () => {
    expect(rubberBand(300, 600)).toBe(300);
    expect(rubberBand(-100, 600)).toBeLessThan(0);
    expect(rubberBand(700, 600)).toBeGreaterThan(600);
    expect(rubberBand(800, 600)).toBeGreaterThan(rubberBand(700, 600));
    expect(rubberBand(800, 600) - rubberBand(700, 600)).toBeLessThan(100);
  });
});

import { describe, expect, it } from 'vitest';
import {
  REFERENCE_IMAGE_CORNERS,
  REFERENCE_IMAGE_SIZE,
  pixelToReferenceGeographic,
} from './image-map-calibration';

describe('attached reference image calibration', () => {
  it('anchors the measured Egypt tripoint and preserves the source dimensions', () => {
    expect(REFERENCE_IMAGE_SIZE).toEqual({ width: 1859, height: 846 });
    const [longitude, latitude] = pixelToReferenceGeographic(737, 426);
    expect(longitude).toBe(25);
    expect(latitude).toBeCloseTo(22, 10);
  });

  it('returns MapLibre image corners clockwise from the top left', () => {
    expect(REFERENCE_IMAGE_CORNERS[0][0]).toBe(-67.125);
    expect(REFERENCE_IMAGE_CORNERS[1][0]).toBe(165.25);
    expect(REFERENCE_IMAGE_CORNERS[2][1]).toBeCloseTo(-28.66240899724393, 10);
    expect(REFERENCE_IMAGE_CORNERS[0][1]).toBeCloseTo(60.17716646565859, 10);
    expect(REFERENCE_IMAGE_CORNERS).toEqual([
      pixelToReferenceGeographic(0, 0),
      pixelToReferenceGeographic(1859, 0),
      pixelToReferenceGeographic(1859, 846),
      pixelToReferenceGeographic(0, 846),
    ]);
    expect(Object.isFrozen(REFERENCE_IMAGE_CORNERS)).toBe(true);
    expect(REFERENCE_IMAGE_CORNERS.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(REFERENCE_IMAGE_SIZE)).toBe(true);
  });

  it('exposes approximation instead of claiming a precise second-point fit', () => {
    const [longitude, latitude] = pixelToReferenceGeographic(729, 450);
    expect(longitude).toBe(24);
    // Known tripoint is 19.5N: image illustration residual is retained honestly.
    expect(latitude).toBeGreaterThan(19);
    expect(latitude).toBeLessThan(19.5);
  });

  it.each([
    [NaN, 0],
    [0, Infinity],
    [-1, 0],
    [0, -1],
    [1860, 0],
    [0, 847],
  ])('rejects invalid calibration pixel [%s, %s]', (x, y) =>
    expect(() => pixelToReferenceGeographic(x, y)).toThrow(RangeError),
  );
});

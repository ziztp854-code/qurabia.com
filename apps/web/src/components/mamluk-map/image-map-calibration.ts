export const REFERENCE_IMAGE_SIZE = Object.freeze({ width: 1859, height: 846 });
const PIXELS_PER_DEGREE = 8;
const RADIANS_PER_DEGREE = Math.PI / 180;
const ANCHOR_MERCATOR = Math.log(Math.tan(Math.PI / 4 + 11 * RADIANS_PER_DEGREE));

/**
 * Approximate artwork calibration only; NEVER use to compute game positions.
 * Source pixel [737,426] marks the Egypt/Libya/Sudan tripoint [25E,22N].
 * Nearby 24E boundary at x729 gives eight pixels per longitude degree.
 * Mercator vertical scale is an illustrative fit, not supplied source metadata.
 * Boundary control: library.law.fsu.edu/Digital-Collections/LimitsinSeas/pdf/ibs010.pdf
 */
export function pixelToReferenceGeographic(x: number, y: number): readonly [number, number] {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x > REFERENCE_IMAGE_SIZE.width ||
    y > REFERENCE_IMAGE_SIZE.height
  )
    throw new RangeError('Reference image calibration pixel is outside the image');
  const longitude = 25 + (x - 737) / PIXELS_PER_DEGREE;
  const mercator = ANCHOR_MERCATOR + ((426 - y) / PIXELS_PER_DEGREE) * RADIANS_PER_DEGREE;
  const latitude = (2 * Math.atan(Math.exp(mercator)) - Math.PI / 2) / RADIANS_PER_DEGREE;
  return Object.freeze([longitude, latitude] as const);
}

/** MapLibre image-source order: top-left, top-right, bottom-right, bottom-left. */
export const REFERENCE_IMAGE_CORNERS = Object.freeze([
  pixelToReferenceGeographic(0, 0),
  pixelToReferenceGeographic(REFERENCE_IMAGE_SIZE.width, 0),
  pixelToReferenceGeographic(REFERENCE_IMAGE_SIZE.width, REFERENCE_IMAGE_SIZE.height),
  pixelToReferenceGeographic(0, REFERENCE_IMAGE_SIZE.height),
] as const);

import type { MapPoint } from './world-terrain';

export const unit = 90;
/** Cells rendered beyond each edge so dragging reveals continuous land instead of a blank edge. */
export const margin = 3;
export const spans = [7, 9, 11, 13] as const;
export type Span = (typeof spans)[number];
export const cellKey = (x: number, y: number) => `${x},${y}`;

/** SVG coordinate of a cell centre relative to the first rendered column or row. */
export const cellCentre = (value: number, first: number) => (value - first + 0.5) * unit;

export function withinSpan(point: MapPoint, start: MapPoint, span: number, pad = 0) {
  return (
    point.x >= start.x - pad &&
    point.x < start.x + span + pad &&
    point.y >= start.y - pad &&
    point.y < start.y + span + pad
  );
}

/** A curved, purely visual route preview; the server alone decides the real path and timing. */
export function routePreview(origin: MapPoint | undefined, target: MapPoint, start: MapPoint) {
  if (!origin || (origin.x === target.x && origin.y === target.y)) return null;
  const ox = cellCentre(origin.x, start.x);
  const oy = cellCentre(origin.y, start.y);
  const tx = cellCentre(target.x, start.x);
  const ty = cellCentre(target.y, start.y);
  const length = Math.hypot(tx - ox, ty - oy);
  const bend = Math.min(0.18 * length, unit * 1.6);
  const cx = (ox + tx) / 2 + ((ty - oy) / length) * bend;
  const cy = (oy + ty) / 2 - ((tx - ox) / length) * bend;
  return {
    d: `M${ox} ${oy + 8}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${tx} ${ty + 8}`,
    mid: { x: (ox + 2 * cx + tx) / 4, y: (oy + 2 * cy + ty) / 4 },
    distance: Math.hypot(target.x - origin.x, target.y - origin.y),
  };
}

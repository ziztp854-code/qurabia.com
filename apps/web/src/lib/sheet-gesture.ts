export type PointerSample = { y: number; time: number };

export function releaseVelocity(samples: PointerSample[]) {
  const last = samples.at(-1);
  if (!last) return 0;
  const recent = samples.filter((sample) => last.time - sample.time <= 100);
  const first = recent[0];
  const elapsed = last.time - first.time;
  return elapsed > 0 ? ((last.y - first.y) / elapsed) * 1000 : 0;
}

export function rubberBand(position: number, height: number) {
  const boundary = Math.max(0, Math.min(height, position));
  const overshoot = position - boundary;
  return boundary + (overshoot * height * 0.55) / (height + 0.55 * Math.abs(overshoot));
}

export function sheetSnap(position: number, velocity: number, height: number) {
  const projected = position + (velocity / 1000) * 0.998 / (1 - 0.998);
  // A deliberate reversal overrides distance already travelled. Slow releases use proximity.
  if (Math.abs(velocity) > 80 && Math.sign(velocity) !== Math.sign(position - height / 2)) {
    return velocity > 0 ? height : 0;
  }
  return projected > height / 2 ? height : 0;
}

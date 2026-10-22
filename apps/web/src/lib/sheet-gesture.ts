export type PointerSample = { y: number; time: number };

export function releaseVelocity(samples: PointerSample[]) {
  const last = samples.at(-1);
  if (!last) return 0;
  const recent = samples.filter((sample) => last.time - sample.time <= 100);
  let end = recent.length - 1;
  // Ignore a short stationary pointer-up sample, but never carry momentum through a pause.
  while (end > 0 && recent[end - 1].y === recent[end].y) end--;
  if (!end || last.time - recent[end].time > 50) return 0;
  const direction = Math.sign(recent[end].y - recent[end - 1].y);
  let start = end - 1;
  while (start > 0 && recent[end].time - recent[start - 1].time <= 80) {
    const delta = recent[start].y - recent[start - 1].y;
    if (delta && Math.sign(delta) !== direction) break;
    start--;
  }
  const elapsed = recent[end].time - recent[start].time;
  return elapsed > 0 ? ((recent[end].y - recent[start].y) / elapsed) * 1000 : 0;
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

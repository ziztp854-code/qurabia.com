import type { QualitySettings } from './quality';
/** Two sustained visible windows before lowering AUTO; never upgrade in a loop.
 * Hidden/offscreen/paused time is excluded, and manual quality never calls it. */
export function createPalaceQualityMonitor(mode: QualitySettings['mode']) {
  let slow = 0;
  const target = mode === 'high' || mode === 'ultra' ? 60 : mode === 'medium' ? 30 : 20;
  return { sample(frames: number, elapsedMs: number, activeMs: number) {
    if (elapsedMs < 3000 || activeMs < elapsedMs * .95 || !Number.isFinite(activeMs)) { slow = 0; return null; }
    const fps = frames * 1000 / activeMs;
    slow = fps < target * .9 ? slow + 1 : 0;
    if (slow < 2) return null;
    return mode === 'high' || mode === 'ultra' ? 'medium' as const : mode === 'medium' ? 'low' as const : null;
  } };
}

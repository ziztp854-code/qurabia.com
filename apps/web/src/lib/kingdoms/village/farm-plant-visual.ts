import type { CropKey } from '../sultan-farm';

export const farmVisualStages = ['young', 'flowering', 'ripe'] as const;
export type FarmVisualStage = (typeof farmVisualStages)[number];
export type FarmGrowthStage = 'seed' | 'sprout' | 'growing' | 'fruiting' | 'ripe';

export function farmVisualStage(stage: FarmGrowthStage | 'preview'): FarmVisualStage {
  if (stage === 'ripe' || stage === 'preview') return 'ripe';
  if (stage === 'fruiting') return 'flowering';
  return 'young';
}

export function farmPlantAsset(crop: CropKey, stage: FarmVisualStage) {
  return `/game-art/kingdoms/city-scenes/sultan-farm-plants/${crop}-${stage}.webp`;
}

/** Keep photographic transitions aligned with the five authoritative growth stages. */
export function farmVisualBlend(progress: number) {
  if (progress < 0.75) return { young: 1, flowering: 0, ripe: 0 } as const;
  const ripe = Math.min(1, Math.max(0, (progress - 0.75) / 0.25));
  return { young: 0, flowering: 1 - ripe, ripe } as const;
}

/** A layered breeze keeps the root fixed while the canopy bends and flexes. */
export function farmWindPose(elapsedMs: number, phase: number, strength = 1) {
  const breeze = Math.sin(elapsedMs / 2600 + phase);
  const gust = Math.sin(elapsedMs / 7100 + phase * 0.47);
  return {
    rotation: (breeze * 0.012 + gust * 0.006) * strength,
    skewX: (breeze * 0.008 + gust * 0.004) * strength,
  };
}

import { describe, expect, it } from 'vitest';
import { cropKeys } from '../sultan-farm';
import {
  farmPlantAsset,
  farmVisualBlend,
  farmVisualStage,
  farmVisualStages,
  farmWindPose,
} from './farm-plant-visual';

describe('farm photographic plant visuals', () => {
  it('maps all ten crops and visual stages to stable public assets', () => {
    expect(cropKeys).toHaveLength(10);
    for (const crop of cropKeys)
      for (const stage of farmVisualStages)
        expect(farmPlantAsset(crop, stage)).toBe(
          `/game-art/kingdoms/city-scenes/sultan-farm-plants/${crop}-${stage}.webp`,
        );
  });

  it('keeps five game stages while selecting the closest photographic frame', () => {
    expect(
      (['seed', 'sprout', 'growing', 'fruiting', 'ripe'] as const).map(farmVisualStage),
    ).toEqual(['young', 'young', 'young', 'flowering', 'ripe']);
  });

  it('does not show flowers before the authoritative flowering stage', () => {
    expect(farmVisualBlend(0.74)).toEqual({ young: 1, flowering: 0, ripe: 0 });
    expect(farmVisualBlend(0.75)).toEqual({ young: 0, flowering: 1, ripe: 0 });
    expect(farmVisualBlend(0.875)).toEqual({ young: 0, flowering: 0.5, ripe: 0.5 });
    expect(farmVisualBlend(1)).toEqual({ young: 0, flowering: 0, ripe: 1 });
  });

  it('produces deterministic subtle wind without moving the root position', () => {
    expect(farmWindPose(0, 0)).toEqual({ rotation: 0, skewX: 0 });
    const pose = farmWindPose(1800, 2.4, 0.8);
    expect(Math.abs(pose.rotation)).toBeLessThan(0.02);
    expect(Math.abs(pose.skewX)).toBeLessThan(0.015);
  });
});

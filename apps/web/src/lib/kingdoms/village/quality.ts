import type { VillageQuality } from './types';

export type QualitySettings = Readonly<{
  mode: Exclude<VillageQuality, 'auto'>;
  fps: number;
  dpr: number;
  npcLimit: number;
  particles: boolean;
  environment: boolean;
}>;
export function resolveVillageQuality(
  mode: VillageQuality,
  device: { width: number; memory?: number; cores?: number; dpr?: number; saveData?: boolean },
): QualitySettings {
  const resolved =
    mode !== 'auto'
      ? mode
      : device.saveData || (device.memory !== undefined && device.memory <= 2)
        ? 'low'
        : device.width < 700 ||
            (device.memory !== undefined && device.memory <= 4) ||
            (device.cores !== undefined && device.cores <= 4)
          ? 'medium'
          : 'high';
  const preset =
    resolved === 'high'
      ? { fps: 60, dpr: 1.5, npcLimit: 40, particles: true, environment: true }
      : resolved === 'medium'
        ? { fps: 30, dpr: 1.25, npcLimit: 24, particles: true, environment: true }
        : { fps: 20, dpr: 1, npcLimit: 10, particles: false, environment: false };
  return { ...preset, mode: resolved, dpr: Math.min(preset.dpr, device.dpr ?? 1) };
}

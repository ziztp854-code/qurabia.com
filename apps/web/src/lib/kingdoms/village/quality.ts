import type { VillageQuality } from './types';

export type QualitySettings = Readonly<{
  mode: Exclude<VillageQuality, 'auto'>;
  fps: number;
  dpr: number;
  npcLimit: number;
  particles: boolean;
  environment: boolean;
}>;

const qualityPresets = {
  ultra: { fps: 60, dpr: 2, npcLimit: 56, particles: true, environment: true, maxPixels: 8_000_000, hardCap: 2.25 },
  high: { fps: 60, dpr: 1.5, npcLimit: 40, particles: true, environment: true, maxPixels: 4_200_000, hardCap: 2 },
  medium: { fps: 30, dpr: 1.25, npcLimit: 24, particles: true, environment: true, maxPixels: 2_500_000, hardCap: 1.5 },
  low: { fps: 20, dpr: 1, npcLimit: 10, particles: false, environment: false, maxPixels: 1_200_000, hardCap: 1.25 },
} as const;

export function capVillageDpr(
  presetDpr: number,
  device: { width: number; height?: number; dpr?: number },
  maxPixels: number,
  hardCap: number,
) {
  const raw = Math.min(presetDpr, device.dpr ?? 1, hardCap);
  const width = Math.max(1, device.width);
  const height = Math.max(1, device.height ?? Math.round(width * 0.62));
  const pixels = width * height * raw * raw;
  if (pixels <= maxPixels) return raw;
  return Math.max(1, Math.sqrt(maxPixels / (width * height)));
}

export function resolveVillageQuality(
  mode: VillageQuality,
  device: { width: number; height?: number; memory?: number; cores?: number; dpr?: number; saveData?: boolean },
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
          : device.width >= 2560 &&
              (device.memory === undefined || device.memory >= 8) &&
              (device.cores === undefined || device.cores >= 8)
            ? 'ultra'
            : 'high';
  const preset = qualityPresets[resolved];
  return {
    mode: resolved,
    fps: preset.fps,
    npcLimit: preset.npcLimit,
    particles: preset.particles,
    environment: preset.environment,
    dpr: capVillageDpr(preset.dpr, device, preset.maxPixels, preset.hardCap),
  };
}

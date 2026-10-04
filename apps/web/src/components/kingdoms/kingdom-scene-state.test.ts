import { describe, expect, it } from 'vitest';
import { defaultKingdomsConfig } from '@/lib/kingdoms/config';
import { buildingKeys, type Village } from '@/lib/kingdoms/types';
import { sceneBuildings } from './kingdom-scene-state';

const village: Village = {
  id: 'v1', ownerId: 'p1', name: 'القاهرة', x: 0, y: 0,
  resources: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
  updatedAt: 0,
  buildings: Object.fromEntries(buildingKeys.map((key) => [key, key === 'hall' ? 2 : 0])) as Village['buildings'],
  troops: { guard: 0, rider: 0, scout: 0, settler: 0 },
  reinforcements: {},
  build: { building: 'market', level: 1, startedAt: 100, endsAt: 300 },
};

describe('sceneBuildings', () => {
  it('keeps the server-owned plots and distinguishes built, queued and vacant land', () => {
    const buildings = sceneBuildings(village, defaultKingdomsConfig, 200);
    expect(buildings).toHaveLength(buildingKeys.length);
    expect(buildings.find((item) => item.key === 'stable')).toMatchObject({ built: false, level: 0 });
    expect(buildings.find((item) => item.key === 'hall')).toMatchObject({ built: true, busy: false, level: 2 });
    expect(buildings.find((item) => item.key === 'market')).toMatchObject({ built: false, busy: true, progress: 0.5 });
    expect(buildings.find((item) => item.key === 'farm')).toMatchObject({ built: false, busy: false, progress: 0 });
  });

  it('clamps progress when the server clock is outside the build interval', () => {
    expect(sceneBuildings(village, defaultKingdomsConfig, 50).find((item) => item.key === 'market')?.progress).toBe(0);
    expect(sceneBuildings(village, defaultKingdomsConfig, 500).find((item) => item.key === 'market')?.progress).toBe(1);
  });

  it('does not claim a progress percentage when an older build has no start time', () => {
    const legacy = { ...village, build: { building: 'market' as const, level: 1, endsAt: 300 } };
    expect(sceneBuildings(legacy, defaultKingdomsConfig, 200).find((item) => item.key === 'market'))
      .toMatchObject({ busy: true, progressKnown: false });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '../engine';
import {
  getVillageBuilding,
  getVillageVisualLevel,
  villageBuildingRegistry,
} from './buildingRegistry';
import { getVillagePlacement, getVillageRect, VILLAGE_WORLD } from './coordinates';
import { villageAssets } from './assetManifest';

function confirmedVillage() {
  const now = 1800000000000;
  return projectWorld(
    executeCommand(createWorld(now), 'player', { type: 'found', name: 'اختبار' }, now),
    'player',
    now,
  ).villages[0];
}

describe('Mamluk village presentation registry', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('shows the stable as part of the confirmed barracks, without a separate gameplay level', () => {
    const village = confirmedVillage();
    const building = getVillageBuilding('stable');
    const confirmed = {
      ...village,
      buildings: { ...village.buildings, barracks: 3 },
      build: { building: 'barracks' as const, level: 4, endsAt: village.updatedAt + 5000 },
    };
    expect(building).toMatchObject({
      classification: 'composite',
      building: 'barracks',
      interactive: true,
    });
    expect(getVillageVisualLevel('stable', confirmed)).toBe(3);
    expect(getVillageVisualLevel('archery', confirmed)).toBe(0);
  });

  it('places the stable beside training and keeps every reserved asset inside the existing world', () => {
    expect(getVillageRect('stable')).toEqual({ x: 454, y: 516, width: 111, height: 67 });
    expect(getVillagePlacement('stable')).toMatchObject({
      focusX: 509.5,
      focusY: 549.5,
      focusScale: 2.4,
    });
    expect(villageBuildingRegistry).toHaveLength(30);
    expect(new Set(villageBuildingRegistry.map(({ id }) => id)).size).toBe(30);
    for (const { id } of villageBuildingRegistry) {
      const rect = getVillageRect(id);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(VILLAGE_WORLD.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(VILLAGE_WORLD.height);
    }
  });

  it('reserves five transparent stable assets without requesting files that do not exist', () => {
    expect(villageAssets.buildings.stable).toHaveLength(5);
    expect(villageAssets.buildings.stable[2]).toMatchObject({
      id: 'stable-l3',
      filename: 'stable-l3.webp',
      src: null,
      placeholder: true,
      alpha: true,
      animated: false,
      frames: [],
      anchor: { x: 0.5, y: 1 },
      worldRect: { x: 454, y: 516, width: 111, height: 67 },
    });
    expect(villageAssets.base).toEqual({
      src: '/game-art/kingdoms/village-oasis.webp',
      width: 1536,
      height: 1024,
    });
  });

  it('ignores development previews in production and keeps server levels above L5 intact', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const village = confirmedVillage();
    const confirmed = { ...village, buildings: { ...village.buildings, barracks: 20 } };
    const preview = {
      building: 'stable' as const,
      buildingLevel: 1,
      rectOverrides: { stable: { x: 0, y: 0, width: 1, height: 1 } },
      placementOverrides: { stable: { focusX: 0, focusY: 0, focusScale: 5, zIndex: 0 } },
    };
    expect(getVillageVisualLevel('stable', confirmed, preview)).toBe(5);
    expect(confirmed.buildings.barracks).toBe(20);
    expect(getVillageRect('stable', preview)).toEqual({ x: 454, y: 516, width: 111, height: 67 });
    expect(getVillagePlacement('stable', preview)).toMatchObject({ focusX: 509.5, focusY: 549.5 });
    expect(
      getVillageVisualLevel('archery', confirmed, { building: 'archery', buildingLevel: 3 }),
    ).toBe(0);
  });

  it('allows calibration of future art only in a development preview', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      getVillageVisualLevel('archery', confirmedVillage(), {
        building: 'archery',
        buildingLevel: 3,
      }),
    ).toBe(3);
    expect(
      getVillagePlacement('stable', {
        placementOverrides: { stable: { focusX: 500, focusY: 540, zIndex: 600 } },
      }),
    ).toMatchObject({ x: 454, y: 516, focusX: 500, focusY: 540, zIndex: 600 });
  });
});

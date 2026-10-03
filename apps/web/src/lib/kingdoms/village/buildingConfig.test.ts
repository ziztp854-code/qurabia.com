import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '../engine';
import { buildingKeys } from '../types';
import {
  buildingPlots,
  containsPoint,
  rectCenter,
  villageRegions,
  VILLAGE_WORLD,
} from './coordinates';
import { getBuildingPresentation, villageBuildingSceneStatus } from './buildingConfig';

describe('village artwork mapping', () => {
  it('maps every real backend building to an area inside the unchanged artwork', () => {
    for (const building of buildingKeys) {
      const rect = buildingPlots[building];
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(VILLAGE_WORLD.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(VILLAGE_WORLD.height);
      expect(containsPoint(rect, rectCenter(rect))).toBe(true);
    }
  });
  it('keeps supplemental actions from intercepting the centers of real backend buildings', () => {
    for (const building of buildingKeys) {
      const center = rectCenter(buildingPlots[building]);
      for (const region of Object.values(villageRegions))
        expect(containsPoint(region, center)).toBe(false);
    }
  });
  it('uses confirmed levels, real resources and construction for visual states', () => {
    const now = 1800000000000;
    const view = projectWorld(
      executeCommand(createWorld(now), 'player', { type: 'found', name: 'اختبار' }, now),
      'player',
      now,
    );
    const village = {
      ...view.villages[0],
      buildings: { ...view.villages[0].buildings, farm: 1 },
      resources: { wood: 0, stone: 0, food: 0, iron: 0, gold: 0 },
    };
    expect(getBuildingPresentation('farm', village, view.config).status).toBe('shortage');
    const building = getBuildingPresentation(
      'farm',
      { ...village, build: { building: 'farm', level: 5, endsAt: now + 5000 } },
      view.config,
    );
    expect(building.status).toBe('construction');
    expect(building.level).toBe(1);
    expect(building.tier).toBe(1);
    expect(
      getBuildingPresentation(
        'farm',
        { ...village, buildings: { ...village.buildings, farm: 5 } },
        view.config,
      ).tier,
    ).toBe(5);
    expect(villageBuildingSceneStatus('farm', village)).toBe('جاهز');
    expect(
      villageBuildingSceneStatus('farm', {
        ...village,
        build: { building: 'farm', level: 2, endsAt: now + 5000 },
      }),
    ).toBe('قيد البناء');
    expect(
      villageBuildingSceneStatus('wall', {
        ...village,
        constructionQueue: [
          {
            id: 'q1',
            villageId: village.id,
            building: 'wall',
            fromLevel: 0,
            targetLevel: 1,
            queuedAt: now,
            startedAt: now + 1000,
            endsAt: now + 2000,
            cost: village.resources,
            status: 'QUEUED',
          },
        ],
      }),
    ).toBe('في الطابور');
    expect(
      villageBuildingSceneStatus('barracks', {
        ...village,
        buildings: { ...village.buildings, barracks: 1 },
        training: { unit: 'guard', count: 2, endsAt: now + 1000 },
      }),
    ).toBe('تدريب جارٍ');
  });
});

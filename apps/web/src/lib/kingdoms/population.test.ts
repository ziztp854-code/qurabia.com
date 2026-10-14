import { describe, expect, it } from 'vitest';
import { villagePopulation } from './population';
import { createWorld, executeCommand, projectWorldSnapshot } from './engine';
import { buildingKeys } from './types';

const at = 1000;
function fixture() {
  const world = executeCommand(createWorld(at), 'alice', { type: 'found', name: 'النيل' }, at);
  return { world, village: Object.values(world.villages)[0] };
}

describe('village civilian population', () => {
  it('supports existing villages and counts each completed building level', () => {
    const { village } = fixture();
    const emptyBuildings = Object.fromEntries(
      buildingKeys.map((key) => [key, 0]),
    ) as typeof village.buildings;
    expect(villagePopulation({ buildings: emptyBuildings })).toBe(50);
    for (const key of buildingKeys) {
      expect(villagePopulation({ buildings: { ...emptyBuildings, [key]: 3 } })).toBe(80);
    }
    expect(villagePopulation(village)).toBe(
      50 + Object.values(village.buildings).reduce((sum, level) => sum + level * 10, 0),
    );
  });

  it('changes only when queued construction finishes, independent of troops', () => {
    const { world, village } = fixture();
    const population = villagePopulation(village);
    const building = executeCommand(
      world,
      'alice',
      { type: 'build', villageId: village.id, building: 'hall' },
      at,
    );
    const endsAt = building.villages[village.id].build!.endsAt;
    const pending = projectWorldSnapshot(building, 'alice', endsAt - 1).view.villages[0];
    expect(villagePopulation(pending)).toBe(population);
    const completed = projectWorldSnapshot(building, 'alice', endsAt).view.villages[0];
    expect(villagePopulation(completed)).toBe(population + 10);
    const reinforced = { ...completed, troops: { ...completed.troops, guard: 9999 } };
    expect(villagePopulation(reinforced)).toBe(population + 10);
    expect(villagePopulation(building.villages[village.id])).toBe(population);
  });
});

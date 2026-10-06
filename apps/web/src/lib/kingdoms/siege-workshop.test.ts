import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand } from './engine';
import {
  applyWorkshopAction,
  projectWorkshop,
  settleWorkshop,
  type WorkshopVillage,
} from './siege-workshop';

const now = 1800000000000;
function village(): WorkshopVillage {
  const world = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'سلطنة' }, now);
  const original = Object.values(world.villages)[0];
  return {
    ...original,
    buildings: { ...original.buildings, hall: 6 },
    resources: { wood: 10000, stone: 10000, iron: 10000, food: 10000, gold: 10000 },
    palaceGarden: { version: 1, slots: [] },
  } as WorkshopVillage;
}
describe('Workshop manufacturing public seam', () => {
  it('bounds request keys to the persisted 80 character receipt namespace', () => {
    expect(
      applyWorkshopAction(village(), { type: 'upgrade', key: 'a'.repeat(74) }, now).siegeWorkshop
        ?.level,
    ).toBe(1);
    expect(() =>
      applyWorkshopAction(village(), { type: 'upgrade', key: 'a'.repeat(75) }, now),
    ).toThrow();
  });
  it('pays actual village resources once and saves an authoritative manufacturing queue', () => {
    const original = village();
    const built = applyWorkshopAction(original, { type: 'upgrade', key: 'build-1' }, now);
    expect(built.resources.wood).toBe(9600);
    const crafting = applyWorkshopAction(
      built,
      { type: 'craft', key: 'craft-1', equipment: 'catapult', count: 2 },
      now,
    );
    expect(crafting.resources.wood).toBe(8000);
    expect(projectWorkshop(crafting, now).inventory.catapult).toBe(0);
    expect(projectWorkshop(crafting, now).queue).toHaveLength(1);
    expect(original.resources.wood).toBe(10000);
    expect(
      applyWorkshopAction(
        crafting,
        { type: 'craft', key: 'craft-1', equipment: 'catapult', count: 2 },
        now,
      ),
    ).toEqual(crafting);
  });
  it('repairs only genuine damaged equipment and settles it through the server queue', () => {
    const built = applyWorkshopAction(village(), { type: 'upgrade', key: 'build-2' }, now);
    const damaged = {
      ...built,
      siegeWorkshop: {
        ...built.siegeWorkshop!,
        damaged: { catapult: 1, ballista: 0, 'siege-tower': 0 },
      },
    };
    const repair = applyWorkshopAction(
      damaged,
      { type: 'repair', key: 'repair-1', equipment: 'catapult', count: 1 },
      now,
    );
    expect(repair.resources.wood).toBe(9400);
    expect(projectWorkshop(repair, now).inventory.catapult).toBe(0);
    expect(projectWorkshop(repair, now).damaged.catapult).toBe(0);
    expect(
      projectWorkshop(settleWorkshop(repair, now + 300000), now + 300000).inventory.catapult,
    ).toBe(1);
    expect(() =>
      applyWorkshopAction(
        repair,
        { type: 'repair', key: 'repair-2', equipment: 'catapult', count: 1 },
        now,
      ),
    ).toThrow(/معدات متضررة/);
  });
  it('serializes manufacturing and unlocks higher equipment only at real workshop levels', () => {
    const original = village();
    expect(() =>
      applyWorkshopAction(
        original,
        { type: 'craft', key: 'unbuilt', equipment: 'catapult', count: 1 },
        now,
      ),
    ).toThrow(/المستوى/);
    let built = applyWorkshopAction(original, { type: 'upgrade', key: 'build' }, now);
    expect(() =>
      applyWorkshopAction(
        built,
        { type: 'craft', key: 'locked', equipment: 'ballista', count: 1 },
        now,
      ),
    ).toThrow(/المستوى 2/);
    built = applyWorkshopAction(
      built,
      { type: 'craft', key: 'first', equipment: 'catapult', count: 1 },
      now,
    );
    const second = applyWorkshopAction(
      built,
      { type: 'craft', key: 'second', equipment: 'catapult', count: 1 },
      now,
    );
    expect(projectWorkshop(second, now).queue[1].startedAt).toBe(now + 600000);
    expect(projectWorkshop(second, now).queue[1].endsAt).toBe(now + 1200000);
    const completed = settleWorkshop(second, now + 600000);
    expect(projectWorkshop(completed, now).inventory.catapult).toBe(1);
    expect(projectWorkshop(completed, now).queue).toHaveLength(1);
  });
  it.each([
    { type: 'craft', key: 'bad', equipment: 'catapult', count: -1 },
    { type: 'craft', key: 'bad', equipment: 'catapult', count: 1.5 },
    { type: 'craft', key: 'bad', equipment: 'catapult', count: 11 },
    { type: 'craft', key: 'bad', equipment: 'unknown', count: 1 },
    { type: 'upgrade', key: 'bad', level: 99 },
  ])('rejects untrusted action %j without changing a village', (input) => {
    const original = village(),
      saved = structuredClone(original);
    expect(() => applyWorkshopAction(original, input, now)).toThrow();
    expect(original).toEqual(saved);
  });
});

import { describe, expect, it } from 'vitest';
import { gardenSaveSchema, gardenSlotsSchema } from '../palace-garden';
import { getGardenProjection } from './garden-projection';
import { PALACE_WORLD, palaceGardenSlots, palaceSlotBounds } from './palace-scene-layout';

describe('compatible palace customization', () => {
  it('retains old saved placements and all six optional colours without adding a growth economy', () => {
    const legacy = [{ slotId: 0, itemId: 'red-roses' }];
    expect(gardenSlotsSchema.parse(legacy)).toEqual(legacy);
    const slots = ['red', 'yellow', 'blue', 'green', 'orange', 'brown'].map((color, slotId) => ({ slotId, itemId: 'tulips', color }));
    expect(gardenSaveSchema.parse({ worldId: 'world', villageId: 'village', slots }).slots).toEqual(slots);
    expect(gardenSlotsSchema.safeParse([{ slotId: 0, itemId: 'red-roses', color: 'unknown' }]).success).toBe(false);
    const model = palaceGardenSlots(gardenSlotsSchema.parse(slots), 2);
    expect(model[2].interactionState).toBe('selected'); expect(model[2].selectedColor).toBe('blue');
    expect(model[2].growthStage).toBe('mature'); expect(model[8].selectedPlant).toBeNull();
  });
  it('anchors registered transparent assets at ground level with correct aspect', () => {
    const rose = getGardenProjection('red-roses', 0), tree = getGardenProjection('cypress-tree', 0);
    expect(rose.anchorY).toBe(455 / 512); expect(tree.anchorY).toBe(498 / 512);
    expect(rose.width * PALACE_WORLD.width).toBeCloseTo(rose.height * PALACE_WORLD.height);
    expect(getGardenProjection('red-roses', 1).anchorY).toBe(428 / 512);
    expect(getGardenProjection('red-roses', 1, 'desktop').anchorY).toBe(455 / 512);
  });
  it('rejects unknown slot bounds and leaves existing ids intact', () => {
    expect(() => palaceSlotBounds(12)).toThrow(); expect(palaceGardenSlots([], null).map(slot => slot.id)).toEqual(Array.from({ length: 12 }, (_, id) => id));
    for (let first = 0; first < 12; first++) for (let next = first + 1; next < 12; next++) {
      const a = palaceSlotBounds(first), b = palaceSlotBounds(next);
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
  });
});

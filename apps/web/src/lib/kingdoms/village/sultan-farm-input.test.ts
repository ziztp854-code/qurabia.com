import { describe, expect, it } from 'vitest';
import { farmBedPoint, farmBeds } from './farm-scene-layout';
import {
  classifyFarmPointerMovement,
  findFarmBedAtPoint,
  pointInPolygon,
} from './sultan-farm-input';

describe('Sultan farm pointer input', () => {
  it('selects a point in the 60px rear extension without changing the soil polygon', () => {
    const [rearLeft, rearRight] = farmBeds[0];
    const point = {
      x: (rearLeft[0] + rearRight[0]) / 2,
      y: (rearLeft[1] + rearRight[1]) / 2 - 30,
    };

    expect(pointInPolygon(point, farmBeds[0])).toBe(false);
    expect(findFarmBedAtPoint(point)).toBe(0);
  });

  it('keeps movement within 5px as a tap and classifies larger movement as a drag', () => {
    const origin = { x: 100, y: 200 };

    expect(classifyFarmPointerMovement(origin, { x: 103, y: 204 })).toBe('tap');
    expect(classifyFarmPointerMovement(origin, { x: 104, y: 204 })).toBe('drag');
  });

  it.each(farmBeds.map((_, id) => id))('maps the photographed center of bed %i exactly', (id) => {
    expect(findFarmBedAtPoint(farmBedPoint(id))).toBe(id);
  });

  it('includes polygon edges and rejects paths outside the photographed garden', () => {
    expect(findFarmBedAtPoint({ x: farmBeds[0][0][0], y: farmBeds[0][0][1] })).toBe(0);
    expect(findFarmBedAtPoint({ x: 30, y: 30 })).toBeNull();
  });
});

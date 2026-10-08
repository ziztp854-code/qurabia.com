import { describe, expect, it } from 'vitest';
import { FARM_WORLD, farmBeds, farmBedBounds, farmBedPoint } from './farm-scene-layout';
describe('photographic farm projection', () => {
  it('keeps all 12 bed polygons and root samples within the selected image', () => {
    expect(farmBeds).toHaveLength(12);
    for (let id = 0; id < 12; id++) {
      for (const p of farmBeds[id]) {
        expect(p[0]).toBeGreaterThan(0);
        expect(p[0]).toBeLessThan(FARM_WORLD.width);
        expect(p[1]).toBeGreaterThan(0);
        expect(p[1]).toBeLessThan(FARM_WORLD.height);
      }
      for (const u of [0.18, 0.5, 0.82])
        for (const v of [0.18, 0.5, 0.82]) {
          const root = farmBedPoint(id, u, v);
          const edges = farmBeds[id].map((a, i) => {
            const b = farmBeds[id][(i + 1) % 4];
            return (b[0] - a[0]) * (root.y - a[1]) - (b[1] - a[1]) * (root.x - a[0]);
          });
          expect(edges.every((e) => e > 0) || edges.every((e) => e < 0)).toBe(true);
        }
      expect(farmBedBounds(id).height).toBeGreaterThan(120);
    }
  });
});

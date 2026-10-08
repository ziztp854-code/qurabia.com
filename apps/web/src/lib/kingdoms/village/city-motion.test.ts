import { describe, expect, it } from 'vitest';
import { sampleCityRoute, type CityActorRoute } from './city-motion';
import { getCityComposition } from './city-composition';

describe('distance-driven city movement', () => {
  const world = { width: 1000, height: 1000 };
  const route: CityActorRoute = { kind: 'worker', points: [{ x: .1, y: .5 }, { x: .11, y: .5 }, { x: .2, y: .5 }], duration: 20000, offset: 0, speed: 10, height: 14 };
  it('keeps cruise velocity across unequal segments and across refresh rates', () => {
    for (const time of [1200, 2400, 5400, 8800]) {
      for (const step of [1000 / 20, 1000 / 30, 1000 / 60]) {
        const a = sampleCityRoute(route, time, world), b = sampleCityRoute(route, time + step, world);
        expect(Math.hypot(b.x - a.x, b.y - a.y) / (step / 1000)).toBeCloseTo(10, 5);
      }
    }
  });
  it('slows, stops and turns while its feet are stationary', () => {
    const a = sampleCityRoute(route, 10800, world), b = sampleCityRoute(route, 11225, world), c = sampleCityRoute(route, 11600, world);
    expect(a.speed).toBe(0); expect(b.speed).toBe(0); expect(c.speed).toBe(0);
    expect([a.x, b.x, c.x]).toEqual([200, 200, 200]);
    expect(a.turnMix).toBe(0); expect(b.turnMix).toBeCloseTo(.5); expect(c.turnMix).toBe(1);
    expect(a.gait).toBe(b.gait);
  });
  it('supports empty/degenerate paths without nonfinite coordinates', () => {
    for (const points of [[], [{ x: .2, y: .3 }], [{ x: .2, y: .3 }, { x: .2, y: .3 }]]) {
      const result = sampleCityRoute({ ...route, points }, 100000, world);
      expect(Number.isFinite(result.x) && Number.isFinite(result.y)).toBe(true); expect(result.speed).toBe(0);
    }
  });
  it('keeps every authored route bounded and avoids the old vertical gate patrol', () => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const city = getCityComposition(viewport);
      for (const path of city.routes) {
        for (let time = 0; time < 100000; time += 100) {
          const point = sampleCityRoute(path, time, city.world);
          expect(point.speed).toBeLessThanOrEqual(path.speed! + .00001);
          expect(point.x).toBeGreaterThanOrEqual(Math.min(...path.points.map(p => p.x)) * city.world.width - .00001);
          expect(point.x).toBeLessThanOrEqual(Math.max(...path.points.map(p => p.x)) * city.world.width + .00001);
          expect(point.y).toBeGreaterThanOrEqual(Math.min(...path.points.map(p => p.y)) * city.world.height - .00001);
          expect(point.y).toBeLessThanOrEqual(Math.max(...path.points.map(p => p.y)) * city.world.height + .00001);
        }
      }
    }
  });
});

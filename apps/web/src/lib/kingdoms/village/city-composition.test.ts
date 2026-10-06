import { describe, expect, it } from 'vitest';
import { getCityComposition, getCityPlacement, cityActorPosition } from './city-composition';

describe('living city composition', () => {
  it('uses independently composed portrait art and a matching portrait world on mobile', () => {
    const city = getCityComposition({ width: 390, height: 844 });
    expect(city.id).toBe('portrait');
    expect(city.world).toEqual({ width: 900, height: 1600 });
    expect(city.asset).toBe('/game-art/kingdoms/city-hub/overview-portrait.webp');
    const palace = getCityPlacement('hall', city.id);
    expect(palace.x).toBeLessThan(450);
    expect(palace.x + palace.width).toBeGreaterThan(450);
    expect(palace.y + palace.height).toBeLessThan(560);
    expect(getCityComposition({ width: 1440, height: 900 }).asset).toBe('/game-art/kingdoms/city-hub/overview-desktop.webp');
  });

  it.each(['desktop', 'portrait'] as const)('keeps every landmark and actor inside the %s logical world', (id) => {
    const city = getCityComposition(id === 'desktop' ? { width: 1600, height: 900 } : { width: 900, height: 1600 });
    expect(city.landmarks.map((landmark) => landmark.id)).toEqual(expect.arrayContaining(['hall', 'stable', 'barracks', 'market', 'rally', 'siege', 'blacksmith', 'knowledge', 'mosque', 'residential', 'granary']));
    for (const landmark of city.landmarks) {
      expect(landmark.rect.x).toBeGreaterThanOrEqual(0);
      expect(landmark.rect.y).toBeGreaterThanOrEqual(0);
      expect(landmark.rect.x + landmark.rect.width).toBeLessThanOrEqual(city.world.width);
      expect(landmark.rect.y + landmark.rect.height).toBeLessThanOrEqual(city.world.height);
    }
    for (const route of city.routes) for (let elapsed = 0; elapsed < 60000; elapsed += 1000) {
      const point = cityActorPosition(route, elapsed, city.world);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(city.world.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(city.world.height);
    }
    expect(city.landmarks.find((landmark) => landmark.id === 'knowledge')?.classification).toBe('decoration');
    expect(city.landmarks.find((landmark) => landmark.id === 'blacksmith')?.target).toBe('siege');
    expect(city.landmarks.find((landmark) => landmark.id === 'granary')?.target).toBe('warehouse');
  });
});

import { describe, expect, it } from 'vitest';
import { getCityComposition, getCityPlacement, cityActorPosition, cityPointInReservedSite } from './city-composition';

describe('living city composition', () => {
  it.each(['desktop', 'portrait'] as const)('keeps %s vacant sites off existing building footprints and actor corridors', id => {
    const city = getCityComposition(id === 'desktop' ? {width:1600,height:900} : {width:900,height:1600});
    const sites = city.landmarks.filter(item => item.classification === 'reserved');
    expect(sites).toHaveLength(2);
    for (const site of sites) {
      expect(cityPointInReservedSite({x:site.rect.x+site.rect.width/2,y:site.rect.y+site.rect.height/2},id)).toBe(true);
      for (const target of city.landmarks.filter(item => item.target)) {
        expect(site.rect.x >= target.rect.x + target.rect.width || site.rect.x + site.rect.width <= target.rect.x || site.rect.y >= target.rect.y + target.rect.height || site.rect.y + site.rect.height <= target.rect.y).toBe(true);
      }
      for (const route of city.routes) for (let elapsed=0;elapsed<60000;elapsed+=1000) {
        const point=cityActorPosition(route,elapsed,city.world);
        expect(point.x < site.rect.x || point.x > site.rect.x + site.rect.width || point.y < site.rect.y || point.y > site.rect.y + site.rect.height).toBe(true);
      }
    }
  });
  it('uses independently composed portrait art and a matching portrait world on mobile', () => {
    const city = getCityComposition({ width: 390, height: 844 });
    expect(city.id).toBe('portrait');
    expect(city.world).toEqual({ width: 900, height: 1600 });
    expect(city.asset).toBe('/game-art/kingdoms/city-hub/overview-portrait-planned.webp');
    const palace = getCityPlacement('hall', city.id);
    expect(palace.x).toBeLessThan(450);
    expect(palace.x + palace.width).toBeGreaterThan(450);
    expect(palace.y + palace.height).toBeLessThan(560);
    expect(getCityComposition({ width: 1440, height: 900 }).asset).toBe('/game-art/kingdoms/city-hub/overview-desktop-planned.webp');
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
    for (const id of ['knowledge', 'blacksmith']) {
      const site = city.landmarks.find((landmark) => landmark.id === id)!;
      expect(site.classification).toBe('reserved');
      expect(site.target).toBeUndefined();
    }
    expect(city.landmarks.find((landmark) => landmark.id === 'granary')?.target).toBe('warehouse');
  });
});

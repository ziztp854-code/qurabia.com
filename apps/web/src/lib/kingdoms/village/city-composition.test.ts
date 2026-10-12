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
    expect(city.asset).toBe('/game-art/kingdoms/city-hub/overview-portrait-gemini-hd.webp');
    expect(city.mobileAsset).toBe('/game-art/kingdoms/city-hub/overview-portrait-gemini-hd.webp');
    expect(city.avifAsset).toBe('/game-art/kingdoms/city-hub/overview-portrait-gemini-hd.avif');
    expect(city.native).toEqual({ width: 1536, height: 2752 });
    const palace = getCityPlacement('hall', city.id);
    expect(palace.x).toBeLessThan(450);
    expect(palace.x + palace.width).toBeGreaterThan(450);
    expect(palace.y + palace.height).toBeLessThan(560);
    const desktop = getCityComposition({ width: 1440, height: 900 });
    expect(desktop.asset).toBe('/game-art/kingdoms/city-hub/overview-desktop-gemini-hd.webp');
    expect(desktop.mobileAsset).toBe('/game-art/kingdoms/city-hub/overview-desktop-gemini-hd.webp');
    expect(desktop.avifAsset).toBe('/game-art/kingdoms/city-hub/overview-desktop-gemini-hd.avif');
    expect(desktop.native).toEqual({ width: 2730, height: 1536 });
    expect(city.landmarks.find((landmark) => landmark.id === 'hall')).toBeDefined();
  });

  it('aligns the desktop reserved sites with the two empty courtyards in the HD raster', () => {
    const city = getCityComposition({ width: 1440, height: 900 });
    const knowledge = city.landmarks.find((landmark) => landmark.id === 'knowledge')!;
    const blacksmith = city.landmarks.find((landmark) => landmark.id === 'blacksmith')!;
    expect({ x: knowledge.rect.x + knowledge.rect.width / 2, y: knowledge.rect.y + knowledge.rect.height / 2 }).toEqual(
      expect.objectContaining({ x: expect.closeTo(1208, 0), y: expect.closeTo(205, 0) }),
    );
    expect({ x: blacksmith.rect.x + blacksmith.rect.width / 2, y: blacksmith.rect.y + blacksmith.rect.height / 2 }).toEqual(
      expect.objectContaining({ x: expect.closeTo(1392, 0), y: expect.closeTo(542, 0) }),
    );
  });

  it.each(['desktop', 'portrait'] as const)('keeps adjacent %s building hit regions disjoint', (composition) => {
    const pairs = [['stable', 'siege'], ['mine', 'quarry']] as const;
    for (const [leftId, rightId] of pairs) {
      const left = getCityPlacement(leftId, composition);
      const right = getCityPlacement(rightId, composition);
      const overlap = left.x < right.x + right.width
        && left.x + left.width > right.x
        && left.y < right.y + right.height
        && left.y + left.height > right.y;
      expect(overlap, `${leftId} overlaps ${rightId}`).toBe(false);
    }
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

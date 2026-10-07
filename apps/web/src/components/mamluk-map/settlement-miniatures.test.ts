import { describe, expect, it } from 'vitest';
import { parseVillageBuildingLevels } from '@mamluk/world-map-core';
import { miniatureTier, ownedMiniature, villageMiniatureSvg } from './settlement-miniatures';

const palette = {
  stone: 'ivory',
  sand: 'tan',
  roof: 'goldenrod',
  leaf: 'olive',
  water: 'teal',
  ink: 'black',
};
describe('authorized village miniatures', () => {
  it('uses actual available buildings while leaving their placement illustrative', () => {
    const properties = {
      ownerPlayerId: 'viewer',
      villageBuildings: JSON.stringify({ hall: 12, farm: 4, barracks: 0, wall: 0 }),
    };
    const own = ownedMiniature(properties, 'viewer');
    expect(own).not.toBeNull();
    const svg = villageMiniatureSvg(3, palette, own!.levels);
    expect(svg).toContain('data-building="hall"');
    expect(svg).toContain('data-building="farm"');
    expect(svg).not.toContain('data-building="barracks"');
    expect(svg).not.toContain('data-building="treasury"');
    expect(ownedMiniature(properties, 'other')).toBeNull();
    expect(ownedMiniature(properties)).toBeNull();
  });
  it('rejects intelligence or injected data rather than rendering an untrusted summary', () => {
    for (const value of [
      JSON.stringify({ troops: 1000 }),
      JSON.stringify({ hall: -1 }),
      JSON.stringify({ hall: '12' }),
      '{',
      '{}',
      '[12]',
      JSON.stringify({ __proto__: {}, hall: 2, html: '<script>' }),
    ])
      expect(parseVillageBuildingLevels(value)).toBeNull();
    expect(parseVillageBuildingLevels(JSON.stringify({ hall: 12, wall: 4 }))).toEqual({
      hall: 12,
      wall: 4,
    });
  });
  it('changes architectural density only at the public level tiers', () => {
    expect([1, 5, 6, 10, 11, 20, 21, 30, 31, 40, 41, 50].map(miniatureTier)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
    const small = villageMiniatureSvg(1, palette),
      large = villageMiniatureSvg(6, palette);
    expect(large.length).toBeGreaterThan(small.length);
    expect(large).not.toContain('<text');
    expect(large).not.toContain('<script');
  });
});

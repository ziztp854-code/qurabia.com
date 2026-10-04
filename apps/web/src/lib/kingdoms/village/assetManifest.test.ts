import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveVillageAssetSrc,
  villageAssetFidelity,
  villageAssets,
  villageArtRenditions,
  villageBaseClassification,
} from './assetManifest';

function webpSize(relativeUrl: string) {
  const data = readFileSync(resolve('public', relativeUrl.slice(1)));
  expect(data.toString('ascii', 0, 4)).toBe('RIFF');
  expect(data.toString('ascii', 8, 12)).toBe('WEBP');
  const four = data.toString('ascii', 12, 16);
  if (four === 'VP8X') {
    return {
      width: 1 + data.readUIntLE(24, 3),
      height: 1 + data.readUIntLE(27, 3),
      alpha: (data[20] & 0x10) !== 0,
    };
  }
  return {
    width: data.readUInt16LE(26) & 0x3fff,
    height: data.readUInt16LE(28) & 0x3fff,
    alpha: false,
  };
}

describe('village asset manifest fidelity', () => {
  it('ships native responsive master renditions and preserves the quality resolver API', () => {
    expect(villageBaseClassification).toBe('NATIVE_MASTER_1672');
    expect(villageAssets.base.src).toBe('/game-art/kingdoms/village/mamluk-capital-1672.webp');
    for (const [fidelity, width] of [['standard', 960], ['hidpi', 1280], ['ultra', 1672]] as const) {
      expect(resolveVillageAssetSrc(villageAssets.base, fidelity)).toBe(`/game-art/kingdoms/village/mamluk-capital-${width}.webp`);
    }
    for (const rendition of villageArtRenditions) {
      const image = webpSize(rendition.webp);
      expect(image.width).toBe(rendition.width);
      expect(image.width / image.height).toBeCloseTo(16 / 9, 2);
      expect(image.alpha).toBe(false);
      expect(readFileSync(resolve('public', rendition.avif.slice(1))).length).toBeGreaterThan(0);
    }
    expect(resolveVillageAssetSrc(villageAssets.roads, 'hidpi')).toBeNull();
    expect(webpSize(villageAssets.environment.scaffold.src!)).toMatchObject({ alpha: true });
    expect(villageAssetFidelity('ultra')).toBe('ultra');
    expect(villageAssetFidelity('high')).toBe('hidpi');
    expect(villageAssetFidelity('medium')).toBe('standard');
    expect(villageAssetFidelity('low')).toBe('standard');
  });
  it('loads only the five independent resource buildings from genuine transparent tiers', () => {
    for (const building of ['lumber', 'quarry', 'mine', 'farm', 'treasury'] as const) {
      for (const [index, source] of [1, 1, 3, 5, 5].entries()) {
        const slot = villageAssets.buildings[building][index];
        expect(slot.src).toBe(`/game-art/kingdoms/village/buildings/${building}-l${source}.webp`);
        expect(slot.placeholder).toBe(false);
        expect(slot.fit).toBe('contain');
        expect(slot.fallbackCrop).toBeUndefined();
        for (const fidelity of ['standard', 'hidpi', 'ultra'] as const) {
          const src = resolveVillageAssetSrc(slot, fidelity)!;
          expect(webpSize(src).alpha).toBe(true);
          if (fidelity === 'ultra' && building === 'mine' && source === 5)
            expect(src).toContain('-ultra.webp');
        }
      }
    }
  });
  it('keeps embedded buildings and figures from loading old standalone cutouts', () => {
    for (const [building, tiers] of Object.entries(villageAssets.buildings)) {
      if (['lumber', 'quarry', 'mine', 'farm', 'treasury'].includes(building)) continue;
      for (const slot of tiers) {
        expect(slot.src).toBeNull();
        expect(slot.frames).toEqual([]);
        expect(slot.fallbackCrop).toBeUndefined();
      }
    }
    for (const slot of Object.values(villageAssets.npc)) {
      expect(slot.src).toBeNull();
      expect(slot.frames).toEqual([]);
      expect(slot.fallbackCrop).toBeUndefined();
    }
  });
});

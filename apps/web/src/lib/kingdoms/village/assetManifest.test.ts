import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveVillageAssetSrc,
  villageAssetFidelity,
  villageAssets,
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
  it('classifies the shipped oasis plate as low-resolution for 4K and never invents missing files', () => {
    expect(villageBaseClassification).toBe('LOW_RESOLUTION_FOR_4K');
    expect(villageAssets.base.src).toBe('/game-art/kingdoms/village-oasis.webp');
    expect(villageAssets.base.variants).toEqual({
      standard: '/game-art/kingdoms/village-oasis.webp',
      hidpi: '/game-art/kingdoms/village-oasis-hidpi.webp',
      ultra: '/game-art/kingdoms/village-oasis-ultra.webp',
    });
    expect(resolveVillageAssetSrc(villageAssets.base, 'ultra')).toBe(
      '/game-art/kingdoms/village-oasis-ultra.webp',
    );
    expect(resolveVillageAssetSrc(villageAssets.base, 'hidpi')).toBe(
      '/game-art/kingdoms/village-oasis-hidpi.webp',
    );
    expect(resolveVillageAssetSrc(villageAssets.base, 'standard')).toBe(
      '/game-art/kingdoms/village-oasis.webp',
    );
    expect(resolveVillageAssetSrc(villageAssets.roads, 'hidpi')).toBeNull();
    expect(resolveVillageAssetSrc(villageAssets.environment.scaffold, 'standard')).toBeNull();
    expect(villageAssetFidelity('ultra')).toBe('ultra');
    expect(villageAssetFidelity('high')).toBe('hidpi');
    expect(villageAssetFidelity('medium')).toBe('standard');
    expect(villageAssetFidelity('low')).toBe('standard');
    expect(webpSize(villageAssets.base.src)).toEqual({ width: 1536, height: 1024, alpha: false });
    expect(webpSize(villageAssets.base.variants.hidpi!)).toEqual({
      width: 3840,
      height: 2560,
      alpha: false,
    });
    expect(webpSize(villageAssets.base.variants.ultra!)).toEqual({
      width: 7680,
      height: 5120,
      alpha: false,
    });
  });
});
